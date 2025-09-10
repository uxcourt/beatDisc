// /api/debug-config.js
module.exports = async (req, res) => {
  res.status(200).json({
    supabaseUrlPresent: !!process.env.SUPABASE_URL,
    serviceRolePresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    runtime: 'node',
    host: req.headers.host
  });
};
module.exports.config = { runtime: 'nodejs20.x' }; // force Node runtime
//
