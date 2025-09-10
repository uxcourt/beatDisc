// share.js
import { state } from "./state.js";
import { resize } from "./animation.js";

/** Apply a parsed pattern into state, then redraw. */
export function applyPattern(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
// ticks
  if (Array.isArray(parsed.ticks)) {
    state.ticks = parsed.ticks.map(t => ({
      circleIndex: Number(t.circleIndex) || 0,
      angle: Number(t.angle) || 0,
      sound: String(t.sound || "tick1")
    }));
  }

// volumes
  if (Array.isArray(parsed.volumes)) {
    state.ringVolumes = parsed.volumes.slice();
  }

// speed
  if (typeof parsed.speed === "number") {
    state.currentSpeed = parsed.speed;
    if (state.speedSlider) state.speedSlider.value = String(parsed.speed);
  } else if (typeof parsed.speed === "string" && !isNaN(+parsed.speed)) {
    state.currentSpeed = +parsed.speed;
    if (state.speedSlider) state.speedSlider.value = parsed.speed;
  }

// segments
  if (typeof parsed.segmentCount === "number") {
    state.segmentCount = parsed.segmentCount | 0;
    if (state.segmentInput) state.segmentInput.value = String(state.segmentCount);
  }

  resize();
  return true;
}

export function decodeBase64JSON(b64) {
  try {
    const json = atob(b64.replace(/^#/, ""));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function encodePatternToURL() {
  const data = {
    ticks: state.ticks.map(t => ({ circleIndex: t.circleIndex, angle: t.angle, sound: t.sound })),
    volumes: [...state.ringVolumes],
    speed: state.currentSpeed,
    segmentCount: state.segmentCount,
  };
  const b64 = btoa(JSON.stringify(data));
  return `${location.origin}${location.pathname}#${b64}`;
}

export function tryLoadFromHash() {
  const raw = location.hash || "";
  if (!raw || raw.length < 2) return;
  const parsed = decodeBase64JSON(raw);
  if (parsed) applyPattern(parsed);
}

// ===== Short-link helpers =====

export function buildPatternPayloadB64() {
  const data = {
    ticks: state.ticks.map(t => ({ circleIndex: t.circleIndex, angle: t.angle, sound: t.sound })),
    volumes: [...state.ringVolumes],
    speed: state.currentSpeed,
    segmentCount: state.segmentCount
  };
  return btoa(JSON.stringify(data));
}

/** Wait until DOM is ready *and* core UI bits exist (canvas & inputs) */
async function waitForAppReady() {
  // 1) DOM ready
  if (document.readyState === "loading") {
    await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  }

  // 2) App UI ready: wait until critical elements exist
  const readyCheck = () =>
    !!(state?.canvas && state?.segmentInput && state?.speedSlider && state?.startToggle);

  const start = performance.now();
  while (!readyCheck()) {
    // Give your init/bindEvents/main.js time to attach and render
    await new Promise(r => setTimeout(r, 16)); // ~1 frame
    if (performance.now() - start > 3000) break; // 3s safety cap
  }

  // 3) Give layout a frame
  await new Promise(r => requestAnimationFrame(() => r()));
}

let _shortIdHandled = false;
/** Load from ?s=<id>: expand → mirror to #<b64> → invoke known-good hash loader AFTER init. */
export async function tryLoadFromShortIdIfPresent() {
  if (_shortIdHandled) return false;

  const params = new URLSearchParams(location.search);
  const id = params.get('s');
  if (!id) return false;

  try {
    const res = await fetch(`/api/expand?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`expand failed: ${res.status}`);
    const { payloadB64 } = await res.json();

    // 0) Ensure the app is initialized before we apply anything.
    await waitForAppReady();

    // 1) Mirror into hash so we use the EXACT same code path as manual #<b64>.
    history.replaceState(null, '', `${location.pathname}#${payloadB64}`);
    _shortIdHandled = true;

    // 2) If your app uses a 'hashchange' listener for loading, trigger it.
    //    Otherwise, call tryLoadFromHash() directly on the next frame.
    const fireHashLoader = () => {
      // If you have a hashchange listener wired, dispatch it; it will call your loader.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      // Also call directly as a safety net in case the listener attaches later.
      requestAnimationFrame(() => tryLoadFromHash());
    };

    // Defer slightly to ensure any listeners attached at end of init are active.
    setTimeout(fireHashLoader, 0);

    return true;
  } catch (e) {
    console.error('[short expand]', e);
  }
  return false;
}
