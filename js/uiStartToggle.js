// uiStartToggle.js
import { state } from "./state.js";
import { isIOS } from "./platform.js";

let vvCleanup = null;

/** Keep the #buttonWrapper aligned to the visual viewport (iOS/iPadOS only). */
export function layoutOverlayToVisualViewport() {
  const wrap = document.getElementById("buttonWrapper");
  const vv = window.visualViewport;
  if (!wrap) return;

  if (isIOS() && vv) {
    // Anchor overlay to the *visual* viewport box so children can be centered correctly
    wrap.style.position = "absolute";
    wrap.style.left = vv.pageLeft + "px";
    wrap.style.top = vv.pageTop + "px";
    wrap.style.width = Math.floor(vv.width) + "px";
    wrap.style.height = Math.floor(vv.height) + "px";
    // Clear opposing edges if previously set by CSS
    wrap.style.right = "";
    wrap.style.bottom = "";
  } else {
    // Non-iOS (or no visualViewport): let CSS handle a full-viewport overlay
    wrap.style.position = "fixed";
    wrap.style.left = "0";
    wrap.style.top = "0";
    wrap.style.right = "0";
    wrap.style.bottom = "0";
    wrap.style.width = "";
    wrap.style.height = "";
  }
}

// Call this once (e.g., from positionStartToggle()) to re-center after VV changes on iOS
function enableIOSViewportRecenter() {
  if (!isIOS() || !window.visualViewport || vvCleanup) return;

  let t = null;
  const onVV = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      // First ensure the overlay tracks the current visual viewport,
      // then recenter the button over the canvas.
      layoutOverlayToVisualViewport();
      // double-rAF to wait for layout to settle
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          positionStartToggleToCanvasCenter();
        })
      );
    }, 120);
  };

  window.visualViewport.addEventListener("resize", onVV);
  window.visualViewport.addEventListener("scroll", onVV);

  vvCleanup = () => {
    window.visualViewport.removeEventListener("resize", onVV);
    window.visualViewport.removeEventListener("scroll", onVV);
  };
}

/** Public API used by events.js: wait for canvas to stabilize, then center the button. */
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
      lastW = w;
      lastH = h;
    }

    if (stableFrames >= neededStable || performance.now() > deadline) {
      // Make sure the overlay is lined up with the visual viewport (iOS) first
      layoutOverlayToVisualViewport();
      positionStartToggleToCanvasCenter();
      return;
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

/** Alias expected by events.js */
export function positionStartToggle() {
  // Keep overlay synced (no-op on non-iOS), then center the button
  layoutOverlayToVisualViewport();
  waitForCanvasStabilizationThenPositionButton();
  enableIOSViewportRecenter(); // ensure hooks are active on iOS
}

/** Ensure parent is positioned so 50%/50% anchors to the container */
function ensurePositioningContext() {
  // Prefer the explicit container that fills the viewport
  const parent =
    document.getElementById("buttonWrapper") ||
    state.canvas?.parentElement ||
    document.body;
  const cs = window.getComputedStyle(parent);
  if (cs.position === "static") {
    parent.style.position = "relative"; // create a containing block
  }
  return parent;
}

/** Center the button; on iOS use rect-based px to stick to the canvas center. */
function positionStartToggleToCanvasCenter() {
  const btn = state.startToggle;
  const canvas = state.canvas;
  if (!btn || !canvas) return;

  const parent = ensurePositioningContext();
  if (btn.parentElement !== parent) parent.appendChild(btn);

  if (isIOS()) {
    // Robust on iOS: absolute px to the canvas center in page coords
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const bw = btn.offsetWidth || 0;
    const bh = btn.offsetHeight || 0;

    btn.style.position = "absolute";
    btn.style.transform = "none"; // avoid double-shifting
    btn.style.left = `${Math.round(cx - bw / 2)}px`;
    btn.style.top = `${Math.round(cy - bh / 2)}px`;
  } else {
    // Everyone else: transform centering inside the full-viewport container
    btn.style.position = "absolute";
    btn.style.left = "50%";
    btn.style.top = "50%";
    btn.style.transform = "translate(-50%, -50%)";
  }

  btn.style.zIndex = "10";
  btn.style.pointerEvents = "auto";
  if (getComputedStyle(btn).display === "none") btn.style.display = "block";
}
