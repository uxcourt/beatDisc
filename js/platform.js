// /js/platform.js

/** Detect iOS / iPadOS (including iPad spoofing as Mac). */
export function isIOS() {
  const ua = navigator.userAgent || "";
  const iOSUA = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSUA || iPadOS;
}

/** Get the current viewport size, using visualViewport on iOS if available. */
export function getViewportSize() {
  const vv = window.visualViewport;
  if (vv && isIOS()) {
    return { w: Math.floor(vv.width), h: Math.floor(vv.height) };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}
