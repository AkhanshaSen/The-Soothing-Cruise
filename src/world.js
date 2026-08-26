/**
 * Endless curved coastal world — Kenney / OpenCity GLB scenery.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { Highway, ROAD_SURFACE } from './highway.js';
import { buildRoadRibbon, buildRoadEdges } from './road.js';
import { buildWaterStrip } from './water.js';

export const CHUNK_LEN = 90;
export const ROAD_W = 14;
export const ROAD_HALF = ROAD_W / 2 - 0.6;
export const SKY = 0x8cc8e8;

const PAL = {
  // OpenCity coastal chapter palette (environment.js CHAPTERS[3])
  grass: 0x568744,
  grassAlt: 0x82a751,
  sand: 0xe8c96a,
  road: 0x55514d,
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
  root.userData.decorative = true;
  root.traverse((o) => {
    o.userData.decorative = true;
    if (o.isMesh) {
      o.raycast = () => {};
    }
  });
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
    /** @type {Map<number, { i: number, s0: number, group: THREE.Group, step: number, rng: Rng, mats: object }>} */
    this._pendingBuilds = new Map();
    this.trees = [];
    this.buildings = [];
    this.houses = [];
    this.rocks = [];
    this.roadProps = [];
    this.horizon = this.buildHorizon();
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

  /** Distant mountains + tree ring in scene space (player stays near origin). */
  buildHorizon() {
    const root = new THREE.Group();
    const rng = new Rng(9041);
    const rock = mat(0x5a6570);
    const rockDark = mat(0x3e4852);
    const snow = mat(0xe4eaf0);
    const pine = mat(0x2f5a32);
    const pineFar = mat(0x3a6840);
    rock.userData.owned = true;
    rockDark.userData.owned = true;
    snow.userData.owned = true;
    pine.userData.owned = true;
    pineFar.userData.owned = true;

    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const r = rng.range(300, 430);
      const h = rng.range(38, 92);
      const w = rng.range(22, 48);
      const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), i % 3 === 0 ? rockDark : rock);
      peak.position.set(Math.cos(a) * r, h * 0.38, Math.sin(a) * r);
      peak.rotation.y = rng.range(0, Math.PI);
      peak.castShadow = false;
      peak.receiveShadow = false;
      peak.userData.ownedGeo = true;
      root.add(peak);
      if (h > 62) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.28, h * 0.22, 5), snow);
        cap.position.set(peak.position.x, peak.position.y + h * 0.28, peak.position.z);
        cap.castShadow = false;
        cap.userData.ownedGeo = true;
        root.add(cap);
      }
    }

    for (let i = 0; i < 140; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(95, 250);
      const sc = rng.range(1.4, 3.6);
      const tree = new THREE.Mesh(new THREE.ConeGeometry(1.15 * sc, 5.2 * sc, 6), r > 180 ? pineFar : pine);
      tree.position.set(Math.cos(a) * r, 2.4 * sc, Math.sin(a) * r);
      tree.castShadow = false;
      tree.receiveShadow = false;
      tree.userData.ownedGeo = true;
      root.add(tree);
    }

    return root;
  }

  /**
   * Stream chunks around the player.
   * @param {number} playerS
   * @param {{speed?: number}} [opts]  speed in m/s — expands look-ahead at F1 pace
   */
  sync(playerS, opts = {}) {
    const speed = Math.abs(opts.speed ?? 0);
    const speedKmh = speed * 3.6;
    // Cruise (~150): +5 chunks. F1 (~350): +11–12 so road stays filled ahead.
    const ahead = 5 + Math.round(Math.max(0, Math.min(7, (speedKmh - 120) / 40)));
    const i0 = Math.max(0, Math.floor(playerS / CHUNK_LEN) - 1);
    const i1 = Math.floor(playerS / CHUNK_LEN) + ahead;
    const keep = new Set();

    for (let i = i0; i <= i1; i++) {
      keep.add(i);
      if (!this.chunks.has(i) && !this._pendingBuilds.has(i)) {
        this._startChunkBuild(i);
      }
    }

    // At high speed (or a backlog) finish several build steps per frame.
    const stepsBudget = speedKmh > 200
      ? 8
      : speedKmh > 140
        ? 4
        : this._pendingBuilds.size > 3
          ? 3
          : 1;

    if (this._pendingBuilds.size) {
      const playerChunk = Math.floor(playerS / CHUNK_LEN);
      for (let n = 0; n < stepsBudget && this._pendingBuilds.size; n++) {
        let best = null;
        let bestDist = Infinity;
        for (const pb of this._pendingBuilds.values()) {
          if (!keep.has(pb.i)) continue;
          // Prefer chunks ahead of the player over ones behind.
          const dist = pb.i >= playerChunk
            ? pb.i - playerChunk
            : 100 + (playerChunk - pb.i);
          if (dist < bestDist) {
            bestDist = dist;
            best = pb;
          }
        }
        if (!best) break;
        if (this._advanceChunkBuild(best)) {
          this._pendingBuilds.delete(best.i);
        }
      }
    }

    for (const [i, pb] of this._pendingBuilds) {
      if (!keep.has(i)) {
        this.dispose(pb.group);
        this._pendingBuilds.delete(i);
      }
    }

    for (const [i, chunk] of this.chunks) {
      if (!keep.has(i)) {
        this.stage.remove(chunk);
        this.dispose(chunk);
        this.chunks.delete(i);
      }
    }
  }

  /** Synchronously build any missing chunks (boot / first paint). */
  syncImmediate(playerS) {
    const i0 = Math.max(0, Math.floor(playerS / CHUNK_LEN) - 1);
    const i1 = Math.floor(playerS / CHUNK_LEN) + 5;
    const keep = new Set();

    for (let i = i0; i <= i1; i++) {
      keep.add(i);
      if (this._pendingBuilds.has(i)) {
        const pb = this._pendingBuilds.get(i);
        while (!this._advanceChunkBuild(pb)) {
          /* finish pending */
        }
        this._pendingBuilds.delete(i);
      } else if (!this.chunks.has(i)) {
        const chunk = this.buildChunk(i * CHUNK_LEN);
        this.stage.add(chunk);
        this.chunks.set(i, chunk);
      }
    }

    for (const [i, pb] of this._pendingBuilds) {
      if (!keep.has(i)) {
        this.dispose(pb.group);
        this._pendingBuilds.delete(i);
      }
    }

    for (const [i, chunk] of this.chunks) {
      if (!keep.has(i)) {
        this.stage.remove(chunk);
        this.dispose(chunk);
        this.chunks.delete(i);
      }
    }
  }

  _startChunkBuild(i) {
    const s0 = i * CHUNK_LEN;
    const group = new THREE.Group();
    group.userData.s0 = s0;
    group.userData.lights = [];
    const grassM = mat(PAL.grass);
    const sandM = mat(PAL.sand);
    const markM = new THREE.MeshBasicMaterial({ color: PAL.mark });
    for (const m of [grassM, sandM, markM]) m.userData.owned = true;
    this._pendingBuilds.set(i, {
      i,
      s0,
      group,
      step: 0,
      rng: new Rng((s0 * 9781) | 0),
      mats: { grassM, sandM, markM },
    });
  }

  /** @returns {boolean} true when the chunk is fully built and added to the stage */
  _advanceChunkBuild(pb) {
    const { s0, group, rng, mats } = pb;
    if (pb.step === 0) {
      this._buildChunkTerrain(group, s0, mats);
      pb.step = 1;
      return false;
    }
    if (pb.step === 1) {
      this._buildChunkRoad(group, s0, mats.markM);
      pb.step = 2;
      return false;
    }
    if (pb.step === 2) {
      this.scatterTrees(group, s0, rng);
      if (Math.floor(s0 / CHUNK_LEN) % 3 === 0) this.scatterBuildings(group, s0, rng);
      if (Math.floor(s0 / CHUNK_LEN) % 2 === 0) this.scatterRocks(group, s0, rng);
      this.scatterRoadProps(group, s0, rng);
      pb.step = 3;
      return false;
    }
    this.scatterStreetLights(group, s0);
    this.stage.add(group);
    this.chunks.set(pb.i, group);
    return true;
  }

  _buildChunkTerrain(group, s0, mats) {
    const ROAD_STEP = 5;
    const { grassM, sandM } = mats;

    const addSlab = (mx, my, mz, yaw, w, d, h, material, ox, oy, oz, castShadow, receiveShadow) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d + 0.12), material);
      m.position.set(mx + ox, my + oy, mz + oz);
      m.rotation.y = yaw;
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      m.userData.ownedGeo = true;
      group.add(m);
    };

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

      const tLen = segLen + 5.0;
      addSlab(mx, my, mz, yaw, 62, tLen, 0.10, grassM, nx * 32, 0.0, nz * 32, false, true);
      // Wider beach between asphalt and shore (~road edge → ~28 m).
      addSlab(mx, my, mz, yaw, 34, tLen, 0.08, sandM, -nx * 20, -0.04, -nz * 20, false, true);

      // Water centre ~78 m out; strip half-width 52 → shore ~26 m from road centre.
      const water = buildWaterStrip(
        mx - nx * 78,
        my,
        mz - nz * 78,
        yaw,
        104,
        tLen,
        -0.18,
      );
      group.add(water);
    }
  }

  _buildChunkRoad(group, s0, markM) {
    const roadMesh = buildRoadRibbon(this.highway, s0, s0 + CHUNK_LEN, ROAD_W);
    if (roadMesh) group.add(roadMesh);
    group.add(buildRoadEdges(this.highway, s0, s0 + CHUNK_LEN, ROAD_W, markM));

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
  }

  /** Full synchronous build (boot). */
  buildChunk(s0) {
    const group = new THREE.Group();
    group.userData.s0 = s0;
    group.userData.lights = [];
    const rng = new Rng((s0 * 9781) | 0);
    const grassM = mat(PAL.grass);
    const sandM = mat(PAL.sand);
    const markM = new THREE.MeshBasicMaterial({ color: PAL.mark });
    for (const m of [grassM, sandM, markM]) m.userData.owned = true;

    this._buildChunkTerrain(group, s0, { grassM, sandM, markM });
    this._buildChunkRoad(group, s0, markM);
    this.scatterTrees(group, s0, rng);
    if (Math.floor(s0 / CHUNK_LEN) % 3 === 0) this.scatterBuildings(group, s0, rng);
    if (Math.floor(s0 / CHUNK_LEN) % 2 === 0) this.scatterRocks(group, s0, rng);
    this.scatterRoadProps(group, s0, rng);
    this.scatterStreetLights(group, s0);
    return group;
  }

  /** Warm street-lamp glow — intensity driven by night blend (0–1).
   *  `camPos` must be in the same highway world space as stored lamp coords
   *  (not the recentered stage/player offset). */
  setNightLevel(night, camPos) {
    const n = Math.max(0, Math.min(1, night));
    const radius = 140;
    const r2 = radius * radius;
    const MAX_LIT = 14;

    const lights = [];
    for (const chunk of this.chunks.values()) {
      const chunkLights = chunk.userData.lights;
      if (chunkLights) {
        for (let i = 0; i < chunkLights.length; i++) lights.push(chunkLights[i]);
      }
    }

    if (!camPos || n < 0.05) {
      for (const l of lights) {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
        if (l.headMat) l.headMat.emissiveIntensity = 0.15;
      }
      return;
    }

    const headGlow = 0.55 + n * 2.2;
    const seenHead = new Set();

    // Partial top-K by distance — avoid full-array sort as the world grows.
    const top = [];
    for (const l of lights) {
      if (l.headMat && !seenHead.has(l.headMat)) {
        seenHead.add(l.headMat);
        l.headMat.emissiveIntensity = headGlow;
      }
      const dx = l.x - camPos.x;
      const dz = l.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
        continue;
      }
      if (top.length < MAX_LIT) {
        top.push({ l, d2 });
        if (top.length === MAX_LIT) top.sort((a, b) => a.d2 - b.d2);
      } else if (d2 < top[MAX_LIT - 1].d2) {
        top[MAX_LIT - 1] = { l, d2 };
        top.sort((a, b) => a.d2 - b.d2);
      } else {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
      }
    }

    const on = new Set(top.map((e) => e.l));
    for (const l of lights) {
      if (!on.has(l)) {
        l.bulb.visible = false;
        l.bulb.intensity = 0;
        continue;
      }
      const dist = Math.sqrt((l.x - camPos.x) ** 2 + (l.z - camPos.z) ** 2);
      const fall = Math.max(0, 1 - dist / radius);
      l.bulb.visible = true;
      l.bulb.intensity = n * (55 + 70 * fall);
    }
  }

  scatterStreetLights(group, s0) {
    const poleM = mat(0x2e2e34);
    const lampM = new THREE.MeshStandardMaterial({
      color: 0xffc078,
      emissive: 0xff8a2e,
      emissiveIntensity: 0.2,
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    poleM.userData.owned = true;
    lampM.userData.owned = true;

    const lights = group.userData.lights || (group.userData.lights = []);

    for (let s = s0 + 10; s < s0 + CHUNK_LEN; s += 35) {
      const f = this.highway.at(s);
      for (const side of [-1, 1]) {
        const lat = ROAD_W / 2 + 5.5;
        const x = f.x + f.nx * lat * side;
        const z = f.z + f.nz * lat * side;
        const y = f.y;

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), poleM);
        pole.position.set(x, y + 2.2, z);
        pole.castShadow = false;
        pole.userData.ownedGeo = true;
        pole.userData.decorative = true;
        pole.raycast = () => {};
        group.add(pole);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.32), lampM);
        head.position.set(x, y + 4.35, z);
        head.castShadow = false;
        head.receiveShadow = true;
        head.userData.ownedGeo = true;
        head.userData.decorative = true;
        head.raycast = () => {};
        group.add(head);

        const bulb = new THREE.PointLight(0xff8c3a, 0, 55, 1.55);
        bulb.position.set(x - f.nx * lat * side * 0.15, y + 3.85, z - f.nz * lat * side * 0.15);
        bulb.visible = false;
        group.add(bulb);
        lights.push({ bulb, headMat: lampM, x, y: y + 3.85, z, s0 });
      }
    }
  }

  scatterTrees(group, s0, rng) {
    const n = this.trees.length ? 28 : 16;
    // Water strip (see _buildChunkTerrain): center at ~78m out, half-width ~52m.
    // So water starts around ~26m out from the road center on the water-side.
    const waterCenterLat = 78;
    const waterHalfWidth = 104 / 2;
    const waterShoreLat = waterCenterLat - waterHalfWidth;
    const treeLatMin = ROAD_W / 2 + 10;
    const treeLatMaxOpposite = ROAD_W / 2 + 52;
    const treeLatMaxOnWaterSide = waterShoreLat - 2.5; // keep trunks on the land band
    const waterSide = -1; // because water is built at mx - nx * 78
    for (let i = 0; i < n; i++) {
      const s = s0 + rng.range(4, CHUNK_LEN - 4);
      const f = this.highway.at(s);
      const side = rng.next() < 0.88 ? 1 : -1;
      const latMax = side === waterSide ? treeLatMaxOnWaterSide : treeLatMaxOpposite;
      const lat = rng.range(treeLatMin, latMax);

      if (this.trees.length) {
        const t = this.trees[Math.floor(rng.next() * this.trees.length)];
        const tree = placeProp(t, {
          x: f.x + f.nx * lat * side,
          y: f.y + (side === waterSide ? 0.02 : 0),
          z: f.z + f.nz * lat * side,
          yaw: rng.range(0, Math.PI * 2),
          scale: rng.range(1.0, 2.2),
        });
        // Many vegetation instances with cast/receive shadows are expensive; keep them off.
        tree.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = false;
          }
        });
        group.add(tree);
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
        trunk.castShadow = false;
        crown.castShadow = false;
        group.add(trunk, crown);
      }
    }

    const pine = mat(0x2f5a32);
    pine.userData.owned = true;
    for (let i = 0; i < 18; i++) {
      const s = s0 + rng.range(2, CHUNK_LEN - 2);
      const f = this.highway.at(s);
      // Place far pines only on the land side to avoid crowns over the water strip.
      const side = 1;
      const lat = rng.range(ROAD_W / 2 + 40, ROAD_W / 2 + 78);
      const sc = rng.range(1.6, 3.2);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.3 * sc, 5.4 * sc, 6), pine);
      crown.position.set(f.x + f.nx * lat * side, f.y + 2.5 * sc, f.z + f.nz * lat * side);
      crown.castShadow = false;
      crown.receiveShadow = false;
      crown.userData.ownedGeo = true;
      crown.userData.decorative = true;
      crown.raycast = () => {};
      group.add(crown);
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
      const lat = ROAD_W / 2 + 6.5;
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
          if (m?.userData?.shared) continue;
          if (m?.userData?.owned) m.dispose();
        }
      }
    });
  }
}

export { ROAD_SURFACE };
