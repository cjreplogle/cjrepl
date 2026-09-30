// Cloudflare Worker — ping pong match log for cjre.pl/ogle/pong (Workers KV)
// GET  /matches          → [{id,a,b,sa,sb,t}]
// POST /matches {a,b,sa,sb} → appends a match
// DELETE /matches/:id    → removes a match (only the most recent one — "undo")
// Viewing gate (X-View: <VIEW_CODE secret>): only enforced while VIEW_CODE is set.
// Admin (X-Admin: <ADMIN_PASSWORD secret>): PUT /matches/:id edits, DELETE /matches/:id any match,
//   POST /rename {from,to} merges/renames a player everywhere, GET /admin checks the password.
// Elo is computed client-side by replaying the log, so edits stay consistent.

// ?g=fifa selects a separate log (football allows draws); default is ping pong.
const GAMES = { pong: { key: 'matches', draws: false }, fifa: { key: 'matches:fifa', draws: true } };
const CLASSES = ['MS1', 'MS2', 'MS3', 'MS4', 'Resident', 'Faculty', 'Other'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin, X-View',
};
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(syncSheet(env, false)); },
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const G = GAMES[url.searchParams.get('g')] || GAMES.pong, KEY = G.key;
    const load = async () => JSON.parse((await env.PONG.get(KEY)) || '[]');

    const isAdmin = !!env.ADMIN_PASSWORD && request.headers.get('X-Admin') === env.ADMIN_PASSWORD;
    const save = list => env.PONG.put(KEY, JSON.stringify(list));
    // Optional viewing passcode: set the VIEW_CODE secret to require it for everything
    // (reads and writes); unset it to open the site back up. Admins always pass.
    if (env.VIEW_CODE && !isAdmin && url.pathname !== '/admin' && request.headers.get('X-View') !== env.VIEW_CODE)
      return json({ error: 'passcode required', gate: true }, 401);
    // Spreadsheet sync review queue (admin): GET /pending, POST /pending/:key/approve|reject, POST /sync[?seed=1]
    if (url.pathname === '/sync' && request.method === 'POST') {
      if (!isAdmin) return json({ error: 'admin only' }, 401);
      return json(await syncSheet(env, url.searchParams.get('seed') === '1'));
    }
    if (url.pathname === '/pending' && request.method === 'GET') {
      if (!isAdmin) return json({ error: 'admin only' }, 401);
      return json(JSON.parse((await env.PONG.get('sheetPending')) || '[]'));
    }
    const pend = url.pathname.match(/^\/pending\/([^/]+)\/(approve|reject)$/);
    if (pend && request.method === 'POST') {
      if (!isAdmin) return json({ error: 'admin only' }, 401);
      const key = decodeURIComponent(pend[1]);
      const pending = JSON.parse((await env.PONG.get('sheetPending')) || '[]');
      const p = pending.find(x => x.key === key);
      if (!p) return json({ error: 'not pending' }, 404);
      if (pend[2] === 'approve') {
        const list = JSON.parse((await env.PONG.get('matches')) || '[]');
        const sa = p.games.filter(g => g[0] > g[1]).length, sb = p.games.length - sa;
        list.push({ id: crypto.randomUUID().slice(0, 8), a: p.a, b: p.b, sa, sb, games: p.games, t: Date.now(), src: 'sheet' });
        await env.PONG.put('matches', JSON.stringify(list));
      }
      const seen = new Set(JSON.parse((await env.PONG.get('sheetSeen')) || '[]')); seen.add(key);
      await env.PONG.put('sheetSeen', JSON.stringify([...seen]));
      await env.PONG.put('sheetPending', JSON.stringify(pending.filter(x => x.key !== key)));
      return json({ ok: true });
    }

    if (url.pathname === '/admin') return isAdmin ? json({ ok: true }) : json({ error: 'wrong password' }, 401);

    // Player profiles (class year), shared by both ladders: { lowercased name: { cls } }
    if (url.pathname === '/players') {
      const players = JSON.parse((await env.PONG.get('players')) || '{}');
      if (request.method === 'GET') return json(players);
      if (request.method === 'POST') {
        let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
        const key = cleanName(body.name).toLowerCase();
        const cls = String(body.cls || '').trim().slice(0, 12);
        if (!key) return json({ error: 'need a name' }, 400);
        if (cls && !CLASSES.includes(cls)) return json({ error: 'unknown class' }, 400);
        if (cls) players[key] = { ...players[key], cls }; else if (players[key]) delete players[key].cls;
        await env.PONG.put('players', JSON.stringify(players));
        return json(players[key] || {});
      }
    }

    if (url.pathname === '/matches' && request.method === 'GET') return json(await load());

    if (url.pathname === '/matches' && request.method === 'POST') {
      const v = await validate(request, G); if (v.error) return json(v, 400);
      const { a, b, sa, sb, body } = v;
      const list = await load();
      if (list.length >= 20000) return json({ error: 'log full' }, 507);
      const m = { id: crypto.randomUUID().slice(0, 8), a, b, sa, sb, t: Date.now() };
      if (v.games) m.games = v.games;
      if (v.a2) m.a2 = v.a2;
      if (v.b2) m.b2 = v.b2;
      if (body.wl === true) m.wl = true;
      list.push(m);
      await env.PONG.put(KEY, JSON.stringify(list));
      return json(m, 201);
    }

    const del = url.pathname.match(/^\/matches\/([\w-]+)$/);
    if (del && request.method === 'PUT') {
      if (!isAdmin) return json({ error: 'admin only' }, 401);
      const v = await validate(request, G); if (v.error) return json(v, 400);
      const list = await load(), m = list.find(x => x.id === del[1]);
      if (!m) return json({ error: 'no such match' }, 404);
      Object.assign(m, { a: v.a, b: v.b, sa: v.sa, sb: v.sb });
      if (v.games) m.games = v.games; else delete m.games;
      for (const k of ['a2', 'b2']) if (k in v.body) { if (v[k]) m[k] = v[k]; else delete m[k]; }
      if (v.body.wl === true) m.wl = true; else delete m.wl;
      await save(list);
      return json(m);
    }
    if (del && request.method === 'DELETE' && isAdmin) {
      const list = await load(), i = list.findIndex(x => x.id === del[1]);
      if (i < 0) return json({ error: 'no such match' }, 404);
      list.splice(i, 1); await save(list);
      return json({ ok: true });
    }
    if (url.pathname === '/rename' && request.method === 'POST') {
      if (!isAdmin) return json({ error: 'admin only' }, 401);
      let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const from = cleanName(body.from).toLowerCase(), to = cleanName(body.to);
      if (!from || !to) return json({ error: 'need names' }, 400);
      const list = await load(); let n = 0;
      for (const m of list) {
        for (const k of ['a', 'b', 'a2', 'b2']) if (m[k] && m[k].toLowerCase() === from) { m[k] = to; n++; }
      }
      if (list.some(m => { const e = [m.a, m.b, m.a2, m.b2].filter(Boolean).map(x => x.toLowerCase()); return new Set(e).size !== e.length; })) return json({ error: 'that would make someone play themselves' }, 409);
      await save(list);
      return json({ ok: true, changed: n });
    }
    if (del && request.method === 'DELETE') {
      const list = await load();
      if (!list.length || list[list.length - 1].id !== del[1]) return json({ error: 'can only undo the latest match' }, 409);
      list.pop();
      await env.PONG.put(KEY, JSON.stringify(list));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },
};

async function validate(request, G) {
  let body;
  try { body = await request.json(); } catch { return { error: 'bad json' }; }
  const a = cleanName(body.a), b = cleanName(body.b);
  const sa = Number(body.sa), sb = Number(body.sb);
  if (!a || !b) return { error: 'need two names' };
  const a2 = cleanName(body.a2), b2 = cleanName(body.b2);
  const everyone = [a, b, a2, b2].filter(Boolean).map(n => n.toLowerCase());
  if (new Set(everyone).size !== everyone.length) return { error: 'players must differ' };
  if (![sa, sb].every(s => Number.isInteger(s) && s >= 0 && s <= 99)) return { error: 'scores must be 0–99' };
  if (sa === sb && !G.draws) return { error: 'no ties in ping pong' };
  // optional per-game scores for a best-of match: [[p1, p2], ...]
  let games = null;
  if (Array.isArray(body.games) && body.games.length) {
    if (body.games.length > 7 || !body.games.every(g => Array.isArray(g) && g.length === 2 && g.every(x => Number.isInteger(x) && x >= 0 && x <= 99) && g[0] !== g[1]))
      return { error: 'bad game scores' };
    games = body.games;
  }
  return { a, b, a2, b2, sa, sb, body, games };
}

// ---- Google Sheet (Match Log tab) → pending review queue ----
const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1z5pIZXwxFKOTSYqgqK-tqGzqGMFdB3-vCdXDBBdZYss/gviz/tq?tqx=out:csv&sheet=Match%20Log';
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const pairKey = (a, b, games) => {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x < y ? `${x}|${y}|${games.map(g => g.join('-')).join(',')}` : `${y}|${x}|${games.map(g => g[1] + '-' + g[0]).join(',')}`;
};
async function syncSheet(env, seed) {
  const r = await fetch(SHEET_CSV, { cf: { cacheTtl: 0 } });
  if (!r.ok) return { error: 'sheet fetch ' + r.status };
  const rows = parseCSV(await r.text()).slice(2);   // two header rows
  const seen = new Set(JSON.parse((await env.PONG.get('sheetSeen')) || '[]'));
  const pending = JSON.parse((await env.PONG.get('sheetPending')) || '[]');
  const matches = JSON.parse((await env.PONG.get('matches')) || '[]');
  const onSite = new Set(matches.filter(m => m.games).map(m => pairKey(m.a, m.b, m.games)));
  let added = 0, skipped = 0;
  rows.forEach((c, i) => {
    const a = (c[1] || '').trim(), b = (c[2] || '').trim();
    if (!a || !b) return;
    const games = [[4, 5], [6, 7], [8, 9]].filter(([x, y]) => c[x] !== '' && c[y] !== '' && c[x] != null)
      .map(([x, y]) => [parseInt(c[x], 10), parseInt(c[y], 10)]).filter(g => g.every(Number.isInteger) && g[0] !== g[1]);
    if (!games.length) return;
    const key = `${(c[0] || '').trim()}|${pairKey(a, b, games)}|${i}`;
    if (seen.has(key) || pending.some(p => p.key === key)) return;
    if (seed || onSite.has(pairKey(a, b, games))) { seen.add(key); skipped++; return; }
    pending.push({ key, date: (c[0] || '').trim(), a, b, games, row: i + 3, found: Date.now() });
    added++;
  });
  await env.PONG.put('sheetSeen', JSON.stringify([...seen]));
  await env.PONG.put('sheetPending', JSON.stringify(pending));
  await env.PONG.put('sheetChecked', String(Date.now()));
  return { added, skipped, pending: pending.length };
}
