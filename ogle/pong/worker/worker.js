// Cloudflare Worker — ping pong match log for cjre.pl/ogle/pong (Workers KV)
// GET  /matches          → [{id,a,b,sa,sb,t}]
// POST /matches {a,b,sa,sb} → appends a match
// DELETE /matches/:id    → removes a match (only the most recent one — "undo")
// Elo is computed client-side by replaying the log, so edits stay consistent.

const KEY = 'matches';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } });
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const load = async () => JSON.parse((await env.PONG.get(KEY)) || '[]');

    if (url.pathname === '/matches' && request.method === 'GET') return json(await load());

    if (url.pathname === '/matches' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const a = cleanName(body.a), b = cleanName(body.b);
      const sa = Number(body.sa), sb = Number(body.sb);
      if (!a || !b) return json({ error: 'need two names' }, 400);
      if (a.toLowerCase() === b.toLowerCase()) return json({ error: 'players must differ' }, 400);
      if (![sa, sb].every(s => Number.isInteger(s) && s >= 0 && s <= 99)) return json({ error: 'scores must be 0–99' }, 400);
      if (sa === sb) return json({ error: 'no ties in ping pong' }, 400);
      const list = await load();
      if (list.length >= 20000) return json({ error: 'log full' }, 507);
      const m = { id: crypto.randomUUID().slice(0, 8), a, b, sa, sb, t: Date.now() };
      list.push(m);
      await env.PONG.put(KEY, JSON.stringify(list));
      return json(m, 201);
    }

    const del = url.pathname.match(/^\/matches\/([\w-]+)$/);
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
