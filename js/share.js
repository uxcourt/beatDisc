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

/** Existing: build URL from current state (unchanged) */
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

/** Updated: load from current location.hash using applyPattern() */
export function tryLoadFromHash() {
  const raw = location.hash || "";
  if (!raw || raw.length < 2) return;

  const parsed = decodeBase64JSON(raw);
  if (parsed && applyPattern(parsed)) {
    // Optional: no-op; applyPattern already resized/redrew
  }
}
