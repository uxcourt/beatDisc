//  /js/auth.js
// Handles Supabase Auth sign-in/sign-out and premium status.
// Sets state.isPremium and state.userEmail after resolving session.
// Imported by main.js — call initAuth() once on page load.

import { state } from './state.js';
import { drawFrameOnce } from './animation.js';

const SUPABASE_URL  = '__SUPABASE_URL__';   // replaced at build time — see note below
const SUPABASE_ANON = '__SUPABASE_ANON__';  // replaced at build time — see note below

// ---------------------------------------------------------------------------
// NOTE: Because Beat Disc is a plain ES-module app (no bundler/build step),
// environment variables can't be injected at build time the way Next.js would.
// The cleanest solution for a Vercel-hosted static site is a small config
// endpoint. Add /api/config.js (provided below) and this module fetches it
// once to get the public values. Alternatively, hardcode the anon key and
// Supabase URL here directly — both are safe to expose in client JS.
// ---------------------------------------------------------------------------

let _supabaseUrl  = null;
let _supabaseAnon = null;
let _session      = null;   // cached Supabase session object

// ---------------------------------------------------------------------------
// Config bootstrap
// Fetches public config from /api/config once, then caches it.
// ---------------------------------------------------------------------------
async function getConfig() {
  if (_supabaseUrl && _supabaseAnon) return;
  try {
    const resp = await fetch('/api/config');
    if (!resp.ok) throw new Error(`config ${resp.status}`);
    const cfg  = await resp.json();
    _supabaseUrl  = cfg.supabaseUrl;
    _supabaseAnon = cfg.supabaseAnon;
  } catch (e) {
    console.error('[auth] Failed to load config:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Supabase Auth REST helpers (no SDK — keeps the bundle zero-dependency)
// ---------------------------------------------------------------------------

async function getSession() {
  // Check localStorage for an existing Supabase session token.
  // Supabase stores the session under a key like sb-<ref>-auth-token.
  const stored = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(stored));
    const token  = parsed?.access_token;
    const expiry = parsed?.expires_at;   // unix timestamp (seconds)
    if (!token) return null;

    // If token is within 60 seconds of expiry, refresh it.
    const now = Math.floor(Date.now() / 1000);
    if (expiry && expiry - now < 60) {
      return await refreshSession(parsed.refresh_token, stored);
    }

    return parsed;
  } catch {
    return null;
  }
}

async function refreshSession(refreshToken, storageKey) {
  if (!refreshToken || !_supabaseUrl || !_supabaseAnon) return null;
  try {
    const resp = await fetch(`${_supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method:  'POST',
      headers: {
        'apikey':       _supabaseAnon,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!resp.ok) return null;
    const session = await resp.json();
    localStorage.setItem(storageKey, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Magic link redirect handler
// When Supabase redirects back after a magic link click, the session tokens
// arrive in the URL hash as #access_token=...&refresh_token=...&type=magiclink
// We detect that, exchange the tokens with Supabase to get a full session
// object, store it in localStorage (matching Supabase's own key format),
// then clean the fragment from the URL so it doesn't persist or interfere
// with the app's own hash-based pattern sharing.
// ---------------------------------------------------------------------------
async function handleAuthRedirect() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token=')) return;

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type         = params.get('type');

  // Only handle magiclink and recovery types — not pattern share hashes.
  if (!accessToken || !refreshToken) return;
  if (type !== 'magiclink' && type !== 'recovery' && type !== 'signup') return;

  // Clean the auth fragment from the URL immediately so it doesn't persist.
  // Use replaceState so the back button isn't affected.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  // Exchange the access token for a full session object including user data.
  try {
    const resp = await fetch(`${_supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey':        _supabaseAnon,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (!resp.ok) {
      console.error('[auth] Token exchange failed:', resp.status);
      return;
    }
    const user = await resp.json();

    // Build a session object that matches Supabase's localStorage format.
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    const session = {
      access_token:  accessToken,
      refresh_token: refreshToken,
      expires_in:    expiresIn,
      expires_at:    Math.floor(Date.now() / 1000) + expiresIn,
      token_type:    'bearer',
      user
    };

    // Store under the same key Supabase JS SDK uses: sb-<project-ref>-auth-token
    // Extract project ref from the Supabase URL (https://<ref>.supabase.co)
    const ref = (_supabaseUrl || '').match(/https?:\/\/([^.]+)/)?.[1] ?? 'project';
    const storageKey = `sb-${ref}-auth-token`;
    localStorage.setItem(storageKey, JSON.stringify(session));

    // Cache the session so getSession() doesn't need to re-read localStorage.
    _session = session;

    console.log('[auth] Magic link session stored for:', user.email);
  } catch (e) {
    console.error('[auth] handleAuthRedirect error:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Premium status check (calls our own serverless function)
// ---------------------------------------------------------------------------
async function fetchPremiumStatus(accessToken) {
  try {
    const resp = await fetch('/api/subscription-status', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!resp.ok) return { isPremium: false };
    return await resp.json();
  } catch {
    return { isPremium: false };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call once from main.js after init().
 * Resolves the session, checks premium status, updates state, redraws.
 */
export async function initAuth() {
  await getConfig();

  // Must run before getSession() — consumes the URL hash tokens if present
  // and writes them to localStorage so getSession() can find them.
  await handleAuthRedirect();

  _session = await getSession();

  if (_session?.access_token) {
    state.userEmail = _session.user?.email ?? null;
    const { isPremium, status, cancelAtPeriodEnd } = await fetchPremiumStatus(_session.access_token);
    state.isPremium          = isPremium;
    state.subscriptionStatus = status;
    state.cancelAtPeriodEnd  = cancelAtPeriodEnd ?? false;
  } else {
    state.isPremium          = false;
    state.subscriptionStatus = null;
    state.userEmail          = null;
  }

  updateSignInButton();
  drawFrameOnce();
}

/**
 * Send a magic-link email. Call this when the user submits their email
 * in the sign-in modal.
 * @param {string} email - The user's email address.
 * @param {string|null} redirectTo - Optional URL to redirect to after clicking
 *   the magic link. Used to preserve intent across the auth flow (e.g. '?checkout=1').
 */
export async function sendMagicLink(email, redirectTo = null) {
  await getConfig();
  if (!_supabaseUrl || !_supabaseAnon) throw new Error('Auth not configured');

  const body = { email };
  if (redirectTo) body.redirect_to = redirectTo;

  const resp = await fetch(`${_supabaseUrl}/auth/v1/magiclink`, {
    method:  'POST',
    headers: {
      'apikey':       _supabaseAnon,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.msg || err?.message || `Magic link failed (${resp.status})`);
  }
}

/**
 * Sign the current user out.
 */
export async function signOut() {
  await getConfig();
  const token = _session?.access_token;
  _session = null;

  // Clear Supabase session from localStorage.
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    .forEach(k => localStorage.removeItem(k));

  if (token && _supabaseUrl && _supabaseAnon) {
    // Best-effort server-side sign-out (non-blocking).
    fetch(`${_supabaseUrl}/auth/v1/logout`, {
      method:  'POST',
      headers: {
        'apikey':       _supabaseAnon,
        'Authorization': `Bearer ${token}`
      }
    }).catch(() => {});
  }

  state.isPremium          = false;
  state.subscriptionStatus = null;
  state.userEmail          = null;
  updateSignInButton();
  drawFrameOnce();
}

/**
 * Returns the current access token, or null if not signed in.
 * Used by checkout.js client call to attach the Authorization header.
 */
export function getAccessToken() {
  return _session?.access_token ?? null;
}

/**
 * Kick off the Stripe Checkout flow.
 * Redirects the browser to the Stripe-hosted checkout page.
 */
export async function startCheckout() {
  const token = getAccessToken();
  if (!token) {
    // Pass 'checkout' intent so the sign-in modal sends a magic link that
    // redirects back to /?checkout=1, automatically resuming the flow.
    showSignInModal('checkout');
    return;
  }

  try {
    const resp = await fetch('/api/checkout', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error || `Checkout failed (${resp.status})`);
    }
    const { url } = await resp.json();
    window.location.href = url;
  } catch (e) {
    console.error('[auth] Checkout error:', e.message);
    alert('Could not start checkout: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Handle the ?subscribed=1 redirect back from Stripe Checkout.
// Re-checks premium status so the UI updates immediately on return.
// ---------------------------------------------------------------------------
export async function handlePostCheckoutRedirect() {
  const params = new URLSearchParams(location.search);
  if (!params.has('subscribed')) return;

  // Clean the query string from the URL without a reload.
  history.replaceState(null, '', location.pathname + location.hash);

  if (params.get('subscribed') === '1') {
    // Poll subscription-status a couple of times — webhook may take a moment.
    let attempts = 0;
    const poll = async () => {
      attempts++;
      await initAuth();
      if (!state.isPremium && attempts < 5) {
        setTimeout(poll, 2000);
      }
    };
    await poll();
  }
}

// ---------------------------------------------------------------------------
// Handle the ?checkout=1 redirect back from a magic link with checkout intent.
// Automatically starts the Stripe checkout flow so the user doesn't have to
// re-trigger the premium feature a second time.
// ---------------------------------------------------------------------------
export async function handlePostAuthRedirect() {
  const params = new URLSearchParams(location.search);
  if (!params.has('checkout')) return;

  // Clean the query string from the URL without a reload.
  history.replaceState(null, '', location.pathname + location.hash);

  // Session must be resolved before we can start checkout.
  // initAuth() has already run by this point in main.js.
  if (!_session?.access_token) {
    console.warn('[auth] handlePostAuthRedirect: no session after initAuth — skipping checkout');
    return;
  }

  // Small delay to ensure the UI has fully settled after auth resolution.
  await new Promise(r => setTimeout(r, 300));
  await startCheckout();
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function updateSignInButton() {
  const btn = document.getElementById('signIn');
  if (!btn) return;
  if (state.userEmail) {
    btn.textContent = 'Sign out';
    btn.title       = state.userEmail;
  } else {
    btn.textContent = 'Sign in';
    btn.title       = '';
  }
}

export function showSignInModal(intent = null) {
  let modal = document.getElementById('signInModal');
  if (!modal) {
    modal = buildSignInModal(intent);
    document.body.appendChild(modal);
  } else {
    // Update intent on reuse so a returning unauthenticated user gets the
    // correct redirectTo even if the modal was previously built without intent.
    modal._intent = intent;
  }
  modal.style.display = 'flex';
}

export function showUpsellModal() {
  let modal = document.getElementById('upsellModal');
  if (!modal) {
    modal = buildUpsellModal();
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

function buildSignInModal(intent = null) {
  const overlay = document.createElement('div');
  overlay.id = 'signInModal';
  overlay._intent = intent; // store intent so it survives modal reuse
  overlay.style.cssText = `
    display:none; position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75);
    align-items:center; justify-content:center;
  `;

  overlay.innerHTML = `
    <div style="
      background:#1a1a1a; border:1px solid #0ff; border-radius:10px;
      padding:28px 32px; max-width:360px; width:90%; color:#fff;
      display:flex; flex-direction:column; gap:14px;
    ">
      <h2 style="margin:0; font-size:1.1rem; color:#0ff;">Sign in to Beat Disc</h2>
      <p style="margin:0; font-size:0.85rem; color:#aaa; line-height:1.5;">
        Enter your email — we'll send you a magic link. No password needed.
      </p>
      <input id="signInEmail" type="email" placeholder="you@example.com" style="
        background:#111; border:1px solid #444; border-radius:6px;
        color:#fff; padding:8px 12px; font-size:0.9rem; outline:none;
      "/>
      <div style="display:flex; gap:10px;">
        <button id="signInSubmit" style="
          flex:1; background:#0ff; color:#000; border:none; border-radius:6px;
          padding:9px; font-weight:600; cursor:pointer; font-size:0.9rem;
        ">Send magic link</button>
        <button id="signInCancel" style="
          background:#333; color:#fff; border:none; border-radius:6px;
          padding:9px 14px; cursor:pointer; font-size:0.9rem;
        ">Cancel</button>
      </div>
      <p id="signInMessage" style="margin:0; font-size:0.8rem; color:#0f0; min-height:1em;"></p>
    </div>
  `;

  // Wire up events after insertion.
  setTimeout(() => {
    const emailInput = overlay.querySelector('#signInEmail');
    const submitBtn  = overlay.querySelector('#signInSubmit');
    const cancelBtn  = overlay.querySelector('#signInCancel');
    const message    = overlay.querySelector('#signInMessage');

    cancelBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

    submitBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email) { message.textContent = 'Please enter your email.'; message.style.color = '#f66'; return; }
      submitBtn.disabled   = true;
      submitBtn.textContent = 'Sending…';
      message.textContent  = '';
      try {
        // If the modal was opened with checkout intent, embed ?checkout=1 in
        // the magic link redirect so the flow resumes automatically after sign-in.
        const currentIntent = overlay._intent;
        const redirectTo = currentIntent === 'checkout'
          ? `${window.location.origin}/?checkout=1`
          : null;
        await sendMagicLink(email, redirectTo);
        message.style.color  = '#0f0';
        message.textContent  = 'Check your email for the magic link!';
        submitBtn.textContent = 'Sent!';
      } catch (e) {
        message.style.color  = '#f66';
        message.textContent  = e.message;
        submitBtn.disabled   = false;
        submitBtn.textContent = 'Send magic link';
      }
    });
  }, 0);

  return overlay;
}

function buildUpsellModal() {
  const overlay = document.createElement('div');
  overlay.id = 'upsellModal';
  overlay.style.cssText = `
    display:none; position:fixed; inset:0; z-index:1000;
    background:rgba(0,0,0,0.75);
    align-items:center; justify-content:center;
  `;

  overlay.innerHTML = `
    <div style="
      background:#1a1a1a; border:1px solid #9922ff; border-radius:10px;
      padding:28px 32px; max-width:380px; width:90%; color:#fff;
      display:flex; flex-direction:column; gap:14px;
    ">
      <h2 style="margin:0; font-size:1.1rem; color:#9922ff;">Beat Disc Premium</h2>
      <p style="margin:0; font-size:0.9rem; color:#ccc; line-height:1.6;">
        Changing the segment count is a <strong style="color:#fff;">Premium</strong> feature.
        Subscribe to unlock:
      </p>
      <ul style="margin:0; padding-left:1.2em; font-size:0.85rem; color:#aaa; line-height:1.9;">
        <li>Custom segment count</li>
        <li>Quantize on/off</li>
        <li>Export &amp; import patterns</li>
        <li>Custom audio samples</li>
        <li>MIDI export</li>
        <li>Audio file export</li>
      </ul>
      <div style="display:flex; gap:10px; margin-top:4px;">
        <button id="upsellSubscribe" style="
          flex:1; background:#9922ff; color:#fff; border:none; border-radius:6px;
          padding:10px; font-weight:600; cursor:pointer; font-size:0.9rem;
        ">Subscribe — $X / month</button>
        <button id="upsellCancel" style="
          background:#333; color:#fff; border:none; border-radius:6px;
          padding:10px 14px; cursor:pointer; font-size:0.9rem;
        ">Not now</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    const subscribeBtn = overlay.querySelector('#upsellSubscribe');
    const cancelBtn    = overlay.querySelector('#upsellCancel');

    cancelBtn.addEventListener('click',    () => { overlay.style.display = 'none'; });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    subscribeBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      startCheckout();
    });
  }, 0);

  return overlay;
}
