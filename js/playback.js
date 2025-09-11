// /js/playback.js
import { state } from "./state.js";
import base64Sounds from "./sounds.js";

function dataUrlToArrayBuffer(dataUrl) {
  const [, mime, base64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
  if (!base64) throw new Error("Invalid data URL");
  const bin = atob(base64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// --- minimal iOS hardening state (module-scope) ---
let unlockArmed = false;

function armGestureUnlock() {
  if (unlockArmed) return;
  if (!('addEventListener' in document)) return;
  unlockArmed = true;

  const tryResume = async () => {
    if (!state.audioCtx) return;
    try { await state.audioCtx.resume(); } catch {}
    if (state.audioCtx.state === "running") {
      teardown();
    }
  };

  const teardown = () => {
    ["pointerdown","touchend","click","keydown"].forEach(t =>
      document.removeEventListener(t, tryResume, true)
    );
    unlockArmed = false;
  };

  ["pointerdown","touchend","click","keydown"].forEach(t =>
    document.addEventListener(t, tryResume, true)
  );
}

export async function initAudio() {
  if (!state.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AC({ latencyHint: "interactive" });

  // --- iOS/Safari: one-time silent unlock so audio actually routes ---
  try {
    const ctx = state.audioCtx;
    const unlockBuffer = ctx.createBuffer(1, 1, ctx.sampleRate); // 1 frame silence
    const unlockSrc = ctx.createBufferSource();
    unlockSrc.buffer = unlockBuffer;
    // If you have a master gain in state, prefer connecting through it:
    (state.masterGain ? unlockSrc.connect(state.masterGain) : unlockSrc.connect(ctx.destination));
    try { unlockSrc.start(0); } catch {}
  } catch {}
  // -------------------------------------------------------------------
    // Decode and cache AudioBuffers for the configured `state.sounds` keys
    state.audioBuffers = await Promise.all(
      state.sounds.map(async (key) => {
        const url = base64Sounds[key];
        if (!url) {
          console.warn("[audio] Missing sound for key:", key);
          return null;
        }
        const arrayBuffer = dataUrlToArrayBuffer(url);
        // Safari/WebKit: use callback form wrapped in a Promise
        return await new Promise((resolve, reject) => {
          const fresh = arrayBuffer.slice(0); // Some builds require a fresh copy
          state.audioCtx.decodeAudioData(fresh, resolve, reject);
        });
      })
    );
  }

  // Always attempt to resume (handles iPhone cases where context later suspends)
  if (state.audioCtx.state === "suspended") {
    try { await state.audioCtx.resume(); } catch {}
  }

  // If we still aren’t running (iOS first-gesture rules), arm a one-time unlock
  if (state.audioCtx.state !== "running") armGestureUnlock();

  // Arm a one-time global resume in case iOS suspends after creation
  if (!unlockArmed && 'addEventListener' in document) {
    unlockArmed = true;
    const tryResume = async () => {
      if (!state.audioCtx) return;
      try { await state.audioCtx.resume(); } catch {}
      if (state.audioCtx.state === "running") {
        ["pointerdown","touchend","click","keydown"].forEach(t =>
          document.removeEventListener(t, tryResume, true)
        );
      }
    };
    ["pointerdown","touchend","click","keydown"].forEach(t =>
      document.addEventListener(t, tryResume, true)
    );
  }

}

// Minimal helper other modules can call before scheduling audio
export async function ensureAudioReady() {
  if (!state.audioCtx) {
    await initAudio();
  } else if (state.audioCtx.state === "suspended") {
    try { await state.audioCtx.resume(); } catch {}
    if (state.audioCtx.state !== "running") armGestureUnlock();
  }
  return !!state.audioCtx && state.audioCtx.state === "running";
}

export function playSound(index, volume=1) {
  if (!state.audioCtx || !state.audioBuffers || !state.audioBuffers[index]) return;

  // Last-ditch, non-blocking resume attempt (safe no-op if already running)
  if (state.audioCtx.state === "suspended") {
    state.audioCtx.resume().catch(() => {});
  }

  const source = state.audioCtx.createBufferSource();
  const gainNode = state.audioCtx.createGain();
  gainNode.gain.value = volume;
  source.buffer = state.audioBuffers[index];
  source.connect(gainNode).connect(state.audioCtx.destination);
  source.start(0);
}

export function playIndexIfDue() {
  const now = Date.now();
  const triggerAngle = 3 * Math.PI / 2;
  const triggerRange = Math.PI / 32;

  for (const tick of state.ticks) {
    const prev = (tick.angle + state.previousRotation) % (2 * Math.PI);
    const curr = (tick.angle + state.rotation) % (2 * Math.PI);
    // Wrap-safe crossing test (prevents misses across 2π → 0)
    const edge = (triggerAngle - triggerRange + 2*Math.PI) % (2*Math.PI);
    const dp = (curr - prev + 2*Math.PI) % (2*Math.PI);
    const dt = (edge - prev + 2*Math.PI) % (2*Math.PI);
    const crossed = dt >= 0 && dt < dp;

    if (crossed) {
      const last = state.activeTickCooldowns.get(tick) || 0;
      if (now - last > state.TICK_SOUND_COOLDOWN) {
        const index = state.sounds.indexOf(tick.sound);
        if (index !== -1) playSound(index, state.ringVolumes[tick.circleIndex]);
        state.activeTickCooldowns.set(tick, now);
      }
    }
  }
}

// --- Recover audio when returning from background / app switch ---
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    state.audioCtx &&
    state.audioCtx.state === "suspended"
  ) {
    state.audioCtx.resume().catch(() => {});
  }
});

