let meshCount = 0;

export function countMeshes(scene) {
  meshCount = 0;
  scene.traverse((o) => {
    if (o.isMesh) meshCount++;
  });
  return meshCount;
}

export function mountDebugOverlay() {
  const el = document.createElement('div');
  el.id = 'debug';
  el.hidden = true;
  el.style.cssText =
    'position:fixed;top:0.5rem;left:0.5rem;z-index:99;font:11px/1.45 monospace;' +
    'color:#fff;background:rgba(0,0,0,0.72);padding:0.5rem 0.65rem;border-radius:8px;' +
    'pointer-events:none;white-space:pre;max-width:min(420px,90vw)';
  document.body.appendChild(el);
  return el;
}

export function updateDebugOverlay(el, info) {
  if (!el || el.hidden) return;
  const warn = info.driveTime > 2 && info.meshes < 5;
  el.style.background = warn ? 'rgba(120,20,20,0.88)' : 'rgba(0,0,0,0.72)';
  el.textContent = [
    `Sojourn debug · ${info.version}`,
    `mode: ${info.mode} · chunks: ${info.chunks} · meshes: ${info.meshes}`,
    `car: ${info.car} · kenney: ${info.kenney}`,
    `vehicle: ${info.vx}, ${info.vy.toFixed(1)}, ${info.vz}`,
    `camera: ${info.cx}, ${info.cy.toFixed(1)}, ${info.cz}`,
    `webgl: ${info.gl}`,
    warn ? 'WARN: mesh count too low — 3D not rendering' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function isDebugMode() {
  return new URLSearchParams(location.search).has('debug');
}

export function mountStatusStrip() {
  const el = document.createElement('div');
  el.id = 'status-strip';
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:98;font:11px/1.4 monospace;' +
    'color:#fff;background:rgba(0,0,0,0.72);padding:0.45rem 0.75rem;' +
    'pointer-events:none;text-align:center;transition:background 0.2s';
  document.body.appendChild(el);
  return el;
}

export function updateStatusStrip(el, info) {
  if (!el) return;
  const draws = info.draws ?? 0;
  const failLowMeshes = info.driveTime > 2 && info.meshes < 5;
  const failNoDraws = info.driveTime > 2 && info.meshes > 50 && draws < 10;
  const fail = failLowMeshes || failNoDraws || info.fallback;
  const showBoot = info.bootTime < 3;
  if (!showBoot && !fail && info.mode === 'drive' && info.driveTime > 8 && info.webglOk) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.background = fail ? 'rgba(120,20,20,0.92)' : 'rgba(0,0,0,0.72)';
  const carType = info.kenney ? 'Kenney GLB' : 'procedural';
  if (info.fallback) {
    el.textContent = `2D fallback · ${info.car} · open in Chrome ↗ (or add ?nofallback=1)`;
  } else if (fail) {
    el.textContent =
      `⚠ ${draws} draws / ${info.meshes} meshes — switching to fallback or open Chrome`;
  } else {
    el.textContent =
      `${info.gl} · ${draws} draws · ${info.meshes} meshes · ${info.car} (${carType})`;
  }
}
