// Cloudflare Worker — private ruminations store (Workers KV)
// Secrets to set (Settings → Variables → Secrets, or `wrangler secret put`):
//   ADMIN_PASSWORD  — password for reading + publishing from admin.html
// Bindings (wrangler.toml):
//   RUMINATIONS     — KV namespace holding the entries array
//   RATE_LIMITER    — rate limit binding (publish only)
//
// GET   Authorization: Bearer <password>          → returns the entries array
// POST  { password, body, kind?, title? }        → prepends a new entry
//        kind: 'rumination' (default) | 'writing'; title only kept for writing.
//        Older entries have no kind and read as ruminations.
// POST  { password, action: 'update', id, title?, body?, collection? } → edits a writing piece
// POST  { password, action: 'delete', id }                              → removes an entry
// Every entry carries a stable `id`; ones saved before ids existed get one on the next GET.
// Entries never touch the public repo, so they are unreadable without the password.

const KEY = 'entries';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ---- read ----
    if (request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      const pw = auth.replace(/^Bearer\s+/i, '').trim();
      if (!pw || pw !== env.ADMIN_PASSWORD) return json({ error: 'unauthorized' }, 401);
      const raw = await env.RUMINATIONS.get(KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (list.some(e => !e.id)) {
        list.forEach(e => { if (!e.id) e.id = newId(); });
        await env.RUMINATIONS.put(KEY, JSON.stringify(list));
      }
      return json(list);
    }

    // ---- write ----
    if (request.method !== 'POST')
      return new Response('method not allowed', { status: 405, headers: CORS });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'too many requests' }, 429);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: 'bad request' }, 400); }

    const { password, body } = payload;
    const kind = payload.kind === 'writing' ? 'writing' : 'rumination';
    const title = kind === 'writing' && typeof payload.title === 'string'
      ? payload.title.trim().slice(0, 200) : '';
    if (!password || password !== env.ADMIN_PASSWORD)
      return json({ error: 'unauthorized' }, 401);

    if (payload.action === 'update' || payload.action === 'delete') {
      const raw = await env.RUMINATIONS.get(KEY);
      const list = raw ? JSON.parse(raw) : [];
      const i = list.findIndex(e => e.id && e.id === payload.id);
      if (i < 0) return json({ error: 'not found' }, 404);
      if (payload.action === 'delete') {
        list.splice(i, 1);
      } else {
        const e = list[i];
        if (typeof payload.body === 'string') {
          if (!payload.body.trim()) return json({ error: 'empty body' }, 400);
          e.body = payload.body.trim();
        }
        for (const f of ['title', 'collection']) {
          if (typeof payload[f] !== 'string') continue;
          const v = payload[f].trim().slice(0, 200);
          if (v) e[f] = v; else delete e[f];
        }
        e.edited = Date.now();
      }
      await env.RUMINATIONS.put(KEY, JSON.stringify(list));
      return json({ ok: true });
    }

    if (!body || !body.trim())
      return json({ error: 'empty body' }, 400);

    const raw = await env.RUMINATIONS.get(KEY);
    const list = raw ? JSON.parse(raw) : [];
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const entry = { id: newId(), date, body: body.trim(), kind, ts: Date.now() };
    if (title) entry.title = title;
    const collection = kind === 'writing' && typeof payload.collection === 'string'
      ? payload.collection.trim().slice(0, 200) : '';
    if (collection) entry.collection = collection;
    list.unshift(entry);
    await env.RUMINATIONS.put(KEY, JSON.stringify(list));

    return json({ ok: true });

    function newId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
