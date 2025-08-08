// /api/expand.js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = (req.query.id || '').toString().trim();
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server not configured: missing env vars' });
    return;
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/short_links`);
  url.searchParams.set('id', `eq.${id}`);
  url.searchParams.set('select', 'payload_b64');

  try {
    const resp = await fetch(url, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      res.status(resp.status).json({ error: 'Supabase select failed', detail: text });
      return;
    }

    const rows = await resp.json();
    if (!rows || !rows.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.status(200).json({ payloadB64: rows[0].payload_b64 });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
};
