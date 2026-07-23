// /api/checkout.js
// Creates a Stripe Checkout Session for the monthly subscription.
// Called by the client when a user clicks "Subscribe".
// Requires: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_PUBLISHABLE_KEY,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRICE_ID          = process.env.STRIPE_PRICE_ID;


module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Derive base URL from request so Stripe redirects back to the correct environment
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host  = req.headers['host'] || 'beatdis.co';
  const BASE_URL = `${proto}://${host}`;

  // The client sends the Supabase JWT so we can identify the user server-side.
  const authHeader = req.headers['authorization'] || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  // Verify the JWT and get the user from Supabase Auth.
  let user;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${jwt}`
      }
    });
    if (!resp.ok) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    user = await resp.json();
  } catch (e) {
    res.status(500).json({ error: 'Auth check failed', detail: e?.message });
    return;
  }

  const userId = user?.id;
  const email  = user?.email;
  if (!userId || !email) {
    res.status(401).json({ error: 'Could not resolve user identity' });
    return;
  }

  // Look up or create the customer row in public.customers.
  // We upsert so re-clicking subscribe is always safe.
  let stripeCustomerId;
  try {
    // Fetch existing customer row
    const selectUrl = new URL(`${SUPABASE_URL}/rest/v1/customers`);
    selectUrl.searchParams.set('id', `eq.${userId}`);
    selectUrl.searchParams.set('select', 'stripe_customer_id');

    const selectResp = await fetch(selectUrl, {
      headers: {
        'apikey':        SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });
    const rows = await selectResp.json();

    if (rows?.length && rows[0].stripe_customer_id) {
      // Already has a Stripe customer — reuse it.
      stripeCustomerId = rows[0].stripe_customer_id;
    } else {
      // Create a new Stripe customer.
      const customer = await stripe.customers.create({
        email,
        metadata: { supabase_uid: userId }
      });
      stripeCustomerId = customer.id;

      // Upsert into public.customers.
      await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
        method: 'POST',
        headers: {
          'apikey':        SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id:                 userId,
          stripe_customer_id: stripeCustomerId
        })
      });
    }
  } catch (e) {
    res.status(500).json({ error: 'Customer setup failed', detail: e?.message });
    return;
  }

  // Create the Stripe Checkout Session.
  try {
    const session = await stripe.checkout.sessions.create({
      mode:        'subscription',
      customer:    stripeCustomerId,
      line_items:  [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/?subscribed=1`,
      cancel_url:  `${BASE_URL}/?subscribed=0`,
      // Pre-fill the email so the user doesn't have to type it again.
      customer_email: stripeCustomerId ? undefined : email,
      metadata: { supabase_uid: userId }
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: 'Checkout session failed', detail: e?.message });
  }
};

module.exports.config = { runtime: 'nodejs20.x' };
