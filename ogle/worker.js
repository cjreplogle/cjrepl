// Cloudflare Worker — ruminations publisher
// Secrets to set in the dashboard (Settings → Variables → Secrets):
//   ADMIN_PASSWORD  — whatever password you want for the admin page
//   GITHUB_TOKEN    — a fine-grained PAT with Contents: Read & Write on cjrepl

const OWNER = 'cjreplogle';
const REPO  = 'cjrepl';
const PATH  = 'ogle/ruminations.json';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST')
      return new Response('method not allowed', { status: 405, headers: CORS });

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: 'bad request' }, 400); }

    const { password, body } = payload;

    if (!password || password !== env.ADMIN_PASSWORD)
      return json({ error: 'unauthorized' }, 401);

    if (!body || !body.trim())
      return json({ error: 'empty body' }, 400);

    const ghHeaders = {
      Authorization: 'token ' + env.GITHUB_TOKEN,
      'Content-Type': 'application/json',
      'User-Agent':   'ruminations-worker',
    };
    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    // Fetch current file
    const getRes = await fetch(apiUrl, { headers: ghHeaders });
    if (!getRes.ok) return json({ error: 'github fetch failed: ' + getRes.status }, 502);
    const file = await getRes.json();

    // Decode, prepend new post, re-encode
    const current = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))));
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    current.unshift({ date, body: body.trim() });
    const json_ = JSON.stringify(current, null, 2);
    const encoded = btoa(encodeURIComponent(json_).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode('0x' + p)));

    // Push update
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({ message: 'add rumination', content: encoded, sha: file.sha }),
    });
    if (!putRes.ok) {
      const err = await putRes.json();
      return json({ error: err.message || putRes.status }, 502);
    }

    return json({ ok: true });

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  },
};
