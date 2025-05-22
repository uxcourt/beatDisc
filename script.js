// ==== GLOBAL CONSTANTS ====
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const toggleBtn = document.getElementById("toggleBtn");
const speedSlider = document.getElementById("speedSlider");
const segmentInput = document.getElementById("segmentInput");
const easeToggle = document.getElementById("easeToggle");
const quantizeToggle = document.getElementById("quantizeToggle");
const circleCount = 8;
const circleColors = [
  "#ff4444", "#ff9900", "#ffee00", "#66dd22",
  "#00cccc", "#2266ff", "#9922ff", "#ff22bb"
];
const sounds = [
  "tick1", "tick2", "tick3", "tick4",
  "tick5", "tick6", "tick7", "tick8"
];
const TICK_RADIUS = 10;
const CENTER_DOT_RADIUS = 1;
const TICK_SOUND_COOLDOWN = 100;

// ==== GLOBAL VARIABLES ====
let width, height, centerX, centerY;
let minRadius, maxRadius, radiusStep;
let rotation = 0;
let previousRotation = 0;
let isRotating = false;
let rotationSpeed = parseFloat(speedSlider.value);
let segmentCount = parseInt(segmentInput.value);
let ticks = []; // { angle, circleIndex, sound }
let ringVolumes = new Array(circleCount).fill(1);
let isQuantized = true;
let easingToZero = false;
let easeRotationSpeed = 0;

let audioCtx = null;
let audioBuffers = [];
const activeTickCooldowns = new Map();

// ==== INITIALIZATION ====
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  width = canvas.width / dpr;
  height = canvas.height / dpr;
  centerX = width / 2;
  centerY = height / 2;

  const padding = 20;
  const maxUsable = Math.min(width, height) - 2 * padding;
  minRadius = maxUsable * 0.1;
  maxRadius = maxUsable * 0.5;
  radiusStep = (maxRadius - minRadius) / circleCount;
}
resize();
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 300));

// ==== AUDIO SETUP ====
async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();

    audioBuffers = await Promise.all(
      sounds.map(async (key) => {
        const response = await fetch(base64Sounds[key]);
        const arrayBuffer = await response.arrayBuffer();
        return await audioCtx.decodeAudioData(arrayBuffer);
      })
    );
  }
}

function playSound(index, volume = 1) {
  if (!audioCtx || !audioBuffers[index]) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const source = audioCtx.createBufferSource();
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;

  source.buffer = audioBuffers[index];
  source.connect(gainNode).connect(audioCtx.destination);
  source.start(0);
}

// ==== LEGEND TOGGLE ====
function toggleLegend() {
  const panel = document.getElementById("legendPanel");
  const button = document.querySelector(".legend-toggle");

  const isVisible = panel.style.display === "block";
  panel.style.display = isVisible ? "none" : "block";
  button.textContent = isVisible ? "Show Settings" : "Hide Settings";
}

// ==== ROTATION EASING ====
function updateRotation() {
  if (isRotating) {
    previousRotation = rotation;
    rotation = (rotation + rotationSpeed) % (2 * Math.PI);
  } else if (easingToZero) {
    const distance = (2 * Math.PI - rotation) % (2 * Math.PI);
    const easing = 0.1;
    rotation += distance * easing;
    if (distance < 0.001) {
      rotation = 0;
      easingToZero = false;
    }
  }
}

// ==== DRAW FUNCTION ====
function draw() {
  ctx.clearRect(0, 0, width, height);

  // Red 12 o'clock marker
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - maxRadius - 30);
  ctx.lineTo(centerX, centerY - maxRadius - 10);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rotating segments
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.strokeStyle = "#044";
  ctx.lineWidth = 1;
  for (let i = 0; i < segmentCount; i++) {
    const angle = i * (2 * Math.PI / segmentCount);
    const x = Math.cos(angle) * (maxRadius + 20);
    const y = Math.sin(angle) * (maxRadius + 20);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.restore();

  // Circles
  for (let i = 0; i < circleCount; i++) {
    const radius = minRadius + i * radiusStep;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = circleColors[i];
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Ticks

    for (const tick of ticks) {
    const radius = minRadius + tick.circleIndex * radiusStep;
    const angle = tick.angle + rotation;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(x, y, TICK_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = circleColors[tick.circleIndex];
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, CENTER_DOT_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = "#111";
    ctx.fill();
    }


  // Sound trigger
    if (isRotating) {
      const now = Date.now();
      const triggerAngle = 3 * Math.PI / 2;
      const triggerRange = Math.PI / 32;
      for (const tick of ticks) {
        const prev = (tick.angle + previousRotation) % (2 * Math.PI);
        const curr = (tick.angle + rotation) % (2 * Math.PI);
        const crossed = prev < triggerAngle - triggerRange && curr >= triggerAngle - triggerRange;
        if (crossed) {
          const lastPlayed = activeTickCooldowns.get(tick) || 0;
          if (now - lastPlayed > TICK_SOUND_COOLDOWN) {
            const index = sounds.indexOf(tick.sound);
            if (index !== -1) playSound(index, ringVolumes[tick.circleIndex]);
            activeTickCooldowns.set(tick, now);
          }
        }
      }
  }

  requestAnimationFrame(draw);
}

// ==== USER INPUT ====
function toggleRotation() {
  initAudio().then(() => {
    if (isRotating) {
      isRotating = false;
      if (easeToggle.classList.contains("toggle-on")) {
        easingToZero = true;
        
      }
    } else {
      easingToZero = false;
      isRotating = true;

    }
    toggleBtn.textContent = isRotating ? "Stop" : "Start";
    
  });
}
function toggleEaseToZero() {
  const isEnabled = easeToggle.classList.contains("toggle-on");

  if (isEnabled) {
    easeToggle.classList.remove("toggle-on");
    easeToggle.classList.add("toggle-off");
    easeToggle.textContent = "Off";
  } else {
    easeToggle.classList.remove("toggle-off");
    easeToggle.classList.add("toggle-on");
    easeToggle.textContent = "On";
  }
}

canvas.addEventListener("click", (e) => {
  initAudio();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - centerX;
  const y = e.clientY - rect.top - centerY;
  const dist = Math.sqrt(x * x + y * y);
  let angle = (Math.atan2(y, x) - rotation + 2 * Math.PI) % (2 * Math.PI);

  if (isQuantized) {
    const anglePerSegment = 2 * Math.PI / segmentCount;
    const nearestSegment = Math.round(angle / anglePerSegment);
    angle = (nearestSegment * anglePerSegment) % (2 * Math.PI);
  }

  const index = Math.floor((dist - minRadius) / radiusStep);
  if (index >= 0 && index < circleCount) {
    function angularDistance(a1, a2) {
      const diff = Math.abs(a1 - a2) % (2 * Math.PI);
      return Math.min(diff, 2 * Math.PI - diff);
    }

    const threshold = 0.15;
    let closest = null;
    let minDist = Infinity;
    for (const tick of ticks) {
      if (tick.circleIndex === index) {
        const d = angularDistance(tick.angle, angle);
        if (d < threshold && d < minDist) {
          closest = tick;
          minDist = d;
        }
      }
    }

    if (closest) {
      ticks.splice(ticks.indexOf(closest), 1);
    } else {
      ticks.push({ angle, circleIndex: index, sound: sounds[index] });
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    toggleRotation();
  }
});
toggleBtn.addEventListener("click", toggleRotation);

// ==== SETTINGS ====
speedSlider.addEventListener("input", () => {
  rotationSpeed = parseFloat(speedSlider.value);
});
segmentInput.addEventListener("input", () => {
  const val = parseInt(segmentInput.value);
  if (val > 0) segmentCount = val;
});
quantizeToggle.addEventListener("click", () => {
  isQuantized = !isQuantized;
  quantizeToggle.classList.toggle("toggle-on", isQuantized);
  quantizeToggle.classList.toggle("toggle-off", !isQuantized);
  quantizeToggle.textContent = isQuantized ? "Strict" : "Loose";
});
easeToggle.addEventListener("click", () => {
  easeToggle.textContent="On";
  toggleEaseToZero();

});

// ==== LOOP START ====
setInterval(updateRotation, 1000 / 60);
draw();
