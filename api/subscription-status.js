// /api/subscription-status.js
// Returns the current user's subscription status.
// Called by the client on page load and after sign-in.
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Require a valid Supabase JWT in the Authorization header.
  const authHeader = req.headers['authorization'] || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    // No session — return free tier cleanly, not an error.
    res.status(200).json({ isPremium: false, status: null, reason: 'unauthenticated' });
    return;
  }

  // Verify the JWT and resolve the user ID.
  let userId;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${jwt}`
      }
    });
    if (!resp.ok) {
      res.status(200).json({ isPremium: false, status: null, reason: 'invalid_session' });
      return;
    }
    const user = await resp.json();
    userId = user?.id;
  } catch (e) {
    res.status(500).json({ error: 'Auth check failed', detail: e?.message });
    return;
  }

  if (!userId) {
    res.status(200).json({ isPremium: false, status: null, reason: 'no_user' });
    return;
  }

  // Look up the subscription via the customers join.
  // We find the customer row first, then the most recent active subscription.
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/subscriptions`);
    url.searchParams.set('select', 'id,status,current_period_end,cancel_at_period_end');
    url.searchParams.set('customer_id', `eq.${userId}`);
    // Order by most recently updated so if there are multiple rows we get the freshest.
    url.searchParams.set('order', 'updated_at.desc');
    url.searchParams.set('limit', '1');

    const resp = await fetch(url, {
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      res.status(500).json({ error: 'Subscription lookup failed', detail: text });
      return;
    }

    const rows = await resp.json();
    const sub  = rows?.[0];

    if (!sub) {
      res.status(200).json({ isPremium: false, status: null, reason: 'no_subscription' });
      return;
    }

    // A subscription grants premium access when active or trialing.
    // past_due gets a short grace period — Stripe retries for several days,
    // so we keep access on until the subscription is fully canceled.
    const premiumStatuses = ['active', 'trialing', 'past_due'];
    const isPremium = premiumStatuses.includes(sub.status);

    res.status(200).json({
      isPremium,
      status:              sub.status,
      currentPeriodEnd:    sub.current_period_end,
      cancelAtPeriodEnd:   sub.cancel_at_period_end
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error', detail: e?.message });
  }
};

module.exports.config = { runtime: 'nodejs20.x' };
