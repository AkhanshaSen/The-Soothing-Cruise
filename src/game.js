import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { World, ROAD_HALF, ROAD_SURFACE, SKY } from './world.js';
import { drawMinimap, drawFullMap } from './minimap.js';
import { updatePauseMenu, handlePauseNav, PAUSE_ACTIONS } from './ui/pause.js';
import { SkySystem } from './sky.js';
import { updateDrive } from './vehicle/drive.js';
import { CARS } from './vehicle/catalog.js';

// --- DOM ---
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const loadingEl = document.getElementById('loading');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');
const previewEl = document.getElementById('preview');
const previewGarage = document.getElementById('preview-garage');
const beginDriveBtn = document.getElementById('begin-drive');
const speedEl = document.getElementById('speed-value');
const gearEl = document.getElementById('gear');
const hudCarEl = document.getElementById('hud-car');
const carPicker = document.getElementById('car-picker');
const pauseEl = document.getElementById('pause');
const pauseCarEl = document.getElementById('pause-car');
const pauseGarage = document.getElementById('pause-garage');
const pauseMenu = document.getElementById('pause-menu');
const mapOverlay = document.getElementById('map-overlay');
const mapBackBtn = document.getElementById('map-back');
const minimapBtn = document.getElementById('minimap-btn');
const minimapCanvas = document.getElementById('minimap');
const fullmapCanvas = document.getElementById('fullmap');
const timeModeSelect = document.getElementById('time-mode');
const cycleMinSelect = document.getElementById('cycle-min');

const uiRoot = document.body;
const input = { forward: false, back: false, left: false, right: false };

function bindButton(id, key) {
  const btn = document.getElementById(id);
  const press = () => {
    input[key] = true;
    btn.classList.add('pressed');
  };
  const release = () => {
    input[key] = false;
    btn.classList.remove('pressed');
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
}

bindButton('btn-forward', 'forward');
bindButton('btn-back', 'back');
bindButton('btn-left', 'left');
bindButton('btn-right', 'right');

const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  arrowUp: false,
  arrowDown: false,
  pause: false,
  map: false,
  reset: false,
  enter: false,
};

let pauseEdge = false;
let mapEdge = false;
let resetEdge = false;
let menuUpEdge = false;
let menuDownEdge = false;
let menuEnterEdge = false;
let pauseIndex = 0;
let pauseView = 'menu';

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    input.forward = true;
    keys.forward = true;
  }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    input.back = true;
    keys.back = true;
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    input.left = true;
    keys.left = true;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    input.right = true;
    keys.right = true;
  }
  if (e.code === 'ArrowUp') keys.arrowUp = true;
  if (e.code === 'ArrowDown') keys.arrowDown = true;
  if (e.code === 'Escape') keys.pause = true;
  if (e.code === 'KeyM') keys.map = true;
  if (e.code === 'KeyR') keys.reset = true;
  if (e.code === 'Enter') keys.enter = true;
  if (e.code === 'Enter' && mode === 'preview') startDrive();
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'KeyW') {
    input.forward = false;
    keys.forward = false;
  }
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    input.back = false;
    keys.back = false;
  }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    input.left = false;
    keys.left = false;
  }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    input.right = false;
    keys.right = false;
  }
  if (e.code === 'ArrowUp') keys.arrowUp = false;
  if (e.code === 'ArrowDown') keys.arrowDown = false;
  if (e.code === 'Escape') keys.pause = false;
  if (e.code === 'KeyM') keys.map = false;
  if (e.code === 'KeyR') keys.reset = false;
  if (e.code === 'Enter') keys.enter = false;
});

function setLoading(progress, label) {
  loadingFill.style.width = `${Math.round(progress * 100)}%`;
  if (label) loadingStatus.textContent = label;
}

function showPreview() {
  loadingEl.classList.add('hidden');
  previewEl.classList.remove('hidden');
  hud.classList.add('hidden');
  pauseEl.classList.add('hidden');
  mapOverlay.classList.add('hidden');
}

function startDrive() {
  previewEl.classList.add('hidden');
  hud.classList.remove('hidden');
  mode = 'drive';
  state.speed = 0;
}

beginDriveBtn.addEventListener('click', startDrive);
mapBackBtn.addEventListener('click', () => setMapOpen(false));
minimapBtn.addEventListener('click', () => {
  if (mode === 'drive' || mode === 'map') setMapOpen(!mapOpen);
});

function activeCarLabel() {
  return CAR_MODELS.find((c) => c.id === activeCarId)?.label ?? 'Sports';
}

function refreshPauseUi() {
  updatePauseMenu(uiRoot, { index: pauseIndex, carName: activeCarLabel(), view: pauseView });
}

function setPaused(v) {
  if (mode !== 'drive' && mode !== 'paused') return;
  if (v && mapOpen) setMapOpen(false);
  mode = v ? 'paused' : 'drive';
  pauseEl.classList.toggle('hidden', !v);
  if (v) {
    pauseIndex = 0;
    pauseView = 'menu';
    refreshPauseUi();
  }
}

let mapOpen = false;

function setMapOpen(v) {
  if (v && mode !== 'drive' && mode !== 'paused') return;
  if (v && mode === 'paused') setPaused(false);
  mapOpen = v;
  mapOverlay.classList.toggle('hidden', !v);
  if (v) {
    mode = 'map';
    drawFullMap(fullmapCanvas, world.highway, state);
  } else if (mode === 'map') {
    mode = 'drive';
  }
}

function runPauseAction(action) {
  if (action === 'resume') setPaused(false);
  else if (action === 'restart') restartDrive();
}

function activatePauseItem(index) {
  pauseIndex = index;
  const action = PAUSE_ACTIONS[index];
  if (action === 'settings') {
    pauseView = 'settings';
    refreshPauseUi();
    return;
  }
  if (action === 'vehicle') {
    pauseView = 'vehicle';
    refreshPauseUi();
    return;
  }
  runPauseAction(action);
}

pauseMenu.querySelectorAll('li').forEach((li, i) => {
  li.addEventListener('click', () => {
    if (mode !== 'paused') return;
    activatePauseItem(i);
  });
});

function restartDrive() {
  state.s = 40;
  state.lateral = 0;
  state.yawOffset = 0;
  state.steerAngle = 0;
  state.steerVel = 0;
  state.rollLoad = 0;
  state.pitchLoad = 0;
  state.speed = 0;
  const start = world.highway.at(state.s);
  applyCarTransform(start);
  world.recenter(start.x, start.y, start.z);
  world.sync(state.s);
  camInit = false;
  setPaused(false);
}

function handlePauseInput() {
  const result = handlePauseNav(uiRoot, {
    up: keys.arrowUp && !menuUpEdge,
    down: keys.arrowDown && !menuDownEdge,
    confirm: keys.enter && !menuEnterEdge,
    back: keys.pause && !pauseEdge,
    index: pauseIndex,
    view: pauseView,
    onAction: runPauseAction,
    onViewChange: (view) => {
      pauseView = view;
      refreshPauseUi();
    },
  });

  if (result.index !== pauseIndex) pauseIndex = result.index;
  if (result.view !== pauseView) pauseView = result.view;

  menuUpEdge = keys.arrowUp;
  menuDownEdge = keys.arrowDown;
  menuEnterEdge = keys.enter;
}

pauseGarage.addEventListener('click', (e) => {
  const btn = e.target.closest('.pause-car-btn');
  if (!btn) return;
  const model = CAR_MODELS.find((c) => c.id === btn.dataset.id);
  if (model) setCar(model);
});

function handleMenuKeys() {
  if (keys.pause && !pauseEdge) {
    if (mapOpen) setMapOpen(false);
    else if (mode === 'paused' && pauseView !== 'menu') {
      pauseView = 'menu';
      refreshPauseUi();
    } else if (mode === 'drive') setPaused(true);
    else if (mode === 'paused') setPaused(false);
  }
  pauseEdge = keys.pause;

  if (keys.map && !mapEdge) {
    if (mode === 'drive' || mode === 'map') setMapOpen(!mapOpen);
    else if (mode === 'paused') setMapOpen(true);
  }
  mapEdge = keys.map;

  if (mode === 'paused') handlePauseInput();
}

timeModeSelect?.addEventListener('change', () => skySystem.setMode(timeModeSelect.value));
cycleMinSelect?.addEventListener('change', () => {
  skySystem.setCycleMinutes(parseFloat(cycleMinSelect.value) || 4);
});

// --- Kenney cars ---
const CAR_MODELS = [
  { id: 'sport', label: 'Sports', file: 'sedan-sports.glb' },
  { id: 'hatch', label: 'Hatch', file: 'hatchback-sports.glb' },
  { id: 'sedan', label: 'Sedan', file: 'sedan.glb' },
  { id: 'race', label: 'Race', file: 'race.glb' },
  { id: 'suv', label: 'SUV', file: 'suv.glb' },
  { id: 'van', label: 'Van', file: 'van.glb' },
];

const gltfLoader = new GLTFLoader();
gltfLoader.setPath('./assets/vehicles/');
const modelCache = new Map();

async function loadKenneyCar(file, spec) {
  const cacheKey = spec?.id ? `${file}:${spec.id}` : file;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey).clone(true);

  const gltf = await gltfLoader.loadAsync(file);
  // Kenney assets are rotated per-car-kit via `modelYaw` (catalog.js).
  if (spec?.modelYaw != null) gltf.scene.rotation.y = spec.modelYaw;
  const root = new THREE.Group();
  root.add(gltf.scene);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.z, 0.001);
  root.scale.setScalar(4.2 / length);

  box.setFromObject(root);
  const lift = -box.min.y;
  for (const child of root.children) child.position.y += lift;

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      m.side = THREE.DoubleSide;
    }
  });

  modelCache.set(cacheKey, root);
  return root.clone(true);
}

function buildFallbackCar() {
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xe53935 }),
  );
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  return car;
}

function syncCarButtons() {
  const all = [
    ...previewGarage.querySelectorAll('button'),
    ...carPicker.querySelectorAll('button'),
    ...pauseGarage.querySelectorAll('button'),
  ];
  for (const b of all) b.classList.toggle('active', b.dataset.id === activeCarId);
}

function updateHudCarLabel(label) {
  hudCarEl.textContent = label.toUpperCase();
  pauseCarEl.textContent = label;
}

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(SKY);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 55, 180);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xa9d2ff, 0x3d5058, 0.55);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffe6bd, 1.25);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 140;
const sh = 28;
sun.shadow.camera.left = -sh;
sun.shadow.camera.right = sh;
sun.shadow.camera.top = sh;
sun.shadow.camera.bottom = -sh;
sun.shadow.bias = -0.0002;
scene.add(sun);
scene.add(sun.target);

const skySystem = new SkySystem(scene, sun, hemi, ambient);

const world = new World();
scene.add(world.stage);

const state = {
  s: 40,
  lateral: 0,
  yawOffset: 0,
  steerAngle: 0,
  steerVel: 0,
  rollLoad: 0,
  pitchLoad: 0,
  speed: 0,
};

let car = buildFallbackCar();
car.frustumCulled = true;
scene.add(car);

let activeCarId = 'sport';
let activeCarSpec = CARS.find((c) => c.id === activeCarId) ?? CARS[0];
let swapping = false;
let ready = false;
let frameCounter = 0;
/** @type {'loading' | 'preview' | 'drive' | 'paused' | 'map'} */
let mode = 'loading';

async function setCar(model) {
  if (swapping) return;
  swapping = true;
  try {
    const spec = CARS.find((c) => c.id === model.id) ?? activeCarSpec;
    const next = await loadKenneyCar(model.file, spec);
    scene.remove(car);
    car = next;
    car.frustumCulled = true;
    scene.add(car);
    applyCarTransform(world.highway.at(state.s));
    activeCarId = model.id;
    activeCarSpec = spec;
    syncCarButtons();
    updateHudCarLabel(model.label);
  } catch (err) {
    console.warn('Kenney car failed', err);
  } finally {
    swapping = false;
  }
}

function addCarButton(container, model) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = model.label;
  btn.dataset.id = model.id;
  btn.classList.toggle('active', model.id === activeCarId);
  btn.addEventListener('click', () => setCar(model));
  container.appendChild(btn);
}

for (const model of CAR_MODELS) {
  addCarButton(previewGarage, model);
  addCarButton(carPicker, model);
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'pause-car-btn' + (model.id === activeCarId ? ' active' : '');
  pauseBtn.dataset.id = model.id;
  pauseBtn.textContent = model.label.toUpperCase();
  pauseBtn.addEventListener('click', () => setCar(model));
  pauseGarage.appendChild(pauseBtn);
}

const MAX_SPEED = 125;
const CRUISE_ACCEL = 35;
const BRAKE_FORCE = 75;
const PREVIEW_SPEED = 22;

const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camCur = new THREE.Vector3();
const _lookCur = new THREE.Vector3();
let camInit = false;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function damp(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

function gearForSpeed(speed) {
  const kmh = Math.abs(speed) * 3.6;
  if (kmh < 40) return 1;
  if (kmh < 90) return 2;
  if (kmh < 160) return 3;
  if (kmh < 260) return 4;
  if (kmh < 360) return 5;
  return 6;
}

function playerWorld(f) {
  const carYaw = f.heading + state.yawOffset;
  return {
    x: f.nx * state.lateral,
    y: ROAD_SURFACE + 0.02,
    z: f.nz * state.lateral,
    yaw: carYaw,
    roll: state.rollLoad * 0.12,
    pitch: state.pitchLoad * 0.04,
    tx: Math.cos(carYaw),
    tz: Math.sin(carYaw),
  };
}

function applyCarTransform(f) {
  const frame = f ?? world.highway.at(state.s);
  const p = playerWorld(frame);
  car.position.set(p.x, p.y, p.z);
  car.rotation.order = 'YXZ';
  car.rotation.set(p.pitch, p.yaw, p.roll);
}

function updateCamera(p, dt) {
  const speedKmh = Math.abs(state.speed) * 3.6;
  const speedT = clamp(speedKmh / 250, 0, 1);
  const camDist = 11 + 5 * speedT * speedT;
  const camH = 5;
  const look = 14;
  _camPos.set(p.x - p.tx * camDist, p.y + camH, p.z - p.tz * camDist);
  _camLook.set(p.x + p.tx * look, p.y + 1.0, p.z + p.tz * look);

  if (!camInit) {
    _camCur.copy(_camPos);
    _lookCur.copy(_camLook);
    camInit = true;
  }

  const smooth = 1 - Math.exp(-5.5 * dt);
  _camCur.lerp(_camPos, smooth);
  _lookCur.lerp(_camLook, smooth);
  camera.position.copy(_camCur);
  camera.lookAt(_lookCur);

  // Speed FOV (opencity: 62°→80° between 0 and ~200 km/h)
  camera.fov = damp(camera.fov, 62 + 18 * speedT * speedT, 3.0, dt);
  camera.updateProjectionMatrix();
}

function updateHud() {
  speedEl.textContent = String(Math.round(Math.abs(state.speed) * 3.6));
  gearEl.textContent = `GEAR ${gearForSpeed(state.speed)}`;
  if (frameCounter % 4 === 0) drawMinimap(minimapCanvas, world.highway, state);
  if (mapOpen) drawFullMap(fullmapCanvas, world.highway, state);
}

function simulateDrive(dt) {
  let throttle = 0;
  if (input.forward) throttle += 1;
  if (input.back) throttle -= 1;

  const speed = Math.abs(state.speed);
  const speedRatio = clamp(speed / MAX_SPEED, 0, 1);
  const accelScale = 1 - speedRatio * 0.82;
  const drag = 0.6 + speedRatio * 3.5 + speed * speed * 0.0035;

  if (throttle > 0) {
    state.speed += CRUISE_ACCEL * accelScale * dt;
  } else if (throttle < 0) {
    if (state.speed > 3) state.speed -= BRAKE_FORCE * dt;
    else state.speed -= CRUISE_ACCEL * 0.35 * dt;
  } else {
    const sign = Math.sign(state.speed);
    state.speed = Math.max(0, speed - drag * dt) * sign;
  }

  // Avoid reverse in this simplified road streamer (keeps `s` stable for highway.at()).
  state.speed = clamp(state.speed, 0, MAX_SPEED);

  const steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  updateDrive(state, { steer: steerIn }, dt, activeCarSpec);

  // Body roll: proportional to centripetal force proxy
  const lateralA = state.steerAngle * Math.abs(state.speed);
  state.rollLoad = damp(state.rollLoad, clamp(lateralA * 0.08, -1, 1), 4.0, dt);

  // Pitch: nose dips under braking, squats under throttle
  const targetPitch = throttle < 0 ? -0.55 : throttle > 0 ? 0.28 : 0;
  state.pitchLoad = damp(state.pitchLoad, targetPitch, 3.5, dt);

  const edge = ROAD_HALF - 0.8;
  const over = Math.abs(state.lateral) - edge;
  if (over > 0) {
    state.lateral = Math.sign(state.lateral || 1) * edge;
    state.yawOffset = damp(state.yawOffset, 0, 6, dt);
    state.speed *= Math.max(0, 1 - over * 8 * dt);
  }

  state.lateral = clamp(state.lateral, -ROAD_HALF, ROAD_HALF);
}

function syncWorld(dt) {
  const f = world.highway.at(state.s);
  applyCarTransform(f);
  world.recenter(f.x, f.y, f.z);
  world.sync(state.s);

  const p = playerWorld(f);
  const sky = skySystem.update(dt, p);
  world.setNightLevel(sky.night, p);
  updateCamera(p, dt);
}

function update(dt) {
  frameCounter++;
  handleMenuKeys();

  if (keys.reset && !resetEdge && mode === 'drive') restartDrive();
  resetEdge = keys.reset;

  if (mode === 'preview') {
    state.speed = PREVIEW_SPEED;
    state.steerAngle = 0;
    state.steerVel = 0;
    state.yawOffset = 0;
    state.lateral = 0;
    updateDrive(state, { steer: 0 }, dt, activeCarSpec);
    syncWorld(dt);
    return;
  }

  if (mode === 'drive') {
    simulateDrive(dt);
    syncWorld(dt);
    updateHud();
    return;
  }

  if (mode === 'paused' || mode === 'map') {
    syncWorld(dt);
    updateHud();
  }
}

const clock = new THREE.Clock();

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function tick() {
  if (ready) update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  tick();

  try {
    setLoading(0.05, 'Loading world…');
    await world.init((p, label) => setLoading(0.05 + p * 0.75, `Loading ${label}…`));

    setLoading(0.85, 'Loading car…');
    await setCar(CAR_MODELS[0]);

    world.sync(state.s);
    const start = world.highway.at(state.s);
    applyCarTransform(start);
    world.recenter(start.x, start.y, start.z);

    setLoading(1, 'Ready!');
    await new Promise((r) => setTimeout(r, 350));
    showPreview();
    mode = 'preview';
    ready = true;
  } catch (err) {
    loadingStatus.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

boot();
