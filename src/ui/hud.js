import { CARS, DEFAULT_CAR_ID } from '../vehicle/catalog.js';

export function mountUI(root) {
  root.innerHTML = `
    <section class="screen" id="title">
      <div class="wordmark">Sojourn</div>
      <div class="tag">Endless soothing drive</div>
      <div class="garage" id="garage"></div>
      <div class="actions">
        <button class="primary" id="drive" disabled>Loading car…</button>
      </div>
      <div class="credits">
        <span class="credits-dev">Akhansha Sen</span>
        <span class="credits-sep">·</span>
        <span class="credits-assets">Kenney CC0 · OpenCity scenery</span>
      </div>
    </section>
    <div class="hud hidden" id="hud">
      <div class="minimap"><canvas id="map" width="120" height="120"></canvas></div>
      <div class="oc-bar">
        <div class="oc-meta">
          <span id="biome">Golden Coast</span>
          <span class="oc-dot">·</span>
          <span id="station">Harbor FM</span>
        </div>
        <div class="oc-controls" id="hint">WASD / Arrows drive · A D steer · Space drift · R reset · Esc pause</div>
        <div class="oc-car" id="carname">Sports Sedan</div>
        <div class="oc-speed"><span id="spd">0</span><span class="oc-unit">KM/H</span></div>
      </div>
    </div>
    <div class="pause hidden" id="pause">
      <div class="oc-pause">
        <h1 class="oc-pause-title">PAUSED</h1>
        <div class="oc-pause-car" id="pause-car">Sports Sedan</div>
        <ul class="oc-pause-menu" id="pause-menu">
          <li class="selected" data-i="0">RESUME</li>
          <li data-i="1">CHANGE VEHICLE</li>
          <li data-i="2">SETTINGS</li>
          <li data-i="3">RESTART</li>
        </ul>
        <p class="oc-pause-hint" id="pause-hint">UP / DOWN choose · ENTER select · ESC resume</p>
        <div class="oc-pause-settings hidden" id="pause-settings">
          <h2 class="oc-pause-sub">SETTINGS</h2>
          <div class="row"><span>Time</span>
            <select id="tod">
              <option value="day" selected>Always day</option>
              <option value="dynamic">Living sky</option>
              <option value="sunset">Always golden hour</option>
              <option value="dawn">Always dawn</option>
              <option value="night">Always night</option>
            </select>
          </div>
          <div class="row"><span>Sky cycle</span>
            <select id="cycle">
              <option value="3">3 minutes</option>
              <option value="1">1 minute</option>
              <option value="8">8 minutes</option>
            </select>
          </div>
          <div class="row"><span>Music</span><input id="music" type="range" min="0" max="100" value="55" /></div>
          <div class="row"><span>Engine</span><input id="sfx" type="range" min="0" max="100" value="45" /></div>
          <div class="row"><span>Cruise assist</span>
            <select id="assist">
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div class="row"><span>Quality</span>
            <select id="quality">
              <option value="1">High</option>
              <option value="0.75">Medium</option>
              <option value="0.5">Low</option>
            </select>
          </div>
          <p class="oc-pause-hint">ESC back to menu</p>
        </div>
        <div class="oc-pause-vehicle hidden" id="pause-vehicle">
          <h2 class="oc-pause-sub">CHANGE VEHICLE</h2>
          <div class="pause-garage" id="pause-garage"></div>
          <p class="oc-pause-hint">Click a car · ESC back to menu</p>
        </div>
        <div class="oc-pause-controls">
          CONTROLS: WASD / ARROWS drive · SPACE handbrake / drift · C look back · CTRL+F fullscreen · R reset
        </div>
      </div>
    </div>
    <div class="touch hidden" id="touch">
      <div class="top-btns">
        <button id="tpause">Pause</button>
        <button id="treset">Reset</button>
      </div>
      <div class="steer" id="steer"><div class="knob" id="knob"></div></div>
      <div class="pedals">
        <button class="pedal" id="brake">Brake</button>
        <button class="pedal" id="gas">Drive</button>
      </div>
    </div>
  `;

  const garage = root.querySelector('#garage');
  CARS.forEach((car) => {
    const el = document.createElement('button');
    el.className = 'car-card' + (car.id === DEFAULT_CAR_ID ? ' active' : '');
    el.dataset.id = car.id;
    el.innerHTML = `<h3>${car.name}</h3>`;
    garage.appendChild(el);
  });

  const pauseGarage = root.querySelector('#pause-garage');
  if (pauseGarage) {
    CARS.forEach((car) => {
      const el = document.createElement('button');
      el.className = 'pause-car-btn' + (car.id === DEFAULT_CAR_ID ? ' active' : '');
      el.dataset.id = car.id;
      el.textContent = car.name.toUpperCase();
      pauseGarage.appendChild(el);
    });
  }
}

export function bindGarage(root, onPick) {
  root.querySelector('#garage').addEventListener('click', (e) => {
    const card = e.target.closest('.car-card');
    if (!card) return;
    root.querySelectorAll('.car-card').forEach((c) => c.classList.toggle('active', c === card));
    onPick(card.dataset.id);
  });
}

export function setDriveButtonState(root, mode) {
  const btn = root.querySelector('#drive');
  if (!btn) return;
  if (mode === 'loading') {
    btn.disabled = true;
    btn.textContent = 'Loading car…';
  } else if (mode === 'ready') {
    btn.disabled = false;
    btn.textContent = 'Begin Drive';
  } else if (mode === 'error') {
    btn.disabled = false;
    btn.textContent = 'Begin Drive (fallback)';
  }
}

export function drawMinimap(canvas, highway, vehicle) {
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

  ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
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

  const f = highway.at(vehicle.s);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-f.heading + Math.PI);
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 3;
  for (let ds = -160; ds <= 200; ds += 8) {
    const p = highway.at(Math.max(0, vehicle.s + ds));
    const x = (p.x - f.x) * 0.38;
    const y = (p.z - f.z) * 0.38;
    if (ds === -160) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#f0b429';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 7);
  ctx.lineTo(cx - 5, cy + 5);
  ctx.lineTo(cx + 5, cy + 5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}
