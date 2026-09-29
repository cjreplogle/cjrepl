// Cloudflare Worker — ping pong match log for cjre.pl/ogle/pong (Workers KV)
// GET  /matches          → [{id,a,b,sa,sb,t}]
// POST /matches {a,b,sa,sb} → appends a match
// DELETE /matches/:id    → removes a match (only the most recent one — "undo")
// Admin (X-Admin: <ADMIN_PASSWORD secret>): PUT /matches/:id edits, DELETE /matches/:id any match,
//   POST /rename {from,to} merges/renames a player everywhere, GET /admin checks the password.
// Elo is computed client-side by replaying the log, so edits stay consistent.

// ?g=fifa selects a separate log (football allows draws); default is ping pong.
const GAMES = { pong: { key: 'matches', draws: false }, fifa: { key: 'matches:fifa', draws: true } };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin',
};
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const G = GAMES[url.searchParams.get('g')] || GAMES.pong, KEY = G.key;
    const load = async () => JSON.parse((await env.PONG.get(KEY)) || '[]');

    const isAdmin = !!env.ADMIN_PASSWORD && request.headers.get('X-Admin') === env.ADMIN_PASSWORD;
    const save = list => env.PONG.put(KEY, JSON.stringify(list));
    if (url.pathname === '/admin') return isAdmin ? json({ ok: true }) : json({ error: 'wrong password' }, 401);

    if (url.pathname === '/matches' && request.method === 'GET') return json(await load());

    if (url.pathname === '/matches' && request.method === 'POST') {
      const v = await validate(request, G); if (v.error) return json(v, 400);
      const { a, b, sa, sb, body } = v;
      const list = await load();
      if (list.length >= 20000) return json({ error: 'log full' }, 507);
      const m = { id: crypto.randomUUID().slice(0, 8), a, b, sa, sb, t: Date.now() };
      if (v.games) m.games = v.games;
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
        if (m.a.toLowerCase() === from) { m.a = to; n++; }
        if (m.b.toLowerCase() === from) { m.b = to; n++; }
      }
      if (list.some(m => m.a.toLowerCase() === m.b.toLowerCase())) return json({ error: 'that would make someone play themselves' }, 409);
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
  if (a.toLowerCase() === b.toLowerCase()) return { error: 'players must differ' };
  if (![sa, sb].every(s => Number.isInteger(s) && s >= 0 && s <= 99)) return { error: 'scores must be 0–99' };
  if (sa === sb && !G.draws) return { error: 'no ties in ping pong' };
  // optional per-game scores for a best-of match: [[p1, p2], ...]
  let games = null;
  if (Array.isArray(body.games) && body.games.length) {
    if (body.games.length > 7 || !body.games.every(g => Array.isArray(g) && g.length === 2 && g.every(x => Number.isInteger(x) && x >= 0 && x <= 99) && g[0] !== g[1]))
      return { error: 'bad game scores' };
    games = body.games;
  }
  return { a, b, sa, sb, body, games };
}
