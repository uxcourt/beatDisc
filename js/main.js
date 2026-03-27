// /js/main.js
import { init } from "./state.js";
import { resize } from "./animation.js";
import { bindEvents } from "./events.js";
import { initAuth, handlePostCheckoutRedirect } from "./auth.js";

window.addEventListener("DOMContentLoaded", async () => {
  init();       // resolve DOM refs, sync initial values
  bindEvents(); // attach all listeners
  resize();     // compute geometry & draw once

  // Auth runs after the UI is ready so isPremium is set before
  // the user can interact with any premium controls.
  await initAuth();
 
  // Handle ?subscribed=1 / ?subscribed=0 redirects from Stripe Checkout.
  await handlePostCheckoutRedirect();
});
 