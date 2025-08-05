// /js/events.js

import { state } from "./state.js";
import { start, stopImmediate, easeToZeroStart, resize, setRunning } from "./animation.js";
import { initAudio } from "./playback.js";
import { handleCanvasClick } from "./ticks.js";
import { encodePatternToURL, tryLoadFromHash, applyPattern } from "./share.js";
import { positionStartToggle } from "./uiStartToggle.js";
import { isIOS } from "./platform.js";

export function bindEvents() {
  // Segment input
  state.segmentInput.addEventListener("input", () => {
    const val = parseInt(state.segmentInput.value, 10);
    if (val > 0) state.segmentCount = val;
  });

  // Quantize
  state.quantizeToggle.addEventListener("click", () => {
    state.isQuantized = !state.isQuantized;
    state.quantizeToggle.classList.toggle("toggle-on", state.isQuantized);
    state.quantizeToggle.classList.toggle("toggle-off", !state.isQuantized);
    state.quantizeToggle.textContent = state.isQuantized ? "Strict" : "Loose";
  });

  // Ease toggle
  state.easeToggle.addEventListener("click", () => {
    if (state.isRotating) {
      // stop first, consistent with your current logic
      stopImmediate();
    }
    state.easingToZero = !state.easingToZero;
    state.easeToggle.textContent = state.easingToZero ? "On" : "Off";
  });

  // Speed slider
  state.speedSlider.addEventListener("input", () => {
    state.currentSpeed = parseFloat(state.speedSlider.value);
  });

  // Start/Stop (button + space) — unified toggle + scoped debug
  {
    let lock = false;
    const dbg = (...a) => console.debug("[events]", ...a);

    async function onToggle(source) {
      if (lock) return;
      lock = true;
      try {
        dbg("source=", source, "isRotating=", state.isRotating, "easing=", state.easing, "easingToZero=", state.easingToZero);

        const starting = !state.isRotating && !state.easing;
        if (starting) {
          await initAudio();             // audio only when starting
          dbg("-> start()");
          setRunning(true);
        } else {
            const allowEasing = !!state.easingToZero; // honor the setting for all inputs
            dbg(allowEasing ? "-> easeToZeroStart()" : "-> stopImmediate()");
            setRunning(false, { allowEasing });
        }
      } finally {
        lock = false;
      }
    }

    state.startToggle.addEventListener("click", () => onToggle("click"));
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        onToggle("keyboard");
      }
    });
  }

  // Legend toggle via addEventListener (no globals)
  {
    const legendBtn   = document.getElementById("legend-toggle");
    const legendPanel = document.getElementById("legendPanel");

    legendBtn.addEventListener("click", () => {
      const open = legendPanel.style.display !== "block";
      legendPanel.style.display = open ? "block" : "none";
      legendBtn.setAttribute("aria-expanded", String(open));
      // legendBtn.textContent = open ? "close" : "settings";
    });
  }

  // Canvas clicks
  state.canvas.addEventListener("click", handleCanvasClick);

  // Share button (no clipboard write)
  state.shareBtn.addEventListener("click", () => {
    const url = encodePatternToURL();
    if (navigator.share) {
      navigator.share({ title: "Check out this rhythm!", text: "I made this Beat Disc on beatdis.co.", url });
    } else {
      // No clipboard: just show the URL so the user can copy it manually
      alert(`Share link:\n${url}`);
    }
  });

  // Volume sliders binding (run after DOMContentLoaded)
  document.querySelectorAll(".volume-slider").forEach(slider => {
    const ringIndex = parseInt(slider.dataset.ring, 10);
    slider.value = state.ringVolumes[ringIndex];
    slider.oninput = () => { state.ringVolumes[ringIndex] = parseFloat(slider.value); };
  });

  // Load from URL hash *now* (bindEvents runs after DOMContentLoaded)
  tryLoadFromHash();
  // Also respond to future hash changes (e.g., pasted links, in-app updates)
  window.addEventListener("hashchange", tryLoadFromHash);

  // Resize/orientation & start button position
  window.addEventListener("resize", () => { resize(); positionStartToggle(); });
  window.addEventListener("orientationchange", () =>
  setTimeout(() => {
    // Safari iPad: ensure no residual scroll after toolbars settle
    window.scrollTo(0, 0);
    resize();
    positionStartToggle();
  }, 600)
);

  // Initial positioning
  positionStartToggle();

  // Export pattern via addEventListener (no globals, no clipboard)
  {
    const exportBtn = document.getElementById("exportBtn");
    exportBtn?.addEventListener("click", () => {
      try {
        // Build a JSON object (ticks, volumes, speed, segmentCount) for file export
        const data = {
          ticks: state.ticks.map(t => ({
            circleIndex: t.circleIndex,
            angle: t.angle,
            sound: t.sound
          })),
          volumes: [...state.ringVolumes],
          speed: state.currentSpeed,
          segmentCount: state.segmentCount,
        };

        const rawName = prompt("Name your export", "my-pattern");
        if (rawName === null) return; // user cancelled
        const name = (rawName || "pattern").replace(/[^a-z0-9_\-\.]+/gi, "_").slice(0, 64);

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();

        // If you still want to surface the share URL to users without copying:
        // const url = encodePatternToURL();
        // alert(`Share link:\n${url}`);
      } catch (err) {
        console.error("[exportPattern]", err);
        alert("Export failed: " + err.message);
      }
    });
  }

  // Import pattern (.json file) — reuse applyPattern()
  {
    const input = state.importBtn; // <input type="file" id="importBtn" accept=".json">
    input?.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const ok = applyPattern(parsed);
          if (!ok) alert("Import failed: invalid pattern format.");
        } catch (err) {
          console.error("[importPattern] Invalid JSON:", err);
          alert("Import failed: invalid JSON file.");
        } finally {
          input.value = ""; // allow re-selecting the same file later
        }
      };
      reader.onerror = () => {
        console.error("[importPattern] File read error");
        alert("Import failed: could not read file.");
        input.value = "";
      };
      reader.readAsText(file);
    });
  }
  // iOS/iPadOS: react to visual viewport changes (zoom/pan/toolbar settle)
{
  if (isIOS() && window.visualViewport) {
    let vvTimer = null;

    // Track zoom state with hysteresis so brief misreports (~1.0) don't resize the canvas
    const ZOOM_IN   = 1.02;   // consider zoomed when scale > 1.02
    const ZOOM_OUT  = 1.005;  // only consider unzoomed when scale <= 1.005
    let isZoomed = false;     // our sticky zoom state
    let unzoomSettleTimer = null;

    const onVV = () => {
      if (vvTimer) clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        const vv = window.visualViewport;
        const scale = vv ? vv.scale : 1;

        // Update sticky zoom state with hysteresis
        if (!isZoomed && scale > ZOOM_IN) {
          isZoomed = true;
          if (unzoomSettleTimer) { clearTimeout(unzoomSettleTimer); unzoomSettleTimer = null; }
        } else if (isZoomed && scale <= ZOOM_OUT) {
          // Don't flip immediately—require a brief quiet period at ~1.0
          if (!unzoomSettleTimer) {
            unzoomSettleTimer = setTimeout(() => {
              isZoomed = false;
              unzoomSettleTimer = null;
              // Now that we're truly back at 1x, (re)size the canvas to the visible area
              resize();
              positionStartToggle();
            }, 180); // settle time
          }
        }

        // Always keep the button aligned to the discs
        // (This also covers panning/zooming when isZoomed === true)
        positionStartToggle();

        // While zoomed: do NOT resize the canvas—let optical zoom do the work.
        // When not zoomed (and not flipping state right now), we still want to
        // correct for toolbar settle (vv height changes) without fighting users.
        if (!isZoomed && !unzoomSettleTimer) {
          // Debounced correction for toolbar show/hide at 1x
          // (No canvas resize here; 'resize()' above will run after settle or via orientationchange)
        }
      }, 120); // debounce vv storm
    };

    visualViewport.addEventListener("resize", onVV);
    visualViewport.addEventListener("scroll", onVV);
  }
}

}
