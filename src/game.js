import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { World, ROAD_HALF, ROAD_SURFACE, SKY } from './world.js';
import { drawMinimap, drawFullMap } from './minimap.js';
import { updatePauseMenu, handlePauseNav, PAUSE_ACTIONS, loadGfx, saveGfx, TIME_MODES, GFX_RES, GFX_DIST, GFX_SHADOWS, cycleSetting } from './ui/pause.js';
import { SkySystem } from './sky.js';
import { stepVehicle } from './vehicle/drive.js';
import { ChaseCamera } from './vehicle/camera.js';
import { tickWater } from './water.js';
import { CARS } from './vehicle/catalog.js';
import { Input, driverInputFrom } from './core/input.js';
import { bindTouch } from './ui/touch.js';
import { Headlights } from './vehicle/lights.js';
import { SkidFx } from './fx/skids.js';
import {
  HighwayRace,
  RACE_LENGTHS,
  RACE_LENGTH_LABELS,
  RACE_DIFFS,
  RACE_DIFF_LABELS,
} from './race/highway.js';

// --- DOM ---
const canvas = document.getElementById('game');
const hud = document.getElementById('hud');
const loadingEl = document.getElementById('loading');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');
const previewEl = document.getElementById('preview');
const previewGarage = document.getElementById('preview-garage');
const beginDriveBtn = document.getElementById('begin-drive');
const beginRaceBtn = document.getElementById('begin-race');
const speedEl = document.getElementById('speed-value');
const gearEl = document.getElementById('gear');
const hudCarEl = document.getElementById('hud-car');
const hudHintEl = document.getElementById('hud-hint');
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
const settingsList = document.getElementById('settings-list');
const touchEl = document.getElementById('touch');
const rotateHintEl = document.getElementById('rotate-hint');
const raceHudEl = document.getElementById('race-hud');
const racePosEl = document.getElementById('race-pos');
const raceTimeEl = document.getElementById('race-time');
const raceCountdownEl = document.getElementById('race-countdown');
const xmasGoText = document.getElementById('xmas-go-text');
const xmasBulbs = {
  preL: document.querySelector('[data-bulb="pre-l"]'),
  preR: document.querySelector('[data-bulb="pre-r"]'),
  stageL: document.querySelector('[data-bulb="stage-l"]'),
  stageR: document.querySelector('[data-bulb="stage-r"]'),
  amber0: document.querySelector('[data-bulb="amber-0"]'),
  amber1: document.querySelector('[data-bulb="amber-1"]'),
  amber2: document.querySelector('[data-bulb="amber-2"]'),
  greenL: document.querySelector('[data-bulb="green-l"]'),
  greenR: document.querySelector('[data-bulb="green-r"]'),
};
const raceResultsEl = document.getElementById('race-results');
const raceResultsPlace = document.getElementById('race-results-place');
const raceResultsTime = document.getElementById('race-results-time');
const raceResultsMedal = document.getElementById('race-results-medal');
const raceResultsOk = document.getElementById('race-results-ok');
const pauseRaceEl = document.getElementById('pause-race');
const raceSetupList = document.getElementById('race-setup-list');

const uiRoot = document.body;
const driveInput = new Input();

/** Live check — DevTools device mode often fails a one-shot `(pointer: coarse)` at load. */
function wantsTouchUi() {
  try {
    if (typeof matchMedia === 'function') {
      if (matchMedia('(pointer: coarse)').matches) return true;
      if (matchMedia('(hover: none)').matches) return true;
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
  if ('ontouchstart' in window) return true;
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  // Phone-sized viewport (Chrome device emulator / small windows)
  if (w > 0 && h > 0 && Math.min(w, h) <= 520) return true;
  return false;
}

/** GFX defaults captured once at boot. */
const isCoarse = wantsTouchUi();

if (wantsTouchUi() && hudHintEl) {
  hudHintEl.textContent = 'Joystick: steer · up drive · down brake · Drift pedal · or use pedals';
}

function isPortraitPhone() {
  return wantsTouchUi() && window.innerHeight > window.innerWidth;
}

function updateRotateHint() {
  if (!rotateHintEl) return;
  const show = mode === 'drive' && isPortraitPhone();
  rotateHintEl.classList.toggle('hidden', !show);
}

function setTouchVisible(v) {
  if (!touchEl) return;
  const show = !!v && wantsTouchUi();
  touchEl.classList.toggle('hidden', !show);
  updateRotateHint();
}

async function lockLandscape() {
  if (!wantsTouchUi()) return;
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    /* browsers / DevTools often block this without fullscreen */
  }
  updateRotateHint();
}

let pauseIndex = 0;
let pauseView = 'menu';
let pauseSettingsIndex = 0;
let pauseRaceIndex = 0;
let raceSetup = { lengthIdx: 1, diffIdx: 1 };
/** @type {HighwayRace | null} */
let activeRace = null;
let raceStarting = false;
let lastNight = 0;

function raceSetupLabels() {
  return {
    lengthLabel: RACE_LENGTH_LABELS[raceSetup.lengthIdx],
    diffLabel: RACE_DIFF_LABELS[raceSetup.diffIdx],
  };
}

let gfx = loadGfx();
if (wantsTouchUi() && gfx.resIdx > 1) {
  gfx = { ...gfx, resIdx: 1 };
  saveGfx(gfx);
}

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
  raceHudEl?.classList.add('hidden');
  raceCountdownEl?.classList.add('hidden');
  raceResultsEl?.classList.add('hidden');
  raceResultsEl?.classList.remove('showing');
  setTouchVisible(false);
}

function startDrive() {
  endRace(false);
  previewEl.classList.add('hidden');
  hud.classList.remove('hidden');
  raceHudEl?.classList.add('hidden');
  raceCountdownEl?.classList.add('hidden');
  raceResultsEl?.classList.add('hidden');
  mode = 'drive';
  state.s = 40;
  state.lateral = 0;
  state.yawOffset = 0;
  state.steerAngle = 0;
  state.steerVel = 0;
  state.speed = 0;
  _simAcc = 0;
  lookYaw = 0;
  lookPitch = 0;
  chaseCam.reset();
  canvas.focus({ preventScroll: true });
  setTouchVisible(true);
  if (wantsTouchUi()) enterFullscreen();
  else requestPointerLock();
}

beginDriveBtn.addEventListener('click', startDrive);
beginRaceBtn?.addEventListener('click', () => {
  raceSetup.lengthIdx = 1;
  raceSetup.diffIdx = 1;
  startRaceFromSetup();
});
document.getElementById('preview-fullscreen')?.addEventListener('click', () => {
  enterFullscreen();
});
raceResultsOk?.addEventListener('click', () => endRace(true));
mapBackBtn.addEventListener('click', () => setMapOpen(false));
minimapBtn.addEventListener('click', () => {
  if (mode === 'drive' || mode === 'map') setMapOpen(!mapOpen);
});

function activeCarLabel() {
  return CAR_MODELS.find((c) => c.id === activeCarId)?.label ?? 'Sports';
}

function refreshPauseUi() {
  updatePauseMenu(uiRoot, {
    index: pauseIndex,
    carName: activeCarLabel(),
    view: pauseView,
    settingsIndex: pauseSettingsIndex,
    gfx,
    raceIndex: pauseRaceIndex,
    raceSetup: raceSetupLabels(),
  });
}

function setPaused(v) {
  if (mode !== 'drive' && mode !== 'paused') return;
  if (v && mapOpen) setMapOpen(false);
  mode = v ? 'paused' : 'drive';
  pauseEl.classList.toggle('hidden', !v);
  setTouchVisible(!v);
  if (v) {
    pauseIndex = 0;
    pauseView = 'menu';
    pauseSettingsIndex = 0;
    refreshPauseUi();
    document.exitPointerLock?.();
    lookYaw = 0;
    lookPitch = 0;
    if (driveInput.touch) {
      driveInput.touch.steer = 0;
      driveInput.touch.throttle = 0;
      driveInput.touch.brake = 0;
      driveInput.touch.handbrake = 0;
    }
  } else if (!flyMode) {
    canvas.focus({ preventScroll: true });
    if (!wantsTouchUi()) requestPointerLock();
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
    setTouchVisible(false);
    drawFullMap(fullmapCanvas, world.highway, state);
  } else if (mode === 'map') {
    mode = 'drive';
    setTouchVisible(true);
  }
}

function runPauseAction(action) {
  if (action === 'resume') setPaused(false);
  else if (action === 'restart') restartDrive();
  else if (action === 'fullscreen') {
    // Keep pause open; fullscreen is a display mode, not a menu exit.
    enterFullscreen();
  }
}

function activatePauseItem(index) {
  pauseIndex = index;
  refreshPauseUi();
  const action = PAUSE_ACTIONS[index];
  if (action === 'settings') {
    pauseView = 'settings';
    pauseSettingsIndex = 0;
    refreshPauseUi();
    return;
  }
  if (action === 'vehicle') {
    pauseView = 'vehicle';
    refreshPauseUi();
    return;
  }
  if (action === 'race') {
    pauseView = 'race';
    pauseRaceIndex = 0;
    refreshPauseUi();
    return;
  }
  runPauseAction(action);
}

// Direct tap → run that option immediately (no select-then-confirm).
pauseMenu.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-action]');
  if (!li || mode !== 'paused' || pauseView !== 'menu') return;
  e.preventDefault();
  e.stopPropagation();
  const action = li.dataset.action;
  const index = PAUSE_ACTIONS.indexOf(action);
  if (index < 0) return;
  activatePauseItem(index);
});

function backToPauseMenu() {
  if (mode !== 'paused') return;
  pauseView = 'menu';
  refreshPauseUi();
}

document.getElementById('pause-settings-back')?.addEventListener('click', backToPauseMenu);
document.getElementById('pause-vehicle-back')?.addEventListener('click', backToPauseMenu);
document.getElementById('pause-race-back')?.addEventListener('click', backToPauseMenu);

raceSetupList?.addEventListener('click', (e) => {
  const row = e.target.closest('.settings-row');
  if (!row || mode !== 'paused' || pauseView !== 'race') return;
  const kind = row.dataset.race;
  const rows = [...raceSetupList.querySelectorAll('.settings-row')];
  pauseRaceIndex = Math.max(0, rows.indexOf(row));
  if (kind === 'start') {
    startRaceFromSetup();
    return;
  }
  if (kind === 'length') {
    raceSetup.lengthIdx = (raceSetup.lengthIdx + 1) % RACE_LENGTHS.length;
  } else if (kind === 'diff') {
    raceSetup.diffIdx = (raceSetup.diffIdx + 1) % RACE_DIFFS.length;
  }
  refreshPauseUi();
});

function restartDrive() {
  if (activeRace) {
    startRaceFromSetup();
    return;
  }
  state.s = 40;
  state.lateral = 0;
  state.yawOffset = 0;
  state.steerAngle = 0;
  state.steerVel = 0;
  state.vy = 0;
  state.r = 0;
  state.gear = 0;
  state.rpm = 1050;
  state.throttle = 0;
  state.brake = 0;
  state.handbrake = 0;
  state.rollLoad = 0;
  state.pitchLoad = 0;
  state.speed = 0;
  _simAcc = 0;
  chaseCam.reset();
  const start = world.highway.at(state.s);
  applyCarTransform(start);
  world.recenter(start.x, 0, start.z);
  world.syncImmediate(state.s);
  setPaused(false);
}

function handlePauseInput() {
  const result = handlePauseNav(uiRoot, {
    up: driveInput.menuUpPressed,
    down: driveInput.menuDownPressed,
    left: driveInput.menuLeftPressed,
    right: driveInput.menuRightPressed,
    confirm: driveInput.confirmPressed,
    back: false,
    index: pauseIndex,
    view: pauseView,
    settingsIndex: pauseSettingsIndex,
    raceIndex: pauseRaceIndex,
    raceSetup: raceSetupLabels(),
    gfx,
    onAction: runPauseAction,
    onViewChange: (view) => {
      pauseView = view;
      if (view === 'settings') pauseSettingsIndex = 0;
      if (view === 'race') pauseRaceIndex = 0;
      refreshPauseUi();
    },
    onGfxChange: (next) => {
      gfx = next;
      saveGfx(gfx);
      applyGfx();
      refreshPauseUi();
    },
    onRaceChange: (row, dir) => {
      if (row === 0) {
        raceSetup.lengthIdx = (raceSetup.lengthIdx + dir + RACE_LENGTHS.length) % RACE_LENGTHS.length;
      } else if (row === 1) {
        raceSetup.diffIdx = (raceSetup.diffIdx + dir + RACE_DIFFS.length) % RACE_DIFFS.length;
      }
      refreshPauseUi();
    },
    onRaceStart: () => startRaceFromSetup(),
    mobile: wantsTouchUi(),
  });

  if (result.index !== pauseIndex) pauseIndex = result.index;
  if (result.view !== pauseView) pauseView = result.view;
  if (result.settingsIndex !== pauseSettingsIndex) pauseSettingsIndex = result.settingsIndex;
  if (result.raceIndex != null && result.raceIndex !== pauseRaceIndex) pauseRaceIndex = result.raceIndex;
}

pauseGarage.addEventListener('click', (e) => {
  const btn = e.target.closest('.pause-car-btn');
  if (!btn) return;
  const model = CAR_MODELS.find((c) => c.id === btn.dataset.id);
  if (model) setCar(model);
});

function handleMenuKeys() {
  if (driveInput.pausePressed) {
    if (mapOpen) setMapOpen(false);
    else if (mode === 'paused' && pauseView !== 'menu') {
      pauseView = 'menu';
      refreshPauseUi();
    } else if (mode === 'drive') setPaused(true);
    else if (mode === 'paused') setPaused(false);
  }

  if (driveInput.mapPressed) {
    if (mode === 'drive' || mode === 'map') setMapOpen(!mapOpen);
    else if (mode === 'paused') setMapOpen(true);
  }

  if (mode === 'paused') handlePauseInput();
}

const CAR_MODELS = [
  { id: 'sport', label: 'Sports', file: 'sedan-sports.glb' },
  { id: 'hatch', label: 'Hatch', file: 'hatchback-sports.glb' },
  { id: 'sedan', label: 'Sedan', file: 'sedan.glb' },
  { id: 'race', label: 'Race', file: 'race.glb' },
  { id: 'f1', label: 'Formula 1', file: 'race-future.glb' },
  { id: 'suv', label: 'SUV', file: 'suv.glb' },
  { id: 'van', label: 'Van', file: 'van.glb' },
  { id: 'police', label: 'Police', file: 'police.glb' },
];

const gltfLoader = new GLTFLoader();
gltfLoader.setPath('./assets/vehicles/');
const modelCache = new Map();

/**
 * Measure Kenney nose from wheel hubs (front − back) and store as modelForward.
 * Runtime aligns that axis to physics heading via setFromUnitVectors — no Euler guessing.
 */
function measureModelForward(root) {
  const fronts = [];
  const backs = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const name = (child.name || '').toLowerCase();
    if (!name.includes('wheel')) return;
    const world = new THREE.Vector3();
    child.getWorldPosition(world);
    const local = root.worldToLocal(world);
    if (name.includes('front')) fronts.push(local.clone());
    else if (name.includes('back') || name.includes('rear')) backs.push(local.clone());
  });

  const avg = (list) => {
    const o = new THREE.Vector3();
    for (const p of list) o.add(p);
    return list.length ? o.multiplyScalar(1 / list.length) : null;
  };
  const front = avg(fronts);
  const back = avg(backs);
  if (front && back) {
    const fwd = front.sub(back);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-8) return fwd.normalize();
  }
  return new THREE.Vector3(0, 0, 1);
}

async function loadKenneyCar(file, spec) {
  const cacheKey = spec?.id ? `${file}:${spec.id}` : file;
  if (modelCache.has(cacheKey)) {
    const clone = modelCache.get(cacheKey).clone(true);
    clone.userData.modelForward = modelCache.get(cacheKey).userData.modelForward.clone();
    return clone;
  }

  const gltf = await gltfLoader.loadAsync(file);
  const root = new THREE.Group();
  root.add(gltf.scene);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.z, 0.001);
  root.scale.setScalar((spec?.modelLength ?? 4.2) / length);

  box.setFromObject(root);
  const lift = -box.min.y;
  for (const child of root.children) child.position.y += lift;

  root.userData.modelForward = measureModelForward(root);
  bindCarWheels(root);

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
  const out = root.clone(true);
  out.userData.modelForward = root.userData.modelForward.clone();
  bindCarWheels(out);
  return out;
}

/** Kenney hubs: wheel-front/back-left/right. Steer Y, spin X (axle along X). */
function bindCarWheels(root) {
  const wheels = [];
  root.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (!n.includes('wheel')) return;
    if (!n.includes('left') && !n.includes('right')) return;
    o.rotation.order = 'YXZ';
    wheels.push({ obj: o, front: n.includes('front'), spin: 0 });
  });
  root.userData.wheels = wheels;
}

function updateCarWheels(dt) {
  const wheels = car?.userData?.wheels;
  if (!wheels?.length) return;
  const radius = 0.34;
  const dSpin = ((state.speed ?? 0) / radius) * dt;
  const steer = -(state.steerAngle ?? 0);
  for (const w of wheels) {
    w.spin += dSpin;
    w.obj.rotation.x = w.spin;
    w.obj.rotation.y = w.front ? steer : 0;
  }
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
  car.userData.modelForward = new THREE.Vector3(0, 0, 1);
  return car;
}

/** Scratch for aligning mesh nose to physics forward. */
const _physFwd = new THREE.Vector3();
const _modelFwd = new THREE.Vector3();

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isCoarse });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1 : 1.5));
renderer.setClearColor(SKY);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 80, 560);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
const chaseCam = new ChaseCamera(camera);

let flyMode = false;
let flySpeed = 60;
let lookYaw = 0;
let lookPitch = 0;
let pointerLocked = false;

function requestPointerLock() {
  if (wantsTouchUi()) return;
  if (mode === 'drive' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
}

function toggleFullscreen() {
  enterFullscreen();
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

let _fsBusy = false;
async function enterFullscreen() {
  if (_fsBusy) return;
  _fsBusy = true;
  const root = document.documentElement;
  try {
    if (isFullscreen()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else if (root.requestFullscreen) {
      try {
        await root.requestFullscreen();
      } catch {
        try {
          await root.requestFullscreen({ navigationUI: 'hide' });
        } catch (err2) {
          console.warn('Fullscreen failed', err2);
        }
      }
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    } else if (root.webkitRequestFullScreen) {
      root.webkitRequestFullScreen();
    }
  } catch (err) {
    console.warn('Fullscreen failed', err);
  }
  try {
    await lockLandscape();
  } catch {
    /* ignore */
  }
  resize();
  setTimeout(() => {
    _fsBusy = false;
  }, 500);
}

function toggleFly() {
  flyMode = !flyMode;
  if (flyMode) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    lookYaw = e.y;
    lookPitch = e.x;
    requestPointerLock();
  } else {
    chaseCam.reset();
  }
}

function flyStep(dt) {
  const i = driveInput;
  let fwd = 0;
  let strafe = 0;
  let up = 0;
  if (i.held('throttle')) fwd += 1;
  if (i.held('brake')) fwd -= 1;
  if (i.held('left')) strafe -= 1;
  if (i.held('right')) strafe += 1;
  if (i.codeHeld('Space')) up += 1;
  if (i.codeHeld('ShiftLeft') || i.codeHeld('ShiftRight')) up -= 1;

  const cp = Math.cos(lookPitch);
  const fwdVec = new THREE.Vector3(
    -Math.sin(lookYaw) * cp,
    Math.sin(lookPitch),
    -Math.cos(lookYaw) * cp,
  );
  const rightVec = new THREE.Vector3(Math.cos(lookYaw), 0, -Math.sin(lookYaw));
  const speed = flySpeed;
  camera.position.addScaledVector(fwdVec, fwd * speed * dt);
  camera.position.addScaledVector(rightVec, strafe * speed * dt);
  camera.position.y += up * speed * dt;
  camera.position.y = Math.max(1.4, camera.position.y);
  camera.quaternion.setFromEuler(new THREE.Euler(lookPitch, lookYaw, 0, 'YXZ'));
}

function onMouseMove(e) {
  if (mode !== 'drive' && mode !== 'preview') return;
  if (mode === 'paused' || mapOpen) return;
  if (e.movementX === 0 && e.movementY === 0) return;
  lookYaw -= e.movementX * 0.004;
  lookPitch = clamp(lookPitch - e.movementY * 0.003, -0.18, 0.42);
}

/** Touch-drag orbit on canvas (coarse devices — no pointer lock). */
let _touchLookId = null;
let _touchLookX = 0;
let _touchLookY = 0;

function onTouchLookStart(e) {
  if (!wantsTouchUi() || mode !== 'drive' || flyMode || mapOpen) return;
  const t = e.changedTouches[0];
  if (!t) return;
  const el = document.elementFromPoint(t.clientX, t.clientY);
  if (el && el.closest?.('#touch, #hud, #pause, #map-overlay, #preview')) return;
  _touchLookId = t.identifier;
  _touchLookX = t.clientX;
  _touchLookY = t.clientY;
}

function onTouchLookMove(e) {
  if (_touchLookId == null) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== _touchLookId) continue;
    const dx = t.clientX - _touchLookX;
    const dy = t.clientY - _touchLookY;
    _touchLookX = t.clientX;
    _touchLookY = t.clientY;
    lookYaw -= dx * 0.004;
    lookPitch = clamp(lookPitch - dy * 0.003, -0.18, 0.42);
    e.preventDefault();
    break;
  }
}

function onTouchLookEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === _touchLookId) {
      _touchLookId = null;
      break;
    }
  }
}

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

function applyGfx() {
  // Cap phone resolution at 1.0X — 1.5X looks sharper but usually stutters.
  let resIdx = gfx.resIdx ?? 1;
  if (wantsTouchUi() && resIdx > 1) resIdx = 1;
  const pr = GFX_RES[resIdx] ?? 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr));
  const dist = GFX_DIST[gfx.distIdx] ?? 500;
  skySystem.fogFar = dist;
  if (scene.fog) {
    scene.fog.near = dist * 0.16;
    scene.fog.far = dist;
  }
  camera.far = dist + 140;
  camera.updateProjectionMatrix();
  const shadowsOn = GFX_SHADOWS[gfx.shadowIdx] !== false;
  renderer.shadowMap.enabled = shadowsOn;
  sun.castShadow = shadowsOn;
  const mapSize = isCoarse ? 512 : 1024;
  if (sun.shadow.mapSize.x !== mapSize) {
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  const tm = TIME_MODES[gfx.timeIdx] ?? TIME_MODES[2];
  skySystem.setMode(tm.mode);
  if (tm.cycle) skySystem.setCycleMinutes(tm.cycle);
}

applyGfx();
settingsList?.querySelectorAll('.settings-row').forEach((row, i) => {
  row.addEventListener('click', () => {
    if (mode !== 'paused' || pauseView !== 'settings') return;
    // First tap both selects and cycles — no second tap required.
    pauseSettingsIndex = i;
    gfx = cycleSetting(gfx, i, 1, { mobile: wantsTouchUi() });
    saveGfx(gfx);
    applyGfx();
    refreshPauseUi();
  });
});

const world = new World();
scene.add(world.stage);
scene.add(world.horizon);

const state = {
  s: 40,
  lateral: 0,
  yawOffset: 0,
  steerAngle: 0,
  steerVel: 0,
  vy: 0,
  r: 0,
  gear: 0,
  rpm: 1050,
  throttle: 0,
  brake: 0,
  handbrake: 0,
  rollLoad: 0,
  pitchLoad: 0,
  speed: 0,
};

let car = buildFallbackCar();
car.frustumCulled = true;
scene.add(car);

/** @type {Headlights | null} */
let headlights = null;
const skidFx = new SkidFx(scene, camera);

let activeCarId = 'sport';
let activeCarSpec = CARS.find((c) => c.id === activeCarId) ?? CARS[0];
let swapping = false;
let ready = false;
let frameCounter = 0;
/** @type {'loading' | 'preview' | 'drive' | 'paused' | 'map'} */
let mode = 'loading';

function formatRaceTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function updateRaceHud() {
  if (!activeRace || !raceHudEl) return;
  const h = activeRace.hud();
  raceHudEl.classList.remove('hidden');
  if (racePosEl) racePosEl.textContent = `${h.position}${ordinalSuffix(h.position)} / ${h.fieldSize}`;
  if (raceTimeEl) raceTimeEl.textContent = formatRaceTime(h.time);

  if (raceCountdownEl) {
    const cd = h.countdown;
    if (cd) {
      raceCountdownEl.classList.remove('hidden');
      raceCountdownEl.classList.toggle('go', !!cd.go);
      const setOn = (el, on) => el?.classList.toggle('on', !!on);
      setOn(xmasBulbs.preL, cd.preStage);
      setOn(xmasBulbs.preR, cd.preStage);
      setOn(xmasBulbs.stageL, cd.stage);
      setOn(xmasBulbs.stageR, cd.stage);
      setOn(xmasBulbs.amber0, cd.ambers?.[0]);
      setOn(xmasBulbs.amber1, cd.ambers?.[1]);
      setOn(xmasBulbs.amber2, cd.ambers?.[2]);
      setOn(xmasBulbs.greenL, cd.go);
      setOn(xmasBulbs.greenR, cd.go);
      if (xmasGoText) {
        xmasGoText.style.opacity = cd.go ? String(cd.alpha ?? 1) : '0';
        xmasGoText.style.transform = `scale(${cd.scale ?? 1})`;
      }
    } else {
      raceCountdownEl.classList.add('hidden');
      raceCountdownEl.classList.remove('go');
      Object.values(xmasBulbs).forEach((el) => el?.classList.remove('on'));
      if (xmasGoText) xmasGoText.style.opacity = '0';
    }
  }

  if (h.results && raceResultsEl && !raceResultsEl.classList.contains('showing')) {
    raceResultsEl.classList.remove('hidden');
    raceResultsEl.classList.add('showing');
    if (raceResultsPlace) raceResultsPlace.textContent = h.results.label;
    if (raceResultsTime) raceResultsTime.textContent = formatRaceTime(h.results.time);
    if (raceResultsMedal) {
      if (h.medal?.prize) {
        raceResultsMedal.textContent = `${h.medal.prize}${h.medal.rankedUp ? ' · RANK UP!' : ''}`;
        raceResultsMedal.style.color = h.medal.prizeColor || h.medal.color || '';
      } else {
        raceResultsMedal.textContent = 'NO PRIZE';
        raceResultsMedal.style.color = '#8a857a';
      }
    }
  }
}

function ordinalSuffix(n) {
  const t = n % 10;
  const h = n % 100;
  if (h >= 11 && h <= 13) return 'TH';
  return t === 1 ? 'ST' : t === 2 ? 'ND' : t === 3 ? 'RD' : 'TH';
}

function endRace(toPreview) {
  if (activeRace) {
    activeRace.dispose();
    activeRace = null;
  }
  raceHudEl?.classList.add('hidden');
  raceCountdownEl?.classList.add('hidden');
  if (raceResultsEl) {
    raceResultsEl.classList.add('hidden');
    raceResultsEl.classList.remove('showing');
  }
  if (toPreview) {
    mode = 'preview';
    hud.classList.add('hidden');
    previewEl.classList.remove('hidden');
    setTouchVisible(false);
    document.exitPointerLock?.();
    state.s = 40;
    state.lateral = 0;
    state.yawOffset = 0;
    state.speed = 0;
    _simAcc = 0;
  }
}

async function startRaceFromSetup() {
  if (raceStarting || swapping) return;
  raceStarting = true;
  try {
    if (mode === 'paused') setPaused(false);
    endRace(false);
    previewEl.classList.add('hidden');
    hud.classList.remove('hidden');
    raceResultsEl?.classList.add('hidden');
    raceResultsEl?.classList.remove('showing');

    // Prefer a faster rival chassis when the player is in F1.
    const rivalIds = activeCarSpec.top >= 250
      ? ['f1', 'race', 'sport']
      : ['sport', 'hatch', 'police'];
    const rivalSpecs = rivalIds.map(
      (id) => CARS.find((c) => c.id === id) ?? CARS[0],
    );
    const race = new HighwayRace({
      highway: world.highway,
      scene,
      parent: world.stage,
      length: RACE_LENGTHS[raceSetup.lengthIdx],
      difficulty: RACE_DIFFS[raceSetup.diffIdx],
      startS: 40,
      playerSpec: activeCarSpec,
      rivalSpecs,
      loadMesh: async (spec) => {
        const model = CAR_MODELS.find((m) => m.id === spec.id)
          || { file: (spec.model || '').split('/').pop(), id: spec.id };
        return loadKenneyCar(model.file || 'sedan-sports.glb', spec);
      },
    });
    await race.begin(state);
    activeRace = race;
    mode = 'drive';
    _simAcc = 0;
    lookYaw = 0;
    lookPitch = 0;
    chaseCam.reset();
    const start = world.highway.at(state.s);
    applyCarTransform(start);
    world.recenter(start.x, 0, start.z);
    world.syncImmediate(state.s);
    canvas.focus({ preventScroll: true });
    setTouchVisible(true);
    if (wantsTouchUi()) enterFullscreen();
    else requestPointerLock();
  } catch (err) {
    console.warn('race start failed', err);
    endRace(true);
  } finally {
    raceStarting = false;
  }
}

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
    if (!headlights) headlights = new Headlights(car);
    else headlights.attach(car);
    headlights.update(lastNight);
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
  addCarButton(carPicker, model);
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'pause-car-btn' + (model.id === activeCarId ? ' active' : '');
  pauseBtn.dataset.id = model.id;
  pauseBtn.textContent = model.label.toUpperCase();
  pauseBtn.addEventListener('click', () => setCar(model));
  pauseGarage.appendChild(pauseBtn);
}

const PREVIEW_SPEED = 22;

/** OpenCity fixed physics rate — input sampled once per frame, car stepped at 120 Hz. */
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 8;
let _simAcc = 0;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function damp(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

function gearForSpeed() {
  return (state.gear ?? 0) + 1;
}

/** OpenCity main.js driverInput() — same axes every substep in a frame. */
function driverInput() {
  return driverInputFrom(driveInput);
}

function playerWorld(f) {
  const heading = f.heading + state.yawOffset;
  const longVel = state.speed * Math.cos(state.yawOffset);
  const latVel = state.speed * Math.sin(state.yawOffset);
  return {
    x: f.nx * state.lateral,
    y: ROAD_SURFACE + 0.02,
    z: f.nz * state.lateral,
    heading,
    roll: state.rollLoad * 0.03,
    pitch: 0,
    tx: f.tx,
    tz: f.tz,
    carTx: Math.cos(heading),
    carTz: Math.sin(heading),
    velTx: longVel * f.tx + latVel * f.nx,
    velTz: longVel * f.tz + latVel * f.nz,
  };
}

function applyCarTransform(f) {
  const frame = f ?? world.highway.at(state.s);
  const p = playerWorld(frame);
  car.position.set(p.x, p.y, p.z);

  _physFwd.set(p.carTx, 0, p.carTz).normalize();
  const mf = car.userData.modelForward;
  if (mf && mf.lengthSq() > 1e-8) {
    _modelFwd.copy(mf).normalize();
    car.quaternion.setFromUnitVectors(_modelFwd, _physFwd);
  } else {
    car.rotation.order = 'YXZ';
    car.rotation.set(0, -p.heading + Math.PI / 2, 0);
  }
  if (p.roll) car.rotateZ(p.roll);
}

function updateHud() {
  speedEl.textContent = String(Math.round(Math.abs(state.speed) * 3.6));
  gearEl.textContent = state.speed < -0.5 ? 'REVERSE' : `GEAR ${gearForSpeed()}`;
  if (frameCounter % 4 === 0) drawMinimap(minimapCanvas, world.highway, state);
  if (mapOpen) drawFullMap(fullmapCanvas, world.highway, state);
}

function simulateDrive(dt) {
  _simAcc += dt;
  let n = 0;
  let driveOut = { steerAngle: 0, slipAngle: 0 };
  const di = driverInput();
  const maxSteps = dt > 0.033 ? 4 : MAX_SUBSTEPS;
  const held = !!activeRace?.holding;
  const roadHalf = activeRace?.roadHalf ?? ROAD_HALF;
  const driveOpts = activeRace ? { strict: true } : {};

  while (_simAcc >= SUBSTEP && n < maxSteps) {
    if (held) {
      // Countdown: freeze physics; keep input sampled for rev display.
      driveOut = { steerAngle: state.steerAngle, slipAngle: state.yawOffset };
    } else {
      driveOut = stepVehicle(state, di, SUBSTEP, activeCarSpec, roadHalf, driveOpts);
    }
    _simAcc -= SUBSTEP;
    n++;
  }
  if (n >= maxSteps) _simAcc = 0;

  if (activeRace) {
    activeRace.step(dt, state, held ? { ...di, throttle: di.throttle, brake: 0, steer: 0 } : di);
  }

  const rollTarget = clamp(-driveOut.slipAngle * 0.4 + state.steerAngle * 0.08, -0.25, 0.25);
  state.rollLoad = damp(state.rollLoad, rollTarget, 2.5, dt);

  const targetPitch =
    state.brake > 0.1 ? -0.15 : state.throttle > 0.1 ? 0.08 : 0;
  state.pitchLoad = damp(state.pitchLoad, targetPitch, 2.5, dt);
}

function syncWorld(dt) {
  const f = world.highway.at(state.s);
  applyCarTransform(f);
  updateCarWheels(dt);
  world.recenter(f.x, 0, f.z);
  world.sync(state.s, { speed: state.speed });

  const p = playerWorld(f);
  const sky = skySystem.update(dt, p);
  lastNight = sky.night;
  tickWater(dt, sky.night);
  world.setNightLevel(sky.night, { x: f.x + p.x, y: f.y + p.y, z: f.z + p.z });
  headlights?.update(sky.night);

  skidFx.update(dt, p, {
    speed: state.speed,
    handbrake: state.handbrake,
    yawOffset: state.yawOffset,
    steer: driveInput.steer,
    drift: activeCarSpec.drift,
  });

  if (flyMode) {
    flyStep(dt);
  } else {
    chaseCam.update(p, dt, {
      lookBack: driveInput.lookBack,
      orbitYaw: pointerLocked || wantsTouchUi() ? lookYaw : 0,
      orbitPitch: pointerLocked || wantsTouchUi() ? lookPitch : 0,
      speed: state.speed,
    });
  }
}

function update(dt) {
  frameCounter++;
  driveInput.update();

  if (driveInput.consumeFullscreenToggle()) toggleFullscreen();
  if (driveInput.consumeFlyToggle()) toggleFly();

  if (driveInput.lightsPressed) {
    headlights?.toggle();
    headlights?.update(lastNight);
  }

  if (driveInput.skipPressed && mode === 'preview') startDrive();
  if (driveInput.skipPressed && activeRace?.holding) activeRace.skipCountdown();
  if (driveInput.resetPressed && mode === 'drive') restartDrive();

  handleMenuKeys();

  if (mode === 'preview') {
    state.speed = PREVIEW_SPEED;
    state.steerAngle = 0;
    state.steerVel = 0;
    state.vy = 0;
    state.r = 0;
    state.yawOffset = 0;
    state.lateral = 0;
    stepVehicle(state, { steer: 0, throttle: 0, brake: 0, handbrake: 0 }, dt, activeCarSpec, ROAD_HALF);
    syncWorld(dt);
    return;
  }

  if (mode === 'drive') {
    if (!flyMode) simulateDrive(dt);
    syncWorld(dt);
    updateHud();
    if (activeRace) updateRaceHud();
    return;
  }

  if (mode === 'paused' || mode === 'map') {
    syncWorld(dt);
    updateHud();
    if (activeRace) updateRaceHud();
  }
}

const clock = new THREE.Clock();

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (mode === 'drive') {
    setTouchVisible(true);
    updateRotateHint();
  }
}

function tick() {
  if (ready) update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => {
    resize();
    if (mode === 'drive') lockLandscape();
  });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', resize);
    visualViewport.addEventListener('scroll', resize);
  }
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(canvas);
  }

  bindTouch(document.body, driveInput, {
    onPause: () => {
      if (mode === 'drive') setPaused(true);
    },
    onReset: () => {
      if (mode === 'drive' || mode === 'paused') restartDrive();
    },
    onFullscreen: () => enterFullscreen(),
  });

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    canvas.focus({ preventScroll: true });
    if (mode === 'drive' && !flyMode) requestPointerLock();
  });
  canvas.addEventListener('touchstart', onTouchLookStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchLookMove, { passive: false });
  canvas.addEventListener('touchend', onTouchLookEnd, { passive: true });
  canvas.addEventListener('touchcancel', onTouchLookEnd, { passive: true });

  document.addEventListener('fullscreenchange', () => {
    resize();
    if (document.fullscreenElement && mode === 'drive') lockLandscape();
  });

  tick();

  try {
    setLoading(0.05, 'Loading world…');
    await world.init((p, label) => setLoading(0.05 + p * 0.75, `Loading ${label}…`));

    setLoading(0.85, 'Loading car…');
    await setCar(CAR_MODELS[0]);

    world.syncImmediate(state.s);
    const start = world.highway.at(state.s);
    applyCarTransform(start);
    world.recenter(start.x, 0, start.z);

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
