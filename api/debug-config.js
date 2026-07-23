// /api/debug-config.js
module.exports = async (req, res) => {
  res.status(200).json({
    supabaseUrlPresent:    !!process.env.SUPABASE_URL,
    serviceRolePresent:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    webhookSecretPresent:  !!process.env.STRIPE_WEBHOOK_SECRET,
    webhookSecretPrefix:   (process.env.STRIPE_WEBHOOK_SECRET || '').slice(0, 12),
    runtime: 'node',
    host: req.headers.host
  });
};
module.exports.config = { runtime: 'nodejs20.x' };