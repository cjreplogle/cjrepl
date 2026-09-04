// Cloudflare Worker — private ruminations store (Workers KV)
// Secrets to set (Settings → Variables → Secrets, or `wrangler secret put`):
//   ADMIN_PASSWORD  — password for reading + publishing from admin.html
// Bindings (wrangler.toml):
//   RUMINATIONS     — KV namespace holding the entries array
//   RATE_LIMITER    — rate limit binding (publish only)
//
// GET   Authorization: Bearer <password>          → returns the entries array
// POST  { password, body }                        → prepends a new entry
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
      return json(raw ? JSON.parse(raw) : []);
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
    if (!password || password !== env.ADMIN_PASSWORD)
      return json({ error: 'unauthorized' }, 401);
    if (!body || !body.trim())
      return json({ error: 'empty body' }, 400);

    const raw = await env.RUMINATIONS.get(KEY);
    const list = raw ? JSON.parse(raw) : [];
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    list.unshift({ date, body: body.trim() });
    await env.RUMINATIONS.put(KEY, JSON.stringify(list));

    return json({ ok: true });

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
