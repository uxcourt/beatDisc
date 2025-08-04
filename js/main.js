// /js/main.js
import { init } from "./state.js";
import { resize } from "./animation.js";
import { bindEvents } from "./events.js";

window.addEventListener("DOMContentLoaded", () => {
  init();       // resolve DOM refs, sync initial values
  bindEvents(); // attach all listeners
  resize();     // compute geometry & draw once
});
