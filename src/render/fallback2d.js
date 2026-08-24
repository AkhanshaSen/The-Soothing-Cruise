/** Minimal 2D drive view when WebGL geometry cannot composite (embedded browsers). */
export function mountFallback2D() {
  const canvas = document.createElement('canvas');
  canvas.id = 'view2d';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:1;display:none;pointer-events:none';
  document.body.insertBefore(canvas, document.getElementById('ui'));
  return canvas;
}

export function resizeFallback2D(canvas) {
  const w = Math.max(1, window.innerWidth | 0);
  const h = Math.max(1, window.innerHeight | 0);
  canvas.width = w;
  canvas.height = h;
}

export function drawFallback2D(canvas, { speed, biome, sky }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky || '#8ecdf0');
  g.addColorStop(0.55, '#c8dce8');
  g.addColorStop(1, biome?.sand ? `#${biome.sand.toString(16).padStart(6, '0')}` : '#e8c850');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.42;
  ctx.fillStyle = biome?.grass ? `#${biome.grass.toString(16).padStart(6, '0')}` : '#78c850';
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.fillStyle = '#1a1a22';
  ctx.beginPath();
  ctx.moveTo(w * 0.22, h);
  ctx.lineTo(w * 0.38, horizon);
  ctx.lineTo(w * 0.62, horizon);
  ctx.lineTo(w * 0.78, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2a2a32';
  ctx.fillRect(w * 0.46, horizon, w * 0.08, h - horizon);

  const bob = Math.sin(Date.now() * 0.004) * 3;
  ctx.fillStyle = '#88a8a8';
  ctx.fillRect(w * 0.44, horizon + 28 + bob, w * 0.12, 22);
  ctx.fillStyle = '#2a3038';
  ctx.fillRect(w * 0.46, horizon + 20 + bob, w * 0.08, 12);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 13px Outfit, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(speed * 3.6)} km/h · 2D fallback`, w / 2, h - 48);
}
