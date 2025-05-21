const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const toggleBtn = document.getElementById("toggleBtn");
const speedSlider = document.getElementById("speedSlider");
const segmentInput = document.getElementById("segmentInput");
const circleCount = 8;
const circleColors = ["#ff4444", "#ff9900", "#ffee00", "#66dd22", "#00cccc", "#2266ff", "#9922ff", "#ff22bb"];
const sounds = ["tick1", "tick2", "tick3", "tick4", "tick5", "tick6", "tick7", "tick8"];
let rotation = 0;
let previousRotation = 0;
let isRotating = false;
let rotationSpeed = parseFloat(speedSlider.value);
let segmentCount = parseInt(segmentInput.value);
let ticks = [];
let ringVolumes = new Array(circleCount).fill(1);
const TICK_SOUND_COOLDOWN = 100;
const TICK_RADIUS = 10;
const CENTER_DOT_RADIUS = 1;
let audioCtx = null;
let audioBuffers = [];
const activeTickCooldowns = new Map();


 
 // default volume = 1

let width, height, centerX, centerY;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
  ctx.scale(dpr, dpr);

  width = canvas.width / dpr;
  height = canvas.height / dpr;
  centerX = width / 2;
  centerY = height / 2;
  // Padding ensures no circle gets clipped after rotation
  const padding = 20;
  const maxUsable = Math.min(width, height) - 2 * padding;
  minRadius = maxUsable * 0.1;
  maxRadius = maxUsable * 0.5;
  radiusStep = (maxRadius - minRadius) / circleCount;
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => {
  setTimeout(resize, 300); // Wait for layout to stabilize
});


let minRadius = Math.min(width, height) * 0.1;
let maxRadius = Math.min(width, height) * 0.4;
let radiusStep = (maxRadius - minRadius) / circleCount;

resize();


segmentInput.addEventListener("input", () => {
  const val = parseInt(segmentInput.value);
  if (val > 0) {
    segmentCount = val;
  }
});


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

function toggleLegend() {
  const panel = document.getElementById("legendPanel");
  const button = document.querySelector(".legend-toggle");

  const isVisible = panel.style.display === "block";
  panel.style.display = isVisible ? "none" : "block";
  button.textContent = isVisible ? "Show Settings" : "Hide Settings";
}

let lastFrameTime = performance.now();

function draw() {
  const now = performance.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.moveTo(centerX, centerY - maxRadius - 30);
  ctx.lineTo(centerX, centerY - maxRadius - 10);
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.stroke();

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

  for (let i = 0; i < circleCount; i++) {
    const radius = minRadius + i * radiusStep;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = circleColors[i];
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const tick of ticks) {
    const radius = minRadius + tick.circleIndex * radiusStep;
    const angle = tick.angle + rotation;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    ctx.beginPath();
    ctx.arc(x, y, TICK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = circleColors[tick.circleIndex];
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, CENTER_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  }

  const realNow = Date.now();
  const triggerAngle = 3 * Math.PI / 2;
  const triggerRange = Math.PI / 32;

  for (const tick of ticks) {
    const prev = (tick.angle + previousRotation) % (2 * Math.PI);
    const curr = (tick.angle + rotation) % (2 * Math.PI);
    const crossedTrigger = prev < triggerAngle - triggerRange && curr >= triggerAngle - triggerRange;

    if (crossedTrigger) {
      const lastPlayed = activeTickCooldowns.get(tick) || 0;
      if (realNow - lastPlayed > TICK_SOUND_COOLDOWN) {
        const index = sounds.indexOf(tick.sound);
        if (index !== -1) playSound(index, ringVolumes[tick.circleIndex]);
        activeTickCooldowns.set(tick, realNow);
      }
    }
  }

  if (isRotating) {
    previousRotation = rotation;
    rotation = (rotation + rotationSpeed * delta * 60) % (2 * Math.PI);
  }

  requestAnimationFrame(draw);
}

canvas.addEventListener("click", (e) => {
  initAudio(); // Initialize audio on interaction
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left - centerX;
  const y = e.clientY - rect.top - centerY;
  const dist = Math.sqrt(x * x + y * y);
  //const angle = (Math.atan2(y, x) - rotation + 2 * Math.PI) % (2 * Math.PI);
  let angle = (Math.atan2(y, x) - rotation + 2 * Math.PI) % (2 * Math.PI);
  // If quantize is enabled, snap to nearest segment
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
        const dist = angularDistance(tick.angle, angle);
        if (dist < threshold && dist < minDist) {
          closest = tick;
          minDist = dist;
        }
      }
    }

    if (closest) {
      ticks.splice(ticks.indexOf(closest), 1);
    } else {
      ticks.push({ angle, circleIndex: index, sound: sounds[index] });
    }
  }
  document.querySelectorAll(".volume-slider").forEach(slider => {
  const ringIndex = parseInt(slider.dataset.ring);
  slider.addEventListener("input", () => {
    ringVolumes[ringIndex] = parseFloat(slider.value);
  });
});

});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    initAudio().then(() => {
      isRotating = !isRotating;
      toggleBtn.textContent = isRotating ? "Stop" : "Start";
      });
    }
  });

toggleBtn.addEventListener("click", () => {
  initAudio().then(() => {
    isRotating = !isRotating;
    toggleBtn.textContent = isRotating ? "Stop" : "Start";
    });
});

speedSlider.addEventListener("input", () => {
  rotationSpeed = parseFloat(speedSlider.value);
});

const quantizeToggle = document.getElementById("quantizeToggle");
let isQuantized = true;

quantizeToggle.addEventListener("click", () => {
  isQuantized = !isQuantized;
  quantizeToggle.classList.toggle("toggle-on", isQuantized);
  quantizeToggle.classList.toggle("toggle-off", !isQuantized);
  quantizeToggle.textContent = isQuantized ? "Strict" : "Loose";
});


document.getElementById("importInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
  try {
    const data = JSON.parse(event.target.result);

    // Handle both old and new format (just an array = legacy tick format)
    if (Array.isArray(data)) {
      ticks = data;
    } else if (Array.isArray(data.ticks)) {
      ticks = data.ticks;

      // Safe volume fallback
      ringVolumes = Array.from({ length: circleCount }, (_, i) =>
        typeof data.volumes?.[i] === 'number' ? data.volumes[i] : 1
      );

      // Update sliders visually to match loaded volume
      document.querySelectorAll(".volume-slider").forEach(slider => {
        const ringIndex = parseInt(slider.dataset.ring);
        slider.value = ringVolumes[ringIndex];
        // Rebind event listener to update the current ringVolumes array
        slider.oninput = () => {
          ringVolumes[ringIndex] = parseFloat(slider.value);
        };
      });

    }
  } catch (err) {
    alert("Failed to load pattern.");
    console.error(err);
  }
};


  reader.readAsText(file);
});

function exportPattern() {
  const filename = prompt("Enter filename for export:", "pattern.json");
  if (!filename) return;

  const exportData = {
    ticks: ticks,
    volumes: ringVolumes
  };

  const blob = new Blob([JSON.stringify(exportData)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

draw();
