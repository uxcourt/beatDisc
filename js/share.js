// share.js
import { state } from "./state.js";
import { resize } from "./animation.js";

/** Validate and coerce a parsed pattern object into app state, then redraw. */
export function applyPattern(parsed) {
  if (!parsed || typeof parsed !== "object") return false;

  // ticks
  if (Array.isArray(parsed.ticks)) {
    // normalize: only keep known fields
    state.ticks = parsed.ticks.map(t => ({
      circleIndex: Number(t.circleIndex) || 0,
      angle: Number(t.angle) || 0,
      sound: String(t.sound || "tick1")
    }));
  }

  // ring volumes
  if (Array.isArray(parsed.volumes)) {
    // shallow copy to keep same shape
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

  // redraw & recalc geometry
  resize();
  return true;
}

/** Safely decode base64 JSON from a string (hash payload). */
export function decodeBase64JSON(b64) {
  try {
    const json = atob(b64.replace(/^#/, ""));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Build URL from current state (long hash). */
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

/** Load from current location.hash using applyPattern(). */
export function tryLoadFromHash() {
  const raw = location.hash || "";
  if (!raw || raw.length < 2) return;
  const parsed = decodeBase64JSON(raw);
  if (parsed) applyPattern(parsed);
}

// === Short-link helpers ===

/** Build the same base64 payload you currently put in the hash. */
export function buildPatternPayloadB64() {
  const data = {
    ticks: state.ticks.map(t => ({
      circleIndex: t.circleIndex,
      angle: t.angle,
      sound: t.sound
    })),
    volumes: [...state.ringVolumes],
    speed: state.currentSpeed,
    segmentCount: state.segmentCount
  };
  return btoa(JSON.stringify(data));
}

/** Wait until DOM is ready *and* core UI bits exist (canvas & inputs). */
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
    await new Promise(r => setTimeout(r, 16)); // ~1 frame
    if (performance.now() - start > 3000) break; // 3s safety cap
  }
  // 3) Give layout a frame
  await new Promise(r => requestAnimationFrame(() => r()));
}

let _shortIdHandled = false;
/** Load from ?s=<id>: expand → mirror to #<b64> → apply immediately → run the hash loader (after init). */
export async function tryLoadFromShortIdIfPresent() {
  if (_shortIdHandled) return false;

  const params = new URLSearchParams(location.search);
  const id = params.get('s');
  if (!id) return false;

  try {
    const res = await fetch(`/api/expand?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`expand failed: ${res.status}`);
    const { payloadB64 } = await res.json();

    // Ensure the app is actually initialized (canvas, inputs, etc.)
    await waitForAppReady();

    // Mirror into the hash so if user copies URL after load, it still encodes the full state
    history.replaceState(null, '', `${location.pathname}#${payloadB64}`);
    _shortIdHandled = true;

    // Apply immediately so ticks render even if listeners attach later
    try {
      const parsed = JSON.parse(atob(payloadB64)); // your payload is plain JSON in b64
      applyPattern(parsed);
    } catch (e) {
      console.error('[short expand] decode/apply error', e);
    }

    // Fire the known-good hash path on the next frames as a safety net
    requestAnimationFrame(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      requestAnimationFrame(() => tryLoadFromHash());
    });

    return true;
  } catch (e) {
    console.error('[short expand]', e);
  }
  return false;
}