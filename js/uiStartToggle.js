// uiStartToggle.js
import { state } from "./state.js";
import { isIOS } from "./platform.js";

let vvCleanup = null;

// call this once (e.g., from positionStartToggle() after first load)
function enableIOSViewportRecenter() {
  if (!isIOS() || !window.visualViewport || vvCleanup) return;

  let t = null;
  const onVV = () => {
    // wait for visual viewport to settle a bit, then re-center
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      // do a double-rAF to ensure layout has caught up
      requestAnimationFrame(() => requestAnimationFrame(() => {
        positionStartToggleToCanvasCenter();
      }));
    }, 120);
  };

  window.visualViewport.addEventListener('resize', onVV);
  window.visualViewport.addEventListener('scroll', onVV);

  vvCleanup = () => {
    window.visualViewport.removeEventListener('resize', onVV);
    window.visualViewport.removeEventListener('scroll', onVV);
  };
}


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
  enableIOSViewportRecenter(); // ensure hooks are active on iOS
}

/** Ensure parent is positioned so 50%/50% anchors to the canvas container */
function ensurePositioningContext() {
  // Prefer the explicit container that fills the viewport
  const parent = document.getElementById("buttonWrapper")
     || state.canvas?.parentElement
     || document.body;
  const cs = window.getComputedStyle(parent);
  if (cs.position === "static") {
    parent.style.position = "relative"; // create a containing block
  }
  return parent;
}

function positionStartToggleToCanvasCenter() {
  const btn = state.startToggle;
  const canvas = state.canvas;
  if (!btn || !canvas) return;

  const parent = ensurePositioningContext();
  if (btn.parentElement !== parent) parent.appendChild(btn);

  // iOS/iPadOS: center by canvas rect in *page* pixels (most stable there)
  const isiOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isiOS) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const bw = btn.offsetWidth || 0;
    const bh = btn.offsetHeight || 0;

    btn.style.position = "absolute";
    btn.style.transform = "none";           // avoid double-shifting
    btn.style.left = `${Math.round(cx - bw / 2)}px`;
    btn.style.top  = `${Math.round(cy - bh / 2)}px`;
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

