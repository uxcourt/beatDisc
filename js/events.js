// /js/events.js

import { state } from "./state.js";
import { start, stopImmediate, easeToZeroStart, resize, setRunning } from "./animation.js";
import { initAudio } from "./playback.js";
import { handleCanvasClick } from "./ticks.js";
import { encodePatternToURL, tryLoadFromHash, applyPattern } from "./share.js";
import { positionStartToggle } from "./uiStartToggle.js";
import { isIOS } from "./platform.js";
import { tryLoadFromShortIdIfPresent, buildPatternPayloadB64 } from './share.js';

// 1) On app init: try short-id first, then hash
tryLoadFromShortIdIfPresent().then((loaded) => {
  if (!loaded) tryLoadFromHash();
});
window.addEventListener("hashchange", tryLoadFromHash);

export function bindEvents() {
  // ---------------------------
  // Sticky zoom state (iOS only)
  // ---------------------------
  const ZOOM_IN = 1.02;    // enter "zoomed" when scale > 1.02
  const ZOOM_OUT = 1.005;  // leave "zoomed" when scale <= 1.005
  let isZoomed = false;
  let unzoomSettleTimer = null;

  function updateZoomStateFromVV() {
    const vv = window.visualViewport;
    const scale = vv ? vv.scale : 1;

    if (!isZoomed && scale > ZOOM_IN) {
      isZoomed = true;
      if (unzoomSettleTimer) { clearTimeout(unzoomSettleTimer); unzoomSettleTimer = null; }
    } else if (isZoomed && scale <= ZOOM_OUT) {
      if (!unzoomSettleTimer) {
        // require a brief quiet period at ~1.0 before unzooming
        unzoomSettleTimer = setTimeout(() => {
          isZoomed = false;
          unzoomSettleTimer = null;
          // truly back at 1x: refit once
          resize();
          positionStartToggle();
        }, 180);
      }
    }
    return { vv, scale };
  }

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

  // Ease toggle (hidden UI is fine; still respected)
  state.easeToggle.addEventListener("click", () => {
    if (state.isRotating) stopImmediate();
    state.easingToZero = !state.easingToZero;
    state.easeToggle.textContent = state.easingToZero ? "On" : "Off";
  });

  // Speed slider
  state.speedSlider.addEventListener("input", () => {
    state.currentSpeed = parseFloat(state.speedSlider.value);
  });

  // Start/Stop (button + space)
  {
    let lock = false;
    // const dbg = (...a) => console.debug("[events]", ...a);

    async function onToggle(source) {
      if (lock) return;
      lock = true;
      try {
        const starting = !state.isRotating && !state.easing;
        if (starting) {
          await initAudio();             // audio only when starting
          setRunning(true);
        } else {
          const allowEasing = !!state.easingToZero; // honor the setting for all inputs
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

  // Legend toggle
  {
    const legendBtn   = document.getElementById("legend-toggle");
    const legendPanel = document.getElementById("legendPanel");

    legendBtn.addEventListener("click", () => {
      const open = legendPanel.style.display !== "block";
      legendPanel.style.display = open ? "block" : "none";
      legendBtn.setAttribute("aria-expanded", String(open));
    });
  }

  // Canvas clicks
  state.canvas.addEventListener("click", handleCanvasClick);

  // Share button (no clipboard write)
  //state.shareBtn.addEventListener("click", () => {
  //  const url = encodePatternToURL();
  //  if (navigator.share) {
  //    navigator.share({ title: "Check out this Beat Disc", text: "Beat Disc pattern", url });
  //  } else {
  //    alert(`Share link:\n${url}`);
  //  }
  //});

  // Share button -> create DB row -> get short URL -> share that URL
state.shareBtn.addEventListener("click", async () => {
  const payloadB64 = buildPatternPayloadB64();

  let shortUrl = null;
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payloadB64 })
    });
    if (res.ok) {
      const data = await res.json();
      shortUrl = data.shortUrl; // e.g. https://beatdis.co/s/Ab3X9fQp
    } else {
      const err = await res.text();
      console.error('[shorten] server error', res.status, err);
    }
  } catch (e) {
    console.error('[shorten] network error', e);
  }

  if (!shortUrl) {
    alert("Sorry. Beat Disc could not create a link right now.");
    return;
  }

  // Share the SHORT URL via OS share sheet if available, else copy to clipboard, else show it.
  if (navigator.share) {
    try {
      await navigator.share({ title: "Beat Disc pattern", url: shortUrl });
      return;
    } catch (e) {
      // fall through to clipboard path
    }
  }
  try {
    await navigator.clipboard.writeText(shortUrl);
    alert("Short link copied to clipboard:\n" + shortUrl);
  } catch {
    alert("Short link:\n" + shortUrl);
  }
});


  // Volume sliders binding
  document.querySelectorAll(".volume-slider").forEach(slider => {
    const ringIndex = parseInt(slider.dataset.ring, 10);
    slider.value = state.ringVolumes[ringIndex];
    slider.oninput = () => { state.ringVolumes[ringIndex] = parseFloat(slider.value); };
  });

  // Load from URL hash *now*; also listen for future changes
  tryLoadFromHash();
  window.addEventListener("hashchange", tryLoadFromHash);

  // -----------------------------------
  // Window resize: don't refit while zoomed on iOS
  // -----------------------------------
  window.addEventListener("resize", () => {
    if (isIOS() && window.visualViewport) {
      updateZoomStateFromVV();
      if (isZoomed) {
        // keep button glued, but don't refit canvas during zoom
        positionStartToggle();
        return;
      }
    }
    resize();
    positionStartToggle();
  });

  // -----------------------------------
  // Orientation change: respect zoom; refit only at 1x (with quick settle)
  // -----------------------------------
  window.addEventListener("orientationchange", () =>
    setTimeout(() => {
      if (isIOS() && window.visualViewport) {
        updateZoomStateFromVV();
        // Re-center immediately to the new vv box
        positionStartToggle();

        const vv = window.visualViewport;
        const scale = vv ? vv.scale : 1;

        // If we're effectively at 1×, refit now
        if (scale <= 1.01) {
          window.scrollTo(0, 0);
          resize();
          positionStartToggle();
          return;
        }

        // Otherwise, wait briefly for scale to return to ~1 and refit once
        let armed = true;
        const tryRefit = () => {
          if (!armed) return;
          const s = visualViewport.scale;
          if (s <= 1.01) {
            armed = false;
            window.scrollTo(0, 0);
            resize();
            positionStartToggle();
            visualViewport.removeEventListener("resize", tryRefit);
            visualViewport.removeEventListener("scroll", tryRefit);
          }
        };
        visualViewport.addEventListener("resize", tryRefit);
        visualViewport.addEventListener("scroll", tryRefit);
        // Safety disarm after 1.2s so we don't keep listeners around
        setTimeout(() => {
          if (armed) {
            armed = false;
            visualViewport.removeEventListener("resize", tryRefit);
            visualViewport.removeEventListener("scroll", tryRefit);
          }
        }, 1200);

        return; // don't run the 1x refit below twice
      }

      // Non-iOS fallback: simple refit
      window.scrollTo(0, 0);
      resize();
      positionStartToggle();
    }, 600)
  );

  // Initial positioning
  positionStartToggle();

  // -------------------------
  // Export pattern (no clipboard)
  // -------------------------
  {
    const exportBtn = document.getElementById("exportBtn");
    exportBtn?.addEventListener("click", () => {
      try {
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
        if (rawName === null) return;
        const name = (rawName || "pattern").replace(/[^a-z0-9_\-\.]+/gi, "_").slice(0, 64);

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.json`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        a.remove();
      } catch (err) {
        console.error("[exportPattern]", err);
        alert("Export failed: " + err.message);
      }
    });
  }

  // -------------------------
  // Import pattern (.json file)
  // -------------------------
  {
    const input = state.importBtn;
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
          input.value = "";
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

  // ------------------------------------------------------
  // iOS: visual viewport changes (zoom/pan/toolbar settle)
  // ------------------------------------------------------
  if (isIOS() && window.visualViewport) {
    let vvTimer = null;
    const onVV = () => {
      if (vvTimer) clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        updateZoomStateFromVV();

        // Always keep the button glued to the discs
        positionStartToggle();

        // At 1× (not zoomed) refit to any vv height changes (toolbar settle).
        // Avoid resizing while the "unzoom settle" timer is pending.
        if (!isZoomed && !unzoomSettleTimer) {
          resize();
          positionStartToggle();
        }
        // While zoomed: do NOT call resize(); optical zoom should prevail.
      }, 120);
    };
    visualViewport.addEventListener("resize", onVV);
    visualViewport.addEventListener("scroll", onVV);
  }
}


// On load: prefer short links (?s=<id>) and fallback to #<b64>
tryLoadFromShortIdIfPresent().then((loaded) => {
  if (!loaded) tryLoadFromHash();
});

window.addEventListener("hashchange", tryLoadFromHash);
