import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { flat, celMaterial } from '../render/cel.js';

const VEHICLE_BASE = './assets/vehicles/';

/** Cached Kenney template scenes — never dispose these. */
const cache = new Map();
const loaders = new Map();

function getLoader(base) {
  if (!loaders.has(base)) {
    const l = new GLTFLoader();
    l.setPath(base);
    loaders.set(base, l);
  }
  return loaders.get(base);
}

function cacheKey(base, file) {
  return `${base}${file}`;
}

/** Deep-clone a scene so materials/geometries are not shared with cache. */
function deepCloneScene(src) {
  const root = src.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry) o.geometry = o.geometry.clone();
    if (o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map(cloneMaterial)
        : cloneMaterial(o.material);
    }
  });
  return root;
}

function cloneMaterial(m) {
  if (!m) return flat(0xffffff);
  const c = m.clone();
  if (m.map) c.map = m.map;
  return c;
}

/** Load and cache a Kenney GLB from vehicles/ (CC0). Returns an independent clone. */
export async function loadKenney(url) {
  const file = url.replace(/^\.\/assets\/vehicles\//, '').replace(/^\.\//, '');
  return loadProp(VEHICLE_BASE, file);
}

/** Load and cache a prop GLB from any assets/ subfolder. Returns an independent clone. */
export async function loadProp(base, file) {
  const key = cacheKey(base, file);
  if (!cache.has(key)) {
    const gltf = await getLoader(base).loadAsync(file);
    if (!gltf.scene.children.length) throw new Error(`Empty GLB: ${base}${file}`);
    cache.set(key, gltf.scene);
  }
  return deepCloneScene(cache.get(key));
}

/** Clone, scale, and sit a prop on ground at (x, y, z). */
export function placePropOnGround(template, { x, y, z, yaw = 0, scale = 1 }) {
  const root = deepCloneScene(template);
  root.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(root);
  root.position.set(x, y - box.min.y, z);
  root.rotation.y = yaw;
  return root;
}

/** Apply cel/unlit materials while keeping Kenney colormap UVs. */
export function celShadeModel(root, { tint, unlit = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const map = mats.map((m) => m?.map || null).find(Boolean) ?? null;
    if (unlit) {
      o.material = new THREE.MeshBasicMaterial({
        color: tint ?? 0xffffff,
        map: map ?? undefined,
        side: THREE.DoubleSide,
      });
    } else {
      o.material = celMaterial({
        color: tint ?? 0xffffff,
        side: THREE.DoubleSide,
        map: map ?? undefined,
      });
    }
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      o.material.needsUpdate = true;
    }
  });
}

export function findWheels(root) {
  const wheels = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isGroup) return;
    const n = o.name.toLowerCase();
    if (n.includes('wheel')) wheels.push(o);
  });
  return wheels.slice(0, 4);
}

/** Scale model so its longest horizontal axis matches targetLength (meters). */
export function fitModel(root, targetLength = 4.2) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.x < 0.001 && size.y < 0.001 && size.z < 0.001) {
    throw new Error('Model bounding box is empty');
  }
  const length = Math.max(size.x, size.z, 0.001);
  let s = targetLength / length;
  s = Math.max(0.5, Math.min(3.0, s));
  root.scale.setScalar(s);
  box.setFromObject(root);
  const groundLift = -box.min.y;
  for (const child of root.children) {
    child.position.y += groundLift;
  }
  const ride = 0.02;
  if (isDebug()) {
    console.info('[fitModel]', { length, scale: s, size: size.toArray(), ride, groundLift });
  }
  return { scale: s, length, wheels: findWheels(root), ride, groundLift };
}

export function isDebug() {
  return new URLSearchParams(location.search).has('debug');
}

/** Only dispose procedural (non-Kenney) car meshes. */
export function releaseCarInstance(root) {
  if (!root || root.userData?.kenney) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}
