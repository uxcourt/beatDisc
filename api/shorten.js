// /api/shorten.js
// Serverless function for Vercel (Node 18+). No client secrets leaked.

const SUPABASE_URL = process.env.SUPABASE_URL;                 // e.g. https://bezehwehcwxizlscrlud.supabase.co
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // keep server-only

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { payloadB64, id: desiredId } = req.body || {};
    if (typeof payloadB64 !== 'string' || payloadB64.length < 10) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      res.status(500).json({ error: 'Server not configured: missing env vars' });
      return;
    }

    // Size guard (adjust to your comfort)
    if (payloadB64.length > 100_000) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }

    const row = { payload_b64: payloadB64 };
    if (desiredId) {
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(desiredId)) {
        res.status(400).json({ error: 'Invalid id format' });
        return;
      }
      row.id = desiredId;
    }

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/short_links`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(row)
    });

    if (!insertResp.ok) {
      const text = await insertResp.text();
      // 409 = duplicate id, 401/403 = key/policy issues, etc.
      res.status(insertResp.status).json({ error: `Supabase insert failed`, detail: text });
      return;
    }

    const [created] = await insertResp.json();
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const shortUrl = `${proto}://${host}/s/${created.id}`;

    res.status(200).json({ id: created.id, shortUrl });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Server error' });
  }
};
