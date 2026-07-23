//  /js/main.js
import { init } from "./state.js";
import { resize } from "./animation.js";
import { bindEvents } from "./events.js";
import { initAuth, handlePostAuthRedirect, handlePostCheckoutRedirect } from "./auth.js";

window.addEventListener("DOMContentLoaded", async () => {
  init();       // resolve DOM refs, sync initial values
  bindEvents(); // attach all listeners
  resize();     // compute geometry & draw once

  // Auth runs after the UI is ready so isPremium is set before
  // the user can interact with any premium controls.
  await initAuth();

  // Handle ?checkout=1 redirect from a magic link with checkout intent.
  // Must run after initAuth() so the session is resolved before checkout starts.
  await handlePostAuthRedirect();

  // Handle ?subscribed=1 / ?subscribed=0 redirects from Stripe Checkout.
  await handlePostCheckoutRedirect();
});
 