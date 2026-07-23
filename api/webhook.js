// / api/webhook.js
// Receives Stripe events and syncs subscription state to Supabase.
// Stripe calls this endpoint directly — there is no user session here.
// Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET;

// Supabase REST helpers -------------------------------------------------------

async function upsertSubscription(sub, customerId) {
  const row = {
    id:                   sub.id,
    customer_id:          customerId,
    stripe_price_id:      sub.items.data[0]?.price?.id ?? '',
    status:               sub.status,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end:   new Date(sub.current_period_end   * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at:          sub.canceled_at
                            ? new Date(sub.canceled_at * 1000).toISOString()
                            : null,
    trial_start:          sub.trial_start
                            ? new Date(sub.trial_start * 1000).toISOString()
                            : null,
    trial_end:            sub.trial_end
                            ? new Date(sub.trial_end * 1000).toISOString()
                            : null,
  };

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST',
    headers: {
      'apikey':        SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates'
    },
    body: JSON.stringify(row)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase upsert failed: ${resp.status} ${text}`);
  }
}

async function getCustomerByStripeId(stripeCustomerId) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/customers`);
  url.searchParams.set('stripe_customer_id', `eq.${stripeCustomerId}`);
  url.searchParams.set('select', 'id');

  const resp = await fetch(url, {
    headers: {
      'apikey':        SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  });

  if (!resp.ok) throw new Error(`Supabase customer lookup failed: ${resp.status}`);
  const rows = await resp.json();
  return rows?.[0]?.id ?? null;
}

// Raw body parsing (required for Stripe signature verification) ---------------

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      // Vercel already parsed the body — reconstruct raw bytes
      const raw = typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body));
      resolve(raw);
      return;
    }
    // Raw stream fallback
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// Main handler ----------------------------------------------------------------

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Stripe signature verification — rejects anything not from Stripe.
  let event;
  try {
    const rawBody = await getRawBody(req);
    const sig     = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error('[webhook] Signature verification failed:', e.message);
    res.status(400).json({ error: `Webhook signature invalid: ${e.message}` });
    return;
  }

  console.log(`[webhook] Received event: ${event.type}`);

  try {
    switch (event.type) {

      // -----------------------------------------------------------------------
      // Checkout completed: a new subscriber just paid.
      // The subscription object is not embedded in the session by default —
      // we retrieve it separately to get full subscription details.
      // -----------------------------------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const stripeCustomerId = session.customer;
        const subscriptionId   = session.subscription;

        const customerId = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) {
          console.error('[webhook] No customer row for stripe_customer_id:', stripeCustomerId);
          break;
        }

        // Retrieve full subscription object from Stripe.
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Subscription created: ${sub.id} → ${sub.status}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription created (belt-and-suspenders — may fire alongside checkout)
      // -----------------------------------------------------------------------
      case 'customer.subscription.created': {
        const sub              = event.data.object;
        const stripeCustomerId = sub.customer;

        const customerId = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) {
          console.error('[webhook] No customer row for stripe_customer_id:', stripeCustomerId);
          break;
        }

        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Subscription upserted (created): ${sub.id} → ${sub.status}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription updated: status change, renewal, payment recovery, etc.
      // -----------------------------------------------------------------------
      case 'customer.subscription.updated': {
        const sub              = event.data.object;
        const stripeCustomerId = sub.customer;

        const customerId = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) {
          console.error('[webhook] No customer row for stripe_customer_id:', stripeCustomerId);
          break;
        }

        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Subscription updated: ${sub.id} → ${sub.status}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Subscription deleted: canceled and period has ended.
      // -----------------------------------------------------------------------
      case 'customer.subscription.deleted': {
        const sub              = event.data.object;
        const stripeCustomerId = sub.customer;

        const customerId = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) {
          console.error('[webhook] No customer row for stripe_customer_id:', stripeCustomerId);
          break;
        }

        // Upsert with status=canceled so the row reflects final state.
        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Subscription deleted: ${sub.id}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Invoice payment succeeded: monthly renewal confirmed.
      // -----------------------------------------------------------------------
      case 'invoice.payment_succeeded': {
        const invoice          = event.data.object;
        const subscriptionId   = invoice.subscription;
        if (!subscriptionId) break;

        const stripeCustomerId = invoice.customer;
        const customerId       = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) break;

        // Retrieve fresh subscription state and sync it.
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Payment succeeded, subscription synced: ${sub.id}`);
        break;
      }

      // -----------------------------------------------------------------------
      // Invoice payment failed: renewal charge failed — mark past_due.
      // Stripe will retry; the subscription.updated event will also fire.
      // -----------------------------------------------------------------------
      case 'invoice.payment_failed': {
        const invoice          = event.data.object;
        const subscriptionId   = invoice.subscription;
        if (!subscriptionId) break;

        const stripeCustomerId = invoice.customer;
        const customerId       = await getCustomerByStripeId(stripeCustomerId);
        if (!customerId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(sub, customerId);
        console.log(`[webhook] Payment failed, subscription synced: ${sub.id} → ${sub.status}`);
        break;
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }
  } catch (e) {
    console.error('[webhook] Handler error:', e.message);
    // Still return 200 to Stripe — returning 4xx/5xx causes Stripe to retry.
    // Log the error but don't let it block Stripe's delivery confirmation.
    res.status(200).json({ received: true, warning: e.message });
    return;
  }

  res.status(200).json({ received: true });
};

module.exports.config = {runtime: 'nodejs20.x' };
