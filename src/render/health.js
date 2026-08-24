/** Sample center pixel after render — true if anything besides sky drew. */
const SKY = { r: 140, g: 200, b: 232 };

export function pixelShowsGeometry(renderer) {
  try {
    const gl = renderer.getContext();
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    if (w < 2 || h < 2) return false;
    const buf = new Uint8Array(4);
    gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const dr = Math.abs(buf[0] - SKY.r);
    const dg = Math.abs(buf[1] - SKY.g);
    const db = Math.abs(buf[2] - SKY.b);
    return dr + dg + db > 35;
  } catch {
    return null;
  }
}

export function isEmbeddedPreview() {
  const ua = navigator.userAgent || '';
  if (/Cursor/i.test(ua)) return true;
  if (window.self !== window.top) return true;
  if (location.protocol === 'vscode-webview:' || location.protocol === 'cursor:') return true;
  return false;
}

export function forceFallback() {
  return new URLSearchParams(location.search).has('fallback');
}

export function disableAutoFallback() {
  return new URLSearchParams(location.search).has('nofallback');
}
