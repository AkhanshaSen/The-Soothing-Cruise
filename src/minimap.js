/** Circular minimap + full map overlay (OpenCity-style). */

function drawRoadPath(ctx, highway, player, scale, lateralScale) {
  const f = highway.at(player.s);
  ctx.save();
  ctx.translate(0, 0);
  ctx.rotate(-f.heading + Math.PI);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.lineWidth = 3;
  for (let ds = -200; ds <= 240; ds += 5) {
    const p = highway.at(Math.max(0, player.s + ds));
    const x = (p.x - f.x) * scale;
    const y = (p.z - f.z) * scale;
    if (ds === -200) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const lx = f.nx * player.lateral * lateralScale;
  const ly = f.nz * player.lateral * lateralScale;
  ctx.fillStyle = '#f0b429';
  ctx.beginPath();
  ctx.moveTo(lx, ly - 7);
  ctx.lineTo(lx - 5, ly + 5);
  ctx.lineTo(lx + 5, ly + 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawMinimap(canvas, highway, player) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = w / 2 - 2;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(12, 16, 24, 0.78)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let g = -2; g <= 2; g++) {
    ctx.beginPath();
    ctx.moveTo(cx + g * 18, cy - r);
    ctx.lineTo(cx + g * 18, cy + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + g * 18);
    ctx.lineTo(cx + r, cy + g * 18);
    ctx.stroke();
  }

  ctx.translate(cx, cy);
  drawRoadPath(ctx, highway, player, 0.42, 0.42);

  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawFullMap(canvas, highway, player) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#1a3d28';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  const grid = 22;
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * grid, cy - r);
    ctx.lineTo(cx + i * grid, cy + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + i * grid);
    ctx.lineTo(cx + r, cy + i * grid);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  const f = highway.at(player.s);
  ctx.rotate(-f.heading + Math.PI);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let ds = -500; ds <= 520; ds += 8) {
    const p = highway.at(Math.max(0, player.s + ds));
    const x = (p.x - f.x) * 0.24;
    const y = (p.z - f.z) * 0.24;
    if (ds === -500) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const lx = f.nx * player.lateral * 0.24;
  const ly = f.nz * player.lateral * 0.24;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(lx, ly - 10);
  ctx.lineTo(lx - 7, ly + 8);
  ctx.lineTo(lx + 7, ly + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}
