// /js/state.js
export const state = {
  // DOM refs (filled in init)
  canvas: null,
  ctx: null,
  startToggle: null,
  speedSlider: null,
  segmentInput: null,
  quantizeToggle: null,
  easeToggle: null,
  importBtn: null,
  exportBtn: null,
  shareBtn: null,

  // constants
  circleCount: 8,
  circleColors: ["#ff4444","#ff9900","#ffee00","#66dd22","#00cccc","#2266ff","#9922ff","#ff22bb"],
  sounds: ["tick1","tick2","tick3","tick4","tick5","tick6","tick7","tick8"],
  TICK_RADIUS: 10,
  CENTER_DOT_RADIUS: 1,
  TICK_SOUND_COOLDOWN: 100,

  // canvas geometry
  width: 0, height: 0, centerX: 0, centerY: 0,
  minRadius: 0, maxRadius: 0, radiusStep: 0,

  // animation state
  rotation: 0,
  previousRotation: 0,
  isRotating: false,
  easingToZero: true,
  easing: false,
  easeInterval: null,
  animationFrameId: null,
  currentSpeed: 2.5,   // will sync from slider
  segmentCount: 16,
  isQuantized: true,

  // audio state
  audioCtx: null,
  audioBuffers: [],
  ringVolumes: new Array(8).fill(1),
  activeTickCooldowns: new Map(),

  // ticks
  ticks: [],

  // helpers
  lastFrameTime: null,
};

export function init() {
  state.canvas = document.getElementById("canvas");
  state.ctx = state.canvas.getContext("2d");
  state.startToggle = document.getElementById("startToggle");
  state.speedSlider = document.getElementById("speedSlider");
  state.segmentInput = document.getElementById("segmentInput");
  state.quantizeToggle = document.getElementById("quantizeToggle");
  state.easeToggle = document.getElementById("easeToggle");
  state.importBtn = document.getElementById("importBtn");
  state.exportBtn = document.getElementById("exportBtn");
  state.shareBtn = document.getElementById("shareBtn");

  // sync initial values from UI
  state.currentSpeed = parseFloat(state.speedSlider.value);
  state.segmentCount = parseInt(state.segmentInput.value, 10);

  // no side effects beyond setting fields
}
