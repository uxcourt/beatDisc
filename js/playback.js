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


export async function initAudio() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume only if needed (must be in a user gesture)
    if (state.audioCtx.state === "suspended") {
      await state.audioCtx.resume();
    }
    // Decode and cache AudioBuffers for the configured `state.sounds` keys
    state.audioBuffers = await Promise.all(
      state.sounds.map(async (key) => {
        const url = base64Sounds[key];
        if (!url) {
          console.warn("[audio] Missing sound for key:", key);
          return null;
        }
        const arrayBuffer = dataUrlToArrayBuffer(url);
        return await state.audioCtx.decodeAudioData(arrayBuffer);
      })
    ); 
  }
}

export function playSound(index, volume=1) {
  if (!state.audioCtx || !state.audioBuffers || !state.audioBuffers[index]) return;
  if (state.audioCtx.state === "suspended") state.audioCtx.resume();
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
    const crossed = dt >= 0 && dt < dp;;

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
