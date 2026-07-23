// /api/config.js
// Exposes public configuration values to the client.
// Only values that are safe to expose to the browser go here.
// The service role key and webhook secret NEVER appear here.

module.exports = (req, res) => {
  res.status(200).json({
    supabaseUrl:  process.env.SUPABASE_URL,
    supabaseAnon: process.env.SUPABASE_ANON_KEY,
  });
};

module.exports.config = { runtime: 'nodejs20.x' };