// /js/animation.js

import { state } from "./state.js";
import { playIndexIfDue } from "./playback.js";
import { waitForCanvasStabilizationThenPositionButton as positionStartBtn } from "./uiStartToggle.js";
import { getViewportSize } from "./platform.js";

export function resize() {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = getViewportSize();   // <- compute once

  const c = state.canvas, ctx = state.ctx;
  // Use w/h for both the backing store and the CSS size
  c.width  = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.width  = w + "px";
  c.style.height = h + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  // Mirror w/h into state (don’t re-derive from c.width/height)
  state.width  = w;
  state.height = h;
  state.centerX = w / 2;
  state.centerY = h / 2;

  const padding = 20;
  const maxUsable = Math.min(w, h) - 2 * padding;
  state.minRadius = maxUsable * 0.1;
  state.maxRadius = maxUsable * 0.5;
  state.radiusStep = (state.maxRadius - state.minRadius) / state.circleCount;

  drawFrameOnce();
  positionStartBtn();
}


export function drawFrameOnce() {
  const saved = state.animationFrameId;
  state.animationFrameId = null;
  draw();
  state.animationFrameId = saved;
}

/**
 * Single source of truth for transitioning the run state.
 * desired=true  -> start()
 * desired=false -> stopImmediate() or easeToZeroStart() based on options and state
 */
export function setRunning(desired, { allowEasing = false } = {}) {
  // Normalize: if we’re already there, do nothing
  if (desired && state.isRotating) return;
  if (!desired && !state.isRotating && !state.easing) return;

  // Always clear any easing interval before switching modes
  if (state.easeInterval) {
    clearInterval(state.easeInterval);
    state.easeInterval = null;
  }
  state.easing = false;

  if (desired) {
    // START
    ensureAudioReady().catch(() => {});
    start();
  } else {
    // STOP (optionally via easing)
    if (allowEasing && state.easingToZero && state.isRotating) {
      easeToZeroStart();
    } else {
      stopImmediate();
    }
  }
}

export function start() {
  if (state.isRotating) return;
  // Clean up any previous easing before starting fresh
  if (state.easeInterval) { clearInterval(state.easeInterval); state.easeInterval = null; }
  state.easing = false;
  state.lastFrameTime = null; // prevents a large first-frame delta after being paused

  state.isRotating = true;
  state.startToggle.textContent = "stop_circle";
  if (state.animationFrameId == null) {
    state.animationFrameId = requestAnimationFrame(draw);
  }
}

export function stopImmediate() {
  state.isRotating = false;
  state.startToggle.textContent = "play_circle";
  if (state.easeInterval) {
    clearInterval(state.easeInterval);
    state.easeInterval = null;
    state.easing = false;
  }
  if (state.animationFrameId != null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  state.currentSpeed = parseFloat(state.speedSlider.value);
}

export function easeToZeroStart() {
  if (!state.isRotating) return;
  state.isRotating = false;
  state.easing = true;

  if (state.animationFrameId != null) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }

  state.easeInterval = setInterval(() => {
    const diff = (2 * Math.PI - state.rotation) % (2 * Math.PI);
    if (diff < 0.01) {
      state.rotation = 0;
      clearInterval(state.easeInterval);
      state.easeInterval = null;
      state.easing = false;
      state.startToggle.textContent = "play_circle";
      state.currentSpeed = parseFloat(state.speedSlider.value);
    } else {
      state.rotation = (state.rotation + diff * 0.15) % (2 * Math.PI);
    }
    drawFrameOnce();
  }, 1000 / 60);
}

export function draw() {
  const { ctx } = state;
  ctx.clearRect(0,0,state.width,state.height);

  // Top indicator
  ctx.beginPath();
  ctx.moveTo(state.centerX, state.centerY - state.maxRadius - 30);
  ctx.lineTo(state.centerX, state.centerY - state.maxRadius - 10);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Segment lines (rotating)
  ctx.save();
  ctx.translate(state.centerX, state.centerY);
  ctx.rotate(state.rotation);
  ctx.strokeStyle = "#044";
  ctx.lineWidth = 1;
  for (let i = 0; i < state.segmentCount; i++) {
    const angle = i * (2 * Math.PI / state.segmentCount);
    const x = Math.cos(angle) * (state.maxRadius + 20);
    const y = Math.sin(angle) * (state.maxRadius + 20);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(x,y);
    ctx.stroke();
  }
  ctx.restore();

  // Rings
  for (let i = 0; i < state.circleCount; i++) {
    const radius = state.minRadius + i * state.radiusStep;
    ctx.beginPath();
    ctx.arc(state.centerX, state.centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = state.circleColors[i];
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Ticks
  for (const tick of state.ticks) {
    const radius = state.minRadius + tick.circleIndex * state.radiusStep;
    const angle = tick.angle + state.rotation;
    const x = state.centerX + Math.cos(angle) * radius;
    const y = state.centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(x, y, state.TICK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = state.circleColors[tick.circleIndex];
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, state.CENTER_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  }

  // Advance rotation (if running)
  if (state.isRotating && !state.easing) {
    state.previousRotation = state.rotation;
    const now = performance.now();
    const deltaTime = (now - (state.lastFrameTime || now)) / 1000;
    state.lastFrameTime = now;
    state.rotation = (state.rotation + state.currentSpeed * deltaTime) % (2 * Math.PI);
  }

  // Trigger playback checks near top
  if (state.isRotating) {
    playIndexIfDue();
  }

  if (state.isRotating && !state.easing) {
    state.animationFrameId = requestAnimationFrame(draw);
  } else {
    state.animationFrameId = null;
  }
}
