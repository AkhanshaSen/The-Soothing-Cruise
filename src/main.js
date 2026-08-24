import * as THREE from 'three';
import { CARS, DEFAULT_CAR_ID } from './vehicle/catalog.js';
import { buildCar, buildProceduralCar, releaseCar } from './vehicle/mesh.js';
import { Vehicle } from './vehicle/physics.js';
import { ChaseCam } from './vehicle/camera.js';
import { Highway } from './world/path.js';
import { World } from './world/world.js';
import { Stage } from './world/stage.js';
import { Sky } from './world/sky.js';
import { Travelers } from './world/travelers.js';
import { AudioBus, STATIONS } from './audio/bus.js';
import { readInput } from './core/input.js';
import { createRenderer, resize } from './render/pipeline.js';
import {
  mountDebugOverlay,
  updateDebugOverlay,
  mountStatusStrip,
  updateStatusStrip,
  countMeshes,
  isDebugMode,
} from './render/debug.js';
import { mountFallback2D, resizeFallback2D, drawFallback2D } from './render/fallback2d.js';
import { pixelShowsGeometry, isEmbeddedPreview, forceFallback, disableAutoFallback } from './render/health.js';
import { mountUI, bindGarage, drawMinimap, setDriveButtonState } from './ui/hud.js';
import { bindTouch } from './ui/touch.js';
import { initScenery } from './world/scenery.js';
import { ROAD_SURFACE } from './world/path.js';
import { updatePauseMenu, handlePauseNav } from './ui/pause.js';
import { key } from './core/input.js';

const VERSION = '2.0.7';

const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const bootError = document.getElementById('boot-error');
const debugEl = isDebugMode() ? mountDebugOverlay() : null;
if (debugEl) debugEl.hidden = false;
const statusEl = mountStatusStrip();
const fallbackCanvas = mountFallback2D();

function showError(err) {
  if (!bootError) return;
  bootError.hidden = false;
  bootError.textContent = String(err?.message || err);
  console.error(err);
}

function clearError() {
  if (bootError) bootError.hidden = true;
}

mountUI(ui);
bindTouch(ui);

const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8cc8e8);

const camera = new THREE.PerspectiveCamera(62, 1, 0.4, 600);
const sky = new Sky(scene);
const stage = new Stage(scene);

const highway = new Highway(11);
highway.generateUntil(1600);
const world = new World(stage.root, highway, 11);

let spec = CARS.find((c) => c.id === DEFAULT_CAR_ID) || CARS[0];
let mesh = new THREE.Group();

const vehicle = new Vehicle(spec, highway);
const cam = new ChaseCam(camera);
const audio = new AudioBus();
const travelers = new Travelers(stage.root, highway);

const state = {
  mode: 'title',
  paused: false,
  clock: 14,
  tod: 'day',
  cycleMin: 3,
  carId: spec.id,
  loadingCar: false,
  carReady: false,
  driveTime: 0,
  titleCam: 0,
  bootTime: 0,
  useFallback2D: false,
  webglOk: null,
};

function rideOffset() {
  return mesh.userData?.dims?.ride ?? 0.15;
}

bindGarage(ui, (id) => pickCar(id));

ui.querySelector('#drive').addEventListener('click', () => {
  if (!state.carReady) return;
  startDrive();
});
ui.querySelector('#tpause')?.addEventListener('click', () => setPaused(true));
ui.querySelector('#treset')?.addEventListener('click', () => {
  vehicle.respawn();
  syncStage();
  cam.snapAtOrigin(vehicle);
});

ui.querySelector('#tod').addEventListener('change', (e) => {
  state.tod = e.target.value;
});
ui.querySelector('#cycle').addEventListener('change', (e) => {
  state.cycleMin = Number(e.target.value);
});
ui.querySelector('#music').addEventListener('input', (e) => {
  audio.musicGain = Number(e.target.value) / 100;
});
ui.querySelector('#sfx').addEventListener('input', (e) => {
  audio.sfxGain = Number(e.target.value) / 100;
});
ui.querySelector('#assist').addEventListener('change', (e) => {
  vehicle.assist = e.target.value === 'on';
});
ui.querySelector('#quality').addEventListener('change', (e) => {
  const q = Number(e.target.value);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * q);
  resize(renderer, camera, canvas);
});

let radioEdge = false;
let pauseEdge = false;
let qEdge = false;
let pauseIndex = 0;
let pauseView = 'menu';
let menuUpEdge = false;
let menuDownEdge = false;
let menuEnterEdge = false;

function enableFallback2D() {
  if (state.useFallback2D) return;
  state.useFallback2D = true;
  canvas.style.visibility = 'hidden';
  fallbackCanvas.style.display = 'block';
  resizeFallback2D(fallbackCanvas);
}

function disableFallback2D() {
  if (!state.useFallback2D) return;
  state.useFallback2D = false;
  canvas.style.visibility = 'visible';
  fallbackCanvas.style.display = 'none';
}

function installCarMesh(nextMesh, nextSpec) {
  stage.root.remove(mesh);
  releaseCar(mesh);
  mesh = nextMesh;
  mesh.visible = true;
  mesh.frustumCulled = false;
  stage.root.add(mesh);
  spec = nextSpec;
  vehicle.spec = spec;
}

function setProceduralCar(nextSpec, player = true) {
  const nextMesh = buildProceduralCar(nextSpec, { player });
  installCarMesh(nextMesh, nextSpec);
  state.carReady = true;
  setDriveButtonState(ui, 'ready');
  if (state.mode === 'title') applyTitleCarPreview();
}

async function upgradeToKenney(nextSpec, player = true) {
  if (!nextSpec.model || state.useFallback2D) return;
  state.loadingCar = true;
  try {
    const nextMesh = await buildCar(nextSpec, { player });
    if (state.carId !== nextSpec.id) return;
    installCarMesh(nextMesh, nextSpec);
    if (state.mode === 'title') applyTitleCarPreview();
    else if (state.mode === 'drive') applyMesh();
  } catch (err) {
    console.warn('Kenney upgrade failed', err);
  } finally {
    state.loadingCar = false;
  }
}

function pickCar(id) {
  state.carId = id;
  const nextSpec = CARS.find((c) => c.id === id) || spec;
  setProceduralCar(nextSpec, true);
  upgradeToKenney(nextSpec, true).catch((err) => showError(err));
}

function syncStage() {
  stage.recenterVec(vehicle.pos);
}

function startDrive() {
  clearError();
  setPaused(false);
  const next = CARS.find((c) => c.id === state.carId) || spec;
  if (next.id !== spec.id || !mesh.userData?.spec) {
    setProceduralCar(next, true);
    upgradeToKenney(next, true).catch((err) => showError(err));
  }
  vehicle.respawn();
  syncStage();
  applyMesh();
  cam.snapAtOrigin(vehicle);
  world.sync(vehicle.s);
  state.mode = 'drive';
  state.driveTime = 0;
  state.webglOk = null;
  document.body.classList.add('driving');
  ui.querySelector('#title').classList.add('hidden');
  ui.querySelector('#hud').classList.remove('hidden');
  ui.querySelector('#touch').classList.remove('hidden');
  audio.start();
  updateDriveScene(0.016, readInput());
  if (!state.useFallback2D) renderer.render(scene, camera);
}

function toTitle() {
  state.mode = 'title';
  state.paused = false;
  state.driveTime = 0;
  disableFallback2D();
  document.body.classList.remove('driving');
  ui.querySelector('#title').classList.remove('hidden');
  ui.querySelector('#hud').classList.add('hidden');
  ui.querySelector('#pause').classList.add('hidden');
  ui.querySelector('#touch').classList.add('hidden');
}

function setPaused(v) {
  if (state.mode !== 'drive') return;
  state.paused = v;
  ui.querySelector('#pause').classList.toggle('hidden', !v);
  if (statusEl) statusEl.hidden = v;
  if (v) {
    pauseIndex = 0;
    pauseView = 'menu';
    updatePauseMenu(ui, { index: pauseIndex, carName: spec.name, view: pauseView });
  }
}

function runPauseAction(action) {
  if (action === 'resume') setPaused(false);
  else if (action === 'restart') {
    vehicle.respawn();
    syncStage();
    cam.snapAtOrigin(vehicle);
    setPaused(false);
  } else if (action === 'vehicle') {
    pauseView = 'vehicle';
    updatePauseMenu(ui, { index: pauseIndex, carName: spec.name, view: pauseView });
  }
}

ui.querySelector('#pause-garage')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.pause-car-btn');
  if (!btn) return;
  ui.querySelectorAll('.pause-car-btn').forEach((b) => b.classList.toggle('active', b === btn));
  pickCar(btn.dataset.id);
  ui.querySelector('#pause-car').textContent = spec.name;
});

function handlePauseInput() {
  const up = key('ArrowUp') || key('KeyW');
  const down = key('ArrowDown') || key('KeyS');
  const confirm = key('Enter');
  const back = key('Escape');

  const result = handlePauseNav(ui, {
    up: up && !menuUpEdge,
    down: down && !menuDownEdge,
    confirm: confirm && !menuEnterEdge,
    back: back && !pauseEdge,
    index: pauseIndex,
    view: pauseView,
    onAction: runPauseAction,
    onViewChange: (view) => {
      pauseView = view;
      updatePauseMenu(ui, { index: pauseIndex, carName: spec.name, view: pauseView });
    },
  });

  if (result.index !== pauseIndex) pauseIndex = result.index;
  if (result.view !== pauseView) pauseView = result.view;

  menuUpEdge = up;
  menuDownEdge = down;
  menuEnterEdge = confirm;
}

function applyTitleCarPreview() {
  applyMesh();
}

function updateTitleScene(dt) {
  const cruise = 22;
  vehicle.s += dt * cruise;
  vehicle.speed = cruise;
  vehicle.wheelSpin += (cruise / 0.34) * dt;
  const f = highway.at(vehicle.s);
  vehicle.pos.set(f.x, f.y, f.z);
  vehicle.yaw = f.heading;
  vehicle.pitch = dampSimple(vehicle.pitch, f.pitch * 0.3, 6, dt);
  vehicle.roll = dampSimple(vehicle.roll, 0, 8, dt);

  stage.recenter(f.x, f.y, f.z);
  world.sync(vehicle.s);
  applyMesh();
  cam.snapAtOrigin(vehicle);

  const pal = world.palette(vehicle.s);
  sky.update(14, pal, 'day', camera.position);
  scene.background.setHex(pal.sky);
  if (scene.fog) scene.fog.color.setHex(pal.fog);
}

function dampSimple(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

function updateDriveScene(dt, input) {
  if (!state.paused) {
    if (input.cruise && !qEdge) vehicle.assist = !vehicle.assist;
    qEdge = input.cruise;
    if (input.reset) {
      vehicle.respawn();
      syncStage();
      cam.snapAtOrigin(vehicle);
    }
    if (input.radioNext && !radioEdge) audio.setStation(audio.station + 1);
    radioEdge = input.radioNext;
    vehicle.update(dt, input);
  }

  applyMesh();
  if (!state.paused) {
    syncStage();
    travelers.update(dt, vehicle.s);
    cam.updateAtOrigin(dt, vehicle, input.lookBack);
    world.sync(vehicle.s);
  }

  const pal = world.palette(vehicle.s);
  const skyMode = state.tod === 'dynamic' ? 'day' : state.tod;
  sky.update(state.clock, pal, skyMode, camera.position);

  mesh.visible = true;
  audio.update();

  ui.querySelector('#biome').textContent = pal.name;
  ui.querySelector('#carname').textContent = spec.name;
  ui.querySelector('#spd').textContent = String(Math.round(Math.abs(vehicle.speed) * 3.6));
  if (state.paused) ui.querySelector('#pause-car').textContent = spec.name;
  ui.querySelector('#station').textContent = STATIONS[audio.station].name;
  ui.querySelector('#hint').textContent = vehicle.assist
    ? 'Cruise assist on · Q release · N/B radio · Space drift'
    : 'WASD / Arrows drive · Space drift · Q cruise · N/B radio';
  drawMinimap(ui.querySelector('#map'), highway, vehicle);

  if (state.useFallback2D) {
    drawFallback2D(fallbackCanvas, {
      speed: vehicle.speed,
      biome: { grass: pal.grass, sand: pal.sand },
      sky: `#${pal.sky.toString(16).padStart(6, '0')}`,
    });
  }
}

addEventListener('resize', () => {
  resize(renderer, camera, canvas);
  resizeFallback2D(fallbackCanvas);
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyN') audio.setStation(audio.station + 1);
  if (e.code === 'KeyB') audio.setStation(audio.station - 1);
});

new ResizeObserver(() => resize(renderer, camera, canvas)).observe(canvas);

const clock = new THREE.Clock();

function ensureCameraAspect() {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  if (Math.abs(camera.aspect - aspect) > 0.001) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
}

function checkWebGLHealth(draws, meshes) {
  if (state.mode !== 'drive' || state.driveTime < 0.5) return;
  if (forceFallback()) {
    enableFallback2D();
    return;
  }
  if (disableAutoFallback()) {
    state.webglOk = true;
    if (state.useFallback2D) disableFallback2D();
    return;
  }

  const hasPixel = pixelShowsGeometry(renderer);
  const rendering3D = draws > 15 && meshes > 80;

  if (rendering3D && (hasPixel === true || hasPixel === null)) {
    state.webglOk = true;
    if (state.useFallback2D) disableFallback2D();
    return;
  }

  if (hasPixel === true && draws > 8) {
    state.webglOk = true;
    if (state.useFallback2D) disableFallback2D();
    return;
  }

  if (rendering3D && state.driveTime > 1.5) {
    state.webglOk = true;
    if (state.useFallback2D) disableFallback2D();
    return;
  }

  if (state.driveTime > 4 && draws < 3 && meshes < 10) {
    state.webglOk = false;
    enableFallback2D();
  }
}

function reportRenderHealth(draws) {
  const info = {
    version: VERSION,
    mode: state.mode,
    chunks: world.chunks.size,
    meshes: countMeshes(scene),
    draws,
    car: spec.name,
    kenney: !!mesh.userData?.kenney,
    vx: vehicle.pos.x.toFixed(1),
    vy: vehicle.pos.y,
    vz: vehicle.pos.z.toFixed(1),
    cx: camera.position.x.toFixed(1),
    cy: camera.position.y,
    cz: camera.position.z.toFixed(1),
    gl: renderer.capabilities?.isWebGL2 ? 'WebGL2' : 'WebGL1',
    driveTime: state.driveTime,
    bootTime: state.bootTime,
    fallback: state.useFallback2D,
    webglOk: state.webglOk,
  };
  updateStatusStrip(statusEl, info);
  if (debugEl) updateDebugOverlay(debugEl, info);
}

function tick() {
  try {
    ensureCameraAspect();
    const dt = Math.min(0.05, clock.getDelta());
    state.bootTime += dt;
    const input = readInput();

    if (input.pauseKey && !pauseEdge) {
      if (state.paused && pauseView !== 'menu') {
        pauseView = 'menu';
        updatePauseMenu(ui, { index: pauseIndex, carName: spec.name, view: pauseView });
      } else {
        setPaused(!state.paused);
      }
    }
    pauseEdge = input.pauseKey;

    if (state.paused) handlePauseInput();

    if (state.mode === 'drive') {
      state.driveTime += dt;
      updateDriveScene(dt, input);
    } else if (state.mode === 'title') {
      updateTitleScene(dt);
      mesh.visible = true;
    }

    if (!state.useFallback2D) renderer.render(scene, camera);
    const draws = state.useFallback2D ? 0 : renderer.info.render.calls;
    const meshes = countMeshes(scene);
    checkWebGLHealth(draws, meshes);
    clearError();
    reportRenderHealth(draws);
  } catch (err) {
    showError(err);
  }
  requestAnimationFrame(tick);
}

function applyMesh() {
  mesh.visible = true;
  mesh.position.set(0, ROAD_SURFACE + rideOffset(), 0);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.x = vehicle.pitch * 0.5;
  mesh.rotation.y = -vehicle.yaw + Math.PI / 2;
  mesh.rotation.z = vehicle.roll;
  const wheels = mesh.userData.wheels || [];
  wheels.forEach((w, i) => {
    w.rotation.x = vehicle.wheelSpin;
    if (i < 2) w.rotation.y = -vehicle.steer * 3.5;
  });
}

resize(renderer, camera, canvas);
resizeFallback2D(fallbackCanvas);

(async function boot() {
  try {
    await initScenery();
    world.sync(40);
    syncStage();
    cam.snapAtOrigin(vehicle);
    setProceduralCar(spec, true);
    applyMesh();
    cam.snapAtOrigin(vehicle);
    tick();
    upgradeToKenney(spec, true).catch((err) => console.warn('Kenney upgrade failed', err));
  } catch (err) {
    showError(err);
  }
})();

if (isEmbeddedPreview()) {
  console.info('Sojourn: Cursor preview — 3D stays on; use “Open in browser ↗” or ?nofallback=1 if needed');
}

console.info(`Sojourn v${VERSION} ready`);
