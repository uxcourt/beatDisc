// /js/ticks.js
import { state } from "./state.js";
import { drawFrameOnce } from "./animation.js";

export function handleCanvasClick(e) {
  const rect = state.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const dx = x - state.centerX;
  const dy = y - state.centerY;
  const distance = Math.sqrt(dx*dx + dy*dy);

  const circleIndex = Math.floor((distance - state.minRadius + state.radiusStep/2) / state.radiusStep);
  if (circleIndex < 0 || circleIndex >= state.circleCount) return;

  let angle = Math.atan2(dy, dx) - state.rotation;

  if (state.isQuantized) {
    const seg = (2 * Math.PI) / state.segmentCount;
    angle = Math.round(angle / seg) * seg;
  }
  angle = (angle + 2 * Math.PI) % (2 * Math.PI);

  const existing = state.ticks.findIndex(t =>
    t.circleIndex === circleIndex && Math.abs(t.angle - angle) < 0.01
  );

  if (existing >= 0) {
    state.ticks.splice(existing, 1);
  } else {
    const sound = state.sounds[circleIndex];
    state.ticks.push({ circleIndex, angle, sound });
  }

  if (!state.isRotating) drawFrameOnce();
}
