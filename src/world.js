/**
 * Endless curved coastal world — Kenney / OpenCity GLB scenery.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { Highway, ROAD_SURFACE } from './highway.js';

export const CHUNK_LEN = 90;
export const ROAD_W = 14;
export const ROAD_HALF = ROAD_W / 2 - 0.6;
export const SKY = 0x8cc8e8;

const PAL = {
  grass: 0x5cb050,
  sand: 0xe8c96a,
  water: 0x5aafd4,
  road: 0x3a3a40,
  roadEdge: 0x2a2a30,
  mark: 0xffffff,
};

const PROP_SETS = [
  { base: './assets/vegetation/', files: ['tree_1.glb', 'tree_2.glb', 'tree_3.glb', 'tree_pine_1.glb', 'tree_pine_2.glb', 'bush_1.glb', 'bush_2.glb'] },
  { base: './assets/city/', files: ['building-a.glb', 'building-b.glb', 'building-c.glb', 'building-d.glb', 'building-e.glb', 'building-f.glb'] },
  { base: './assets/house/', files: ['building-type-a.glb', 'building-type-b.glb', 'building-type-c.glb', 'building-type-d.glb'] },
  { base: './assets/forest/', files: ['rocks-low.glb', 'stones.glb'] },
  { base: './assets/road/', files: ['light-square.glb', 'sign-highway.glb'] },
];

class Rng {
  constructor(seed) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + this.next() * (b - a);
  }
}

const propCache = new Map();

async function loadProp(base, file) {
  const key = `${base}${file}`;
  if (propCache.has(key)) return propCache.get(key);

  const loader = new GLTFLoader();
  loader.setPath(base);
  const gltf = await loader.loadAsync(file);
  enhanceMaterials(gltf.scene);
  propCache.set(key, gltf.scene);
  return gltf.scene;
}

function enhanceMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) {
        m.map.colorSpace = THREE.SRGBColorSpace;
        m.map.anisotropy = 4;
      }
      if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 0.9, 0.92);
      if ('metalness' in m) m.metalness = 0;
      m.side = THREE.DoubleSide;
    }
  });
}

function cloneProp(template) {
  // Share geometry + materials; only transform the instance.
  return template.clone(true);
}

function placeProp(template, { x, y, z, yaw = 0, scale = 1 }) {
  const root = cloneProp(template);
  root.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(root);
  root.position.set(x, y - box.min.y, z);
  root.rotation.y = yaw;
  return root;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

export class World {
  constructor() {
    this.highway = new Highway(11);
    this.stage = new THREE.Group();
    this.chunks = new Map();
    this.streetLights = [];
    this.trees = [];
    this.buildings = [];
    this.houses = [];
    this.rocks = [];
    this.roadProps = [];
  }

  async init(onProgress) {
    const jobs = [];
    for (const set of PROP_SETS) {
      for (const file of set.files) {
        jobs.push({ base: set.base, file, label: file.replace('.glb', '') });
      }
    }

    let done = 0;
    const report = (label) => {
      done++;
      onProgress?.(done / jobs.length, label);
    };

    report('Starting engines…');

    await Promise.all(
      jobs.map(async ({ base, file, label }) => {
        try {
          const scene = await loadProp(base, file);
          if (base.includes('vegetation')) this.trees.push(scene);
          else if (base.includes('city')) this.buildings.push(scene);
          else if (base.includes('house')) this.houses.push(scene);
          else if (base.includes('forest')) this.rocks.push(scene);
          else if (base.includes('road')) this.roadProps.push(scene);
        } catch {
          /* optional asset */
        }
        report(label);
      }),
    );

    this.highway.generateUntil(CHUNK_LEN * 8);
    report('Scenery');
  }

  recenter(x, y, z) {
    this.stage.position.set(-x, -y, -z);
  }

  sync(playerS) {
    const i0 = Math.max(0, Math.floor(playerS / CHUNK_LEN) - 1);
    const i1 = Math.floor(playerS / CHUNK_LEN) + 5;
    const keep = new Set();

    for (let i = i0; i <= i1; i++) {
      keep.add(i);
      if (!this.chunks.has(i)) {
        const chunk = this.buildChunk(i * CHUNK_LEN);
        this.stage.add(chunk);
        this.chunks.set(i, chunk);
      }
    }

    for (const [i, chunk] of this.chunks) {
      if (!keep.has(i)) {
        const s0 = i * CHUNK_LEN;
        this.streetLights = this.streetLights.filter((l) => l.s0 !== s0);
        this.stage.remove(chunk);
        this.dispose(chunk);
        this.chunks.delete(i);
      }
    }
  }

  buildChunk(s0) {
    const group = new THREE.Group();
    group.userData.s0 = s0;
    const rng = new Rng((s0 * 9781) | 0);
    const ROAD_STEP = 5;

    const grassM = mat(PAL.grass);
    const sandM = mat(PAL.sand);
    const waterM = mat(PAL.water, { rough: 0.35 });
    const roadM = mat(PAL.road);
    const edgeM = mat(PAL.roadEdge);
    const shoulderM = mat(0x4a4a52);
    const markM = new THREE.MeshBasicMaterial({ color: PAL.mark });
    for (const m of [grassM, sandM, waterM, roadM, edgeM, shoulderM, markM]) m.userData.owned = true;

    const addSlab = (mx, my, mz, yaw, w, d, h, material, ox, oy, oz, castShadow, receiveShadow) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d + 0.12), material);
      m.position.set(mx + ox, my + oy, mz + oz);
      m.rotation.y = yaw;
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      m.userData.ownedGeo = true;
      group.add(m);
    };

    // Smooth road — fine steps aligned A→B (no mid-point kinks)
    for (let s = s0; s < s0 + CHUNK_LEN - 0.01; s += ROAD_STEP) {
      const sEnd = Math.min(s + ROAD_STEP, s0 + CHUNK_LEN);
      const a = this.highway.at(s);
      const b = this.highway.at(sEnd);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.001) continue;

      const yaw = Math.atan2(dx, dz);
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const hAvg = (a.heading + b.heading) * 0.5;
      const nx = -Math.sin(hAvg);
      const nz = Math.cos(hAvg);

      // Terrain: receive shadows, but don't cast (keeps sun shadow pass cheap).
      addSlab(mx, my, mz, yaw, 55, segLen, 0.35, grassM, nx * 32, -0.12, nz * 32, false, true);
      addSlab(mx, my, mz, yaw, 16, segLen, 0.3, sandM, -nx * 12, -0.15, -nz * 12, false, true);
      addSlab(mx, my, mz, yaw, 90, segLen, 0.25, waterM, -nx * 56, -0.28, -nz * 56, false, true);
      addSlab(mx, my, mz, yaw, ROAD_W + 0.6, segLen, 0.18, edgeM, 0, 0.02, 0, false, true);
      addSlab(mx, my, mz, yaw, ROAD_W + 0.2, segLen, 0.14, shoulderM, 0, ROAD_SURFACE - 0.02, 0, false, true);
      // Road: cast + receive.
      addSlab(mx, my, mz, yaw, ROAD_W, segLen, 0.12, roadM, 0, ROAD_SURFACE, 0, true, true);
    }

    // Center dashes — follow path exactly
    for (let s = s0 + 2; s < s0 + CHUNK_LEN; s += 8) {
      const f = this.highway.at(s);
      const yaw = Math.atan2(f.tx, f.tz);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 2.4), markM);
      dash.position.set(f.x, f.y + ROAD_SURFACE + 0.012, f.z);
      dash.rotation.y = yaw;
      dash.castShadow = false;
      dash.receiveShadow = false;
      dash.userData.ownedGeo = true;
      group.add(dash);
    }

    this.scatterTrees(group, s0, rng);
    if (Math.floor(s0 / CHUNK_LEN) % 3 === 0) this.scatterBuildings(group, s0, rng);
    if (Math.floor(s0 / CHUNK_LEN) % 2 === 0) this.scatterRocks(group, s0, rng);
    this.scatterRoadProps(group, s0, rng);
    this.scatterStreetLights(group, s0);

    return group;
  }

  /** Warm street-lamp glow — intensity driven by night blend (0–1). */
  setNightLevel(night, camPos) {
    const n = Math.max(0, Math.min(1, night));
    const radius = 120;
    const r2 = radius * radius;
    const MAX_LIT = 12;

    if (!camPos || n < 0.05) {
      for (const l of this.streetLights) {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
      }
      return;
    }

    const ranked = [];
    for (const l of this.streetLights) {
      const dx = l.x - camPos.x;
      const dz = l.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) ranked.push({ l, d2 });
    }
    ranked.sort((a, b) => a.d2 - b.d2);

    const on = new Set(ranked.slice(0, MAX_LIT).map((e) => e.l));
    for (const l of this.streetLights) {
      if (!on.has(l)) {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
        continue;
      }
      const dist = Math.sqrt((l.x - camPos.x) ** 2 + (l.z - camPos.z) ** 2);
      const fall = 1 - dist / radius;
      l.bulb.visible = true;
      l.bulb.intensity = n * 2.4 * fall;
    }
  }

  scatterStreetLights(group, s0) {
    const poleM = mat(0x2e2e34);
    const lampM = new THREE.MeshStandardMaterial({
      color: 0xffd8a8,
      emissive: 0xffb870,
      emissiveIntensity: 1.2,
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    poleM.userData.owned = true;
    lampM.userData.owned = true;

    for (let s = s0 + 10; s < s0 + CHUNK_LEN; s += 35) {
      const f = this.highway.at(s);
      for (const side of [-1, 1]) {
        const lat = ROAD_W / 2 + 1.5;
        const x = f.x + f.nx * lat * side;
        const z = f.z + f.nz * lat * side;
        const y = f.y;

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), poleM);
        pole.position.set(x, y + 2.2, z);
        pole.castShadow = false;
        pole.userData.ownedGeo = true;
        group.add(pole);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.32), lampM);
        head.position.set(x, y + 4.35, z);
        head.castShadow = false;
        head.receiveShadow = true;
        head.userData.ownedGeo = true;
        group.add(head);

        const bulb = new THREE.PointLight(0xffb870, 0, 80, 1.7);
        bulb.position.set(x, y + 4.1, z);
        bulb.visible = false;
        group.add(bulb);
        this.streetLights.push({ bulb, x, y: y + 4.1, z, s0 });
      }
    }
  }

  scatterTrees(group, s0, rng) {
    const n = this.trees.length ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const s = s0 + rng.range(4, CHUNK_LEN - 4);
      const f = this.highway.at(s);
      const side = rng.next() < 0.9 ? 1 : -1;
      const lat = rng.range(ROAD_W / 2 + 4, ROAD_W / 2 + 38);

      if (this.trees.length) {
        const t = this.trees[Math.floor(rng.next() * this.trees.length)];
        group.add(
          placeProp(t, {
            x: f.x + f.nx * lat * side,
            y: f.y,
            z: f.z + f.nz * lat * side,
            yaw: rng.range(0, Math.PI * 2),
            scale: rng.range(1.0, 2.1),
          }),
        );
      } else {
        const sc = rng.range(0.85, 1.3);
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14 * sc, 0.2 * sc, 1.3 * sc, 6),
          mat(0x6b4423),
        );
        trunk.position.set(f.x + f.nx * lat * side, f.y + 0.65 * sc, f.z + f.nz * lat * side);
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(1.4 * sc, 4.8 * sc, 7),
          mat(0x3d7f36),
        );
        crown.position.set(trunk.position.x, f.y + 3.1 * sc, trunk.position.z);
        group.add(trunk, crown);
      }
    }
  }

  scatterBuildings(group, s0, rng) {
    const f = this.highway.at(s0 + CHUNK_LEN * 0.55);
    const bx = f.x + f.nx * 58;
    const bz = f.z + f.nz * 58;

    for (let i = 0; i < 8 && this.buildings.length; i++) {
      const b = this.buildings[Math.floor(rng.next() * this.buildings.length)];
      group.add(
        placeProp(b, {
          x: bx + rng.range(-20, 20),
          y: f.y - 0.4,
          z: bz + rng.range(-16, 16),
          yaw: rng.range(0, Math.PI * 2),
          scale: rng.range(1.3, 2.5),
        }),
      );
    }

    for (let i = 0; i < 4 && this.houses.length; i++) {
      const h = this.houses[Math.floor(rng.next() * this.houses.length)];
      group.add(
        placeProp(h, {
          x: bx + rng.range(-28, 8),
          y: f.y - 0.2,
          z: bz + rng.range(-22, 22),
          yaw: rng.range(0, Math.PI * 2),
          scale: rng.range(0.95, 1.5),
        }),
      );
    }
  }

  scatterRocks(group, s0, rng) {
    const f = this.highway.at(s0 + CHUNK_LEN * 0.35);
    const mx = f.x + f.nx * 48;
    const mz = f.z + f.nz * 48;
    for (let i = 0; i < 4 && this.rocks.length; i++) {
      const r = this.rocks[Math.floor(rng.next() * this.rocks.length)];
      group.add(
        placeProp(r, {
          x: mx + rng.range(-16, 16),
          y: f.y,
          z: mz + rng.range(-16, 16),
          yaw: rng.range(0, Math.PI * 2),
          scale: rng.range(2.5, 5.5),
        }),
      );
    }
  }

  scatterRoadProps(group, s0, rng) {
    if (!this.roadProps.length) return;
    for (let i = 0; i < 3; i++) {
      const s = s0 + rng.range(8, CHUNK_LEN - 8);
      const f = this.highway.at(s);
      const side = rng.next() < 0.5 ? 1 : -1;
      const lat = ROAD_W / 2 + 1.1;
      const prop = this.roadProps[Math.floor(rng.next() * this.roadProps.length)];
      group.add(
        placeProp(prop, {
          x: f.x + f.nx * lat * side,
          y: f.y,
          z: f.z + f.nz * lat * side,
          yaw: -f.heading + Math.PI / 2,
          scale: rng.range(1.1, 1.45),
        }),
      );
    }
  }

  dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry && o.userData?.ownedGeo) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m?.userData?.owned) m.dispose();
        }
      }
    });
  }
}

export { ROAD_SURFACE };
