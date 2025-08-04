// uiStartToggle.js
import { state } from "./state.js";

/** Public API used by events.js */
export function waitForCanvasStabilizationThenPositionButton() {
  const target = state.canvas;
  if (!target) return;

  let lastW = target.clientWidth;
  let lastH = target.clientHeight;
  let stableFrames = 0;
  const neededStable = 3;
  const deadline = performance.now() + 800; // ms safety cap

  function poll() {
    const w = target.clientWidth;
    const h = target.clientHeight;

    if (w === lastW && h === lastH) {
      stableFrames++;
    } else {
      stableFrames = 0;
      lastW = w; lastH = h;
    }

    if (stableFrames >= neededStable || performance.now() > deadline) {
      positionStartToggleToCanvasCenter();
      return;
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

/** Alias expected by events.js */
export function positionStartToggle() {
  waitForCanvasStabilizationThenPositionButton();
}

/** Ensure parent is positioned so 50%/50% anchors to the canvas container */
function ensurePositioningContext() {
  const canvas = state.canvas;
  const parent = canvas?.parentElement || document.body;
  const cs = window.getComputedStyle(parent);
  if (cs.position === "static") {
    parent.style.position = "relative"; // create a containing block
  }
  return parent;
}

/** Center the button using left/top 50% and translate(-50%, -50%) */
function positionStartToggleToCanvasCenter() {
  const btn = state.startToggle;
  const canvas = state.canvas;
  if (!btn || !canvas) return;

  const parent = ensurePositioningContext();

  // Ensure the button is in the same positioned container as the canvas
  if (btn.parentElement !== parent) {
    parent.appendChild(btn);
  }

  // Transform-based centering (center of button aligns with parent center)
  btn.style.position = "absolute";
  btn.style.left = "50%";
  btn.style.top = "50%";
  btn.style.transform = "translate(-50%, -50%)";
  btn.style.zIndex = "10";
  btn.style.pointerEvents = "auto";

  // Make sure it’s not display:none so size is measurable
  if (getComputedStyle(btn).display === "none") {
    btn.style.display = "block";
  }
}
