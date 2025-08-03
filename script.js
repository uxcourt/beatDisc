// ==== GLOBAL CONSTANTS ====
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startToggle = document.getElementById("startToggle");
const speedSlider = document.getElementById("speedSlider");
const segmentInput = document.getElementById("segmentInput");
const quantizeToggle = document.getElementById("quantizeToggle");
const easeToggle = document.getElementById("easeToggle");
const importBtn = document.getElementById("importBtn");
const exportBtn = document.getElementById("exportBtn");

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
const activeTickCooldowns = new Map();

// ==== GLOBAL VARIABLES ====
let width, height, centerX, centerY;
let minRadius, maxRadius, radiusStep;
let rotation = 0;
let previousRotation = 0;
let isRotating = false;
let easingToZero = true;
let easing = false;
let easeInterval = null;
let animationFrameId = null;
let currentSpeed = parseFloat(speedSlider.value);
let segmentCount = parseInt(segmentInput.value);
let isQuantized = true;
let ringVolumes = new Array(circleCount).fill(1);
let ticks = [];

let audioCtx = null;
let audioBuffers = [];

let drawCount = 0;
let lastFrameTime = null;
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;

/*
setInterval(() => {
  console.log("Frames per second:", drawCount);
  drawCount = 0;
}, 1000);
*/

// ==== SAFE ONE-OFF FRAME ====
function drawFrameOnce() {
  const savedId = animationFrameId;
  animationFrameId = null;
  draw();
  animationFrameId = savedId;
}

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
  drawFrameOnce();
  const wrapper = document.getElementById("startToggle");
  if (wrapper) wrapper.style.visibility = "visible";
  //positionStartToggle();
}


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
  if (audioCtx.state === "suspended") audioCtx.resume();

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
  const button = document.getElementById("legend-toggle");
  const isVisible = panel.style.display === "block";
  panel.style.display = isVisible ? "none" : "block";
  button.textContent = isVisible ? "settings" : "close";
}


// ==== SEGMENT LINES ====
segmentInput.addEventListener("input", () => {
  const val = parseInt(segmentInput.value);
  if (val > 0) segmentCount = val;
  drawFrameOnce();
});

// ==== QUANTIZING ====
quantizeToggle.addEventListener("click", () => {
  isQuantized = !isQuantized;
  quantizeToggle.classList.toggle("toggle-on", isQuantized);
  quantizeToggle.classList.toggle("toggle-off", !isQuantized);
  quantizeToggle.textContent = isQuantized ? "Strict" : "Loose";
});

// ==== EASING BACK TO TOP ====
easeToggle.addEventListener("click", () => {
  //force rotation to stop before applying easing to avoid bug
  if (isRotating) {
    isRotating=false;
    currentSpeed = parseFloat(speedSlider.value);

    //console.log ("currentSpeed set to " , currentSpeed, " from slider value: ", speedSlider.value);

    startToggle.textContent="play_circle";
    if (easeInterval) {
      clearInterval(easeInterval);
      easeInterval=null;
      easing=false;
    }
  }
  easingToZero = !easingToZero;
  easeToggle.textContent = easingToZero ? "On" : "Off";
});

// ==== PROCESS SPEED ====
speedSlider.addEventListener("input", () => {
  currentSpeed = parseFloat(speedSlider.value);

        //console.log ("currentSpeed set to " , currentSpeed, " from slider value: ", speedSlider.value);

      desiredSpeed = currentSpeed;
      //console.log("currentSpeed: " + currentSpeed);
      //console.log("desiredSpeed: " + desiredSpeed);
});

// ==== LOAD PATTERN ====
function loadPattern(pattern) {
  if (!pattern || typeof pattern !== "object") {
    throw new Error("Invalid pattern structure");
  }

  if (Array.isArray(pattern.ticks)) {
    ticks = pattern.ticks;
  }

  if (Array.isArray(pattern.volumes)) {
    ringVolumes = pattern.volumes;
    document.querySelectorAll(".volume-slider").forEach(slider => {
      const ringIndex = parseInt(slider.dataset.ring);
      if (!isNaN(ringIndex)) {
        slider.value = ringVolumes[ringIndex];
        slider.oninput = () => {
          ringVolumes[ringIndex] = parseFloat(slider.value);
        };
      }
    });
  }

  if (typeof pattern.speed === "number") {
    speedSlider.value = pattern.speed;
    currentSpeed = desiredSpeed = pattern.speed;
  }

  if (typeof pattern.segmentCount === "number") {
    segmentInput.value = pattern.segmentCount;
    segmentCount = pattern.segmentCount;
  }
  console.log("in loadPattern, outside of if tests, just before drawing frame once")
  resize();
  drawFrameOnce(); // Make sure the pattern is visible immediately
  //positionStartToggle();
  positionStartToggleToCanvasCenter();
}
// ==== LOAD LISTENER FOR INBOUND PATTERN
window.addEventListener("load", () => {
  const hash = location.hash.slice(1);
  if (hash) {
    try {
      const json = new TextDecoder().decode(
        Uint8Array.from(atob(hash), c => c.charCodeAt(0))
      );
      const pattern = JSON.parse(json);
      loadPattern(pattern);
      console.log("in load event listener of the window");
      //drawFrameOnce();
    } catch (err) {
      console.error("Invalid pattern data in URL");
    }
  }
});


// ==== IMPORT PATTERN ====
document.getElementById("importBtn").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const data = JSON.parse(event.target.result);

      // Legacy or minimal format support
      if (Array.isArray(data)) {
        loadPattern({ ticks: data }); // wraps array in expected format
      } else {
        loadPattern(data); // Full pattern structure
      }

    } catch (err) {
      alert("Failed to load pattern.");
      console.error(err);
    }
  };
  reader.readAsText(file);
});


// ==== EXPORT PATTERN ====
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

// ====  SPACE BAR TO STOP/START ====
startToggle.addEventListener("click", handleRotationToggle);
document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    handleRotationToggle();
  }
});


// ==== HANDLE ROTATION TOGGLE WITH LOOP GUARD ====
function handleRotationToggle() {
  initAudio().then(() => {
    if (isRotating) {
      if (easingToZero) {
        easingToZeroStart();
      } else {
        isRotating = false;
        currentSpeed = parseFloat(speedSlider.value);
        startToggle.textContent = "play_circle";
        if (easeInterval) {
          clearInterval(easeInterval);
          easeInterval = null;
          easing = false;
        }
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
      }
    } else {
      isRotating = true;
      startToggle.textContent = "stop_circle";
      startToggle.classList
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(draw);
      }
    }
  });
}

// ==== EASING TO ZERO WITH FRAME GUARD ====
function easingToZeroStart() {
  if (!isRotating) return;

  isRotating = false;
  easing = true;

  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  easeInterval = setInterval(() => {
    let diff = (2 * Math.PI - rotation) % (2 * Math.PI);
    if (diff < 0.01) {
      rotation = 0;
      clearInterval(easeInterval);
      easeInterval = null;
      easing = false;
      startToggle.textContent = "play_circle";
      currentSpeed = parseFloat(speedSlider.value);
    } else {
      rotation += diff * 0.15;
      rotation %= 2 * Math.PI;
    }
    drawFrameOnce();
  }, 1000 / 60);
}
// ==== SHARING ==== 
function getCurrentPatternState() {
  return {
    ticks,
    volumes: ringVolumes,
    speed: parseFloat(speedSlider.value),
    segmentCount
  };
}

function utf8ToBinary(str) {
  return new TextEncoder().encode(str).reduce((acc, byte) => acc + String.fromCharCode(byte), '');
 } 

function encodePatternToURL() {
  const pattern = getCurrentPatternState();
  const json = JSON.stringify(pattern);
  const base64 = btoa(utf8ToBinary(json));
  return `${location.origin}${location.pathname}#${base64}`;
}


// ==== ADD/REMOVE SOUNDS (TICKS) FROM CIRCLES ====
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const circleIndex = Math.floor((distance - minRadius + radiusStep / 2) / radiusStep);
  if (circleIndex < 0 || circleIndex >= circleCount) return;

  let angle = Math.atan2(dy, dx) - rotation;

  if (isQuantized) {
    const segmentAngle = (2 * Math.PI) / segmentCount;
    angle = Math.round(angle / segmentAngle) * segmentAngle;
  }

  // Normalize angle to [0, 2π)
  angle = (angle + 2 * Math.PI) % (2 * Math.PI);

  // Check for existing tick at same angle & ring
  const existingIndex = ticks.findIndex(t =>
    t.circleIndex === circleIndex &&
    Math.abs(t.angle - angle) < 0.01
  );

  if (existingIndex >= 0) {
    ticks.splice(existingIndex, 1); // remove
  } else {
    const sound = sounds[circleIndex];
    ticks.push({ circleIndex, angle, sound });
  }

  if (!isRotating){
    drawFrameOnce(); // update visual if the disc isn't rotating.
  }
});



drawCount = 0;
/*
setInterval(() => {
  console.log("Frames per second:", drawCount);
  drawCount = 0;
}, 1000);
*/

// ==== SHARE BUTTON BINDING ====
document.getElementById("shareBtn").addEventListener("click", () => {
  const url = encodePatternToURL();
  if (navigator.share) {
  navigator.share({
    title: "Check out my rhythm!",
    text: "I made this rotating pattern",
    url: url
  });
} else {
  // fallback: copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
      alert("Link copied to clipboard!");
    }).catch(err => {
      alert("Failed to copy URL: " + err.message);
    });
  };
});

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawCount++;
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
  
  //Draw rings
  for (let i = 0; i < circleCount; i++) {
    const radius = minRadius + i * radiusStep;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = circleColors[i];
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Draw ticks
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

    if (isRotating && !easing) {
      previousRotation = rotation;
      const frameTime = performance.now();
      const deltaTime = (frameTime - (lastFrameTime || frameTime)) / 1000;
      lastFrameTime = frameTime;

      rotation += currentSpeed * deltaTime;

      rotation %= 2 * Math.PI;
      if (currentSpeed > 10){console.warn("Unusually high current speed detected: ", currentSpeed);}
      //console.log("previousRotation: " + previousRotation);
      //console.log("rotation: " + rotation);
    }


  const now = Date.now();
  const triggerAngle = 3 * Math.PI / 2;
  const triggerRange = Math.PI / 32;

  for (const tick of ticks) {
    const prev = (tick.angle + previousRotation) % (2 * Math.PI);
    const curr = (tick.angle + rotation) % (2 * Math.PI);
    const crossedTrigger = prev < triggerAngle - triggerRange && curr >= triggerAngle - triggerRange;

    if (isRotating && crossedTrigger) {
      const lastPlayed = activeTickCooldowns.get(tick) || 0;
      if (now - lastPlayed > TICK_SOUND_COOLDOWN) {
        const index = sounds.indexOf(tick.sound);
        if (index !== -1) playSound(index, ringVolumes[tick.circleIndex]);
        activeTickCooldowns.set(tick, now);
      }
    }
  }
  if (isRotating && !easing) {
    animationFrameId = requestAnimationFrame(draw);
    } else {
    animationFrameId = null;
  }
}

draw();


// ==== DECODE THE HASH AND LOAD THE INCOMING PATTERN ====
function tryLoadPatternFromURL() {
  const hash = location.hash.slice(1); // remove '#'

  if (hash) {
    try {
      const binary = atob(hash);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      const pattern = JSON.parse(json);
      console.log("in tryLoadPatternFromURL about to call loadPattern");
      loadPattern(pattern);

    } catch (err) {
      /*console.log("Hash:", location.hash);
      console.log("Raw hash:", hash);
      console.log("Binary (atob):", atob(hash));
      console.log("Decoded JSON:", new TextDecoder().decode(Uint8Array.from(atob(hash), c => c.charCodeAt(0))));
      */

      console.error("Invalid pattern data in URL");
    }
  }
}
// ==== POSITIONING THE START BUTTON ====
/*function positionStartToggle() {
  const btn = document.getElementById("startToggle");
  if (!btn || typeof centerX === "undefined" || typeof centerY === "undefined") return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Convert centerX/Y from device pixels to CSS pixels
  const cssX = rect.left + centerX / dpr;
  const cssY = rect.top + centerY / dpr;

  btn.style.left = `${cssX}px`;
  btn.style.top = `${cssY}px`;
  btn.style.visibility = "visible";
}*/

// ==== VOLUME SLIDER BINDING ====
function bindVolumeSliders() {
  document.querySelectorAll(".volume-slider").forEach(slider => {
    const ringIndex = parseInt(slider.dataset.ring);
    slider.value = ringVolumes[ringIndex];
    slider.oninput = () => {
      ringVolumes[ringIndex] = parseFloat(slider.value);
    };
  });
}

// ==== COMPENSATE FOR IPAD VEIWPORT CALC LATENCY ====
/*function fixViewportShiftAfterRotation() {
  setTimeout(() => {
    // Trigger forced layout reflow after rotation
    const toggle = document.getElementById("startToggle");
    if (toggle) {
      toggle.style.display = "none";
      requestAnimationFrame(() => {
        toggle.style.display = "block";
      });
    }

    const slider = document.getElementById("speedSlider");
    if (slider) {
      slider.style.display = "none";
      requestAnimationFrame(() => {
        slider.style.display = "block";
      });
    }
  }, 500); // Give the browser enough time to update viewport
}*/
function positionStartToggleToCanvasCenter() {
  const btn = document.getElementById("startToggle");
  if (!btn) return;
  // Force iOS to recalc visible viewport
  window.scrollTo(0, 0);
  const centerX = (window.visualViewport?.width || window.innerWidth) / 2;
  const centerY = (window.visualViewport?.height || window.innerHeight) / 2;


  btn.style.left = `${centerX}px`;
  btn.style.top = `${centerY}px`;
  btn.style.visibility = "visible";

  // console.log("Button centered using viewport:", centerX, centerY);
}


function waitForCanvasStabilizationThenPositionButton(maxWait = 2000) {
  const start = performance.now();
  // Force reset so the first check always triggers
  lastCanvasWidth = 0;
  lastCanvasHeight = 0;

  function checkCanvasSize() {
    const rect = canvas.getBoundingClientRect();

    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if ((width !== lastCanvasWidth || height !== lastCanvasHeight) && width > 0 && height > 0) {
      // Size changed — update and wait a bit more
      lastCanvasWidth = width;
      lastCanvasHeight = height;

      if (performance.now() - start < maxWait) {
        requestAnimationFrame(checkCanvasSize); // check again next frame
        return;
      }
    }

    // Stabilized — now position the button
    positionStartToggleToCanvasCenter();
  }

  checkCanvasSize();
}


window.addEventListener("DOMContentLoaded", () => {
  bindVolumeSliders();
});
window.addEventListener("DOMContentLoaded", tryLoadPatternFromURL);
window.addEventListener("resize", () => {
  resize();
  //fixViewportShiftAfterRotation();
  waitForCanvasStabilizationThenPositionButton();
});
window.addEventListener("orientationchange", () => {
  resize(); // resize canvas immediately
  waitForCanvasStabilizationThenPositionButton();
});


resize();
