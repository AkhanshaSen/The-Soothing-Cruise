import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { cel, flat, inkOutline } from '../render/cel.js';
import { loadProp, celShadeModel, placePropOnGround } from '../core/assets.js';

const ROAD_HALF = 4.8;

const TREE_FILES = [
  'tree_1.glb',
  'tree_2.glb',
  'tree_3.glb',
  'tree_pine_1.glb',
  'tree_pine_2.glb',
  'bush_1.glb',
  'bush_2.glb',
];

const BUILDING_FILES = [
  'building-a.glb',
  'building-b.glb',
  'building-c.glb',
  'building-d.glb',
  'building-e.glb',
  'building-f.glb',
];

const HOUSE_FILES = [
  'building-type-a.glb',
  'building-type-b.glb',
  'building-type-c.glb',
  'building-type-d.glb',
];

const ROCK_FILES = ['rocks-low.glb', 'stones.glb'];

class SceneryBank {
  constructor() {
    this.ready = false;
    this.trees = [];
    this.buildings = [];
    this.houses = [];
    this.rocks = [];
    this.lights = [];
  }

  async load() {
    try {
      const loadTree = (f) =>
        loadProp('./assets/vegetation/', f).then((s) => {
          celShadeModel(s);
          return s;
        });
      const loadCity = (f) =>
        loadProp('./assets/city/', f).then((s) => {
          celShadeModel(s);
          return s;
        });
      const loadHouse = (f) =>
        loadProp('./assets/house/', f).then((s) => {
          celShadeModel(s);
          return s;
        });
      const loadForest = (f) =>
        loadProp('./assets/forest/', f).then((s) => {
          celShadeModel(s);
          return s;
        });
      const loadRoad = (f) =>
        loadProp('./assets/road/', f).then((s) => {
          celShadeModel(s);
          return s;
        });

      const results = await Promise.allSettled([
        ...TREE_FILES.map(loadTree),
        ...BUILDING_FILES.map(loadCity),
        ...HOUSE_FILES.map(loadHouse),
        ...ROCK_FILES.map(loadForest),
        loadRoad('light-square.glb'),
      ]);

      let i = 0;
      for (const f of TREE_FILES) {
        if (results[i].status === 'fulfilled') this.trees.push({ file: f, scene: results[i].value });
        i++;
      }
      for (const f of BUILDING_FILES) {
        if (results[i].status === 'fulfilled') this.buildings.push({ file: f, scene: results[i].value });
        i++;
      }
      for (const f of HOUSE_FILES) {
        if (results[i].status === 'fulfilled') this.houses.push({ file: f, scene: results[i].value });
        i++;
      }
      for (const f of ROCK_FILES) {
        if (results[i].status === 'fulfilled') this.rocks.push({ file: f, scene: results[i].value });
        i++;
      }
      if (results[i]?.status === 'fulfilled') this.lights.push({ file: 'light-square.glb', scene: results[i].value });

      this.ready = this.trees.length > 0;
      if (this.ready) {
        console.info(
          `[scenery] OpenCity assets: ${this.trees.length} trees, ${this.buildings.length} buildings, ${this.houses.length} houses`,
        );
      }
    } catch (err) {
      console.warn('[scenery] load failed, using procedural fallback', err);
    }
  }

  pick(list, rng) {
    return list[rng.int(0, list.length - 1)];
  }

  scatterTrees(group, highway, s0, length, seed) {
    if (!this.trees.length) return false;
    const rng = new Rng((seed + Math.floor(s0) * 17) | 0);
    for (let i = 0; i < 22; i++) {
      const s = s0 + rng.range(2, length - 2);
      const f = highway.at(s);
      const lat = rng.range(ROAD_HALF + 5, ROAD_HALF + 42);
      const side = rng.next() < 0.92 ? 1 : -1;
      const x = f.x + f.nx * lat * side;
      const z = f.z + f.nz * lat * side;
      const { scene } = this.pick(this.trees, rng);
      const sc = rng.range(1.0, 2.2);
      const prop = placePropOnGround(scene, {
        x,
        y: f.y,
        z,
        yaw: rng.range(0, Math.PI * 2),
        scale: sc,
      });
      prop.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      group.add(prop);
      inkOutline(prop, 0x160c12, 1.04);
    }
    return true;
  }

  placeCity(group, highway, s0, length, seed) {
    if (!this.buildings.length && !this.houses.length) return false;
    const rng = new Rng((seed + Math.floor(s0)) | 0);
    const f = highway.at(s0 + length * 0.55);
    const bx = f.x + f.nx * 65;
    const bz = f.z + f.nz * 65;

    for (let i = 0; i < 10 && this.buildings.length; i++) {
      const { scene } = this.pick(this.buildings, rng);
      const sc = rng.range(1.2, 2.4);
      const prop = placePropOnGround(scene, {
        x: bx + rng.range(-22, 22),
        y: f.y - 0.5,
        z: bz + rng.range(-18, 18),
        yaw: rng.range(0, Math.PI * 2),
        scale: sc,
      });
      group.add(prop);
      inkOutline(prop, 0x160c12, 1.04);
    }

    for (let i = 0; i < 4 && this.houses.length; i++) {
      const { scene } = this.pick(this.houses, rng);
      const sc = rng.range(0.9, 1.5);
      const prop = placePropOnGround(scene, {
        x: bx + rng.range(-28, 10),
        y: f.y - 1,
        z: bz + rng.range(-22, 22),
        yaw: rng.range(0, Math.PI * 2),
        scale: sc,
      });
      group.add(prop);
      inkOutline(prop, 0x160c12, 1.04);
    }
    return true;
  }

  placeMountainRocks(group, highway, s, seed) {
    if (!this.rocks.length) return false;
    const rng = new Rng((seed + 99) | 0);
    const f = highway.at(s);
    const mx = f.x + f.nx * 55;
    const mz = f.z + f.nz * 55;
    for (let i = 0; i < 5; i++) {
      const { scene } = this.pick(this.rocks, rng);
      const prop = placePropOnGround(scene, {
        x: mx + rng.range(-18, 18),
        y: f.y,
        z: mz + rng.range(-18, 18),
        yaw: rng.range(0, Math.PI * 2),
        scale: rng.range(2.5, 6),
      });
      group.add(prop);
      inkOutline(prop, 0x160c12, 1.04);
    }
    return true;
  }

  scatterLights(group, highway, s0, length, seed) {
    if (!this.lights.length) return;
    const rng = new Rng((seed + Math.floor(s0) * 3) | 0);
    const { scene } = this.lights[0];
    for (let i = 0; i < 3; i++) {
      const s = s0 + rng.range(5, length - 5);
      const f = highway.at(s);
      const lat = rng.next() < 0.5 ? ROAD_HALF + 1.2 : -(ROAD_HALF + 1.2);
      const prop = placePropOnGround(scene, {
        x: f.x + f.nx * lat,
        y: f.y,
        z: f.z + f.nz * lat,
        yaw: -f.heading + Math.PI / 2,
        scale: rng.range(1.1, 1.4),
      });
      group.add(prop);
      inkOutline(prop, 0x160c12, 1.04);
    }
  }
}

const bank = new SceneryBank();

export async function initScenery() {
  await bank.load();
}

export function sceneryReady() {
  return bank.ready;
}

export function scatterTrees(group, highway, s0, length, pal, seed) {
  if (bank.scatterTrees(group, highway, s0, length, seed)) return;
  proceduralTrees(group, highway, s0, length, pal, seed);
}

export function placeCity(group, highway, s0, length, pal, seed) {
  if (bank.placeCity(group, highway, s0, length, seed)) return;
  proceduralCity(group, highway, s0, length, pal, seed);
}

export function placeMountain(group, highway, s, pal, seed) {
  proceduralMountain(group, highway, s, pal, seed);
  bank.placeMountainRocks(group, highway, s, seed);
}

export function scatterRoadProps(group, highway, s0, length, seed) {
  bank.scatterLights(group, highway, s0, length, seed);
}

function proceduralTrees(group, highway, s0, length, pal, seed) {
  const rng = new Rng((seed + Math.floor(s0) * 17) | 0);
  for (let i = 0; i < 14; i++) {
    const s = s0 + rng.range(2, length - 2);
    const f = highway.at(s);
    const lat = rng.range(ROAD_HALF + 5, ROAD_HALF + 38);
    const x = f.x + f.nx * lat;
    const z = f.z + f.nz * lat;
    const sc = rng.range(0.85, 1.35);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16 * sc, 0.24 * sc, 1.5 * sc, 5),
      cel(pal.trunk),
    );
    trunk.position.set(x, f.y + 0.75 * sc, z);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.7 * sc, 6 * sc, 6),
      cel(rng.next() < 0.35 ? pal.treeDark : pal.tree),
    );
    crown.position.set(x, f.y + 4 * sc, z);
    group.add(trunk, crown);
  }
}

function proceduralCity(group, highway, s0, length, pal, seed) {
  const rng = new Rng((seed + Math.floor(s0)) | 0);
  const f = highway.at(s0 + length * 0.55);
  const bx = f.x + f.nx * 65;
  const bz = f.z + f.nz * 65;
  for (let i = 0; i < 10; i++) {
    const w = rng.range(3, 7);
    const h = rng.range(10, 30);
    const d = rng.range(3, 7);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      cel(rng.next() < 0.5 ? pal.city : pal.cityAccent),
    );
    b.position.set(bx + rng.range(-22, 22), f.y + h * 0.5 - 2, bz + rng.range(-18, 18));
    group.add(b);
  }
  for (let i = 0; i < 5; i++) {
    const h = rng.range(3.5, 5.5);
    const house = new THREE.Mesh(new THREE.BoxGeometry(3.6, h, 4.2), flat(0xf4f4ec));
    house.position.set(bx + rng.range(-28, 10), f.y + h * 0.5 - 1, bz + rng.range(-22, 22));
    group.add(house);
  }
}

function proceduralMountain(group, highway, s, pal, seed) {
  const rng = new Rng((seed + 99) | 0);
  const f = highway.at(s);
  const mx = f.x + f.nx * 55;
  const mz = f.z + f.nz * 55;
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(rng.range(32, 42), rng.range(45, 58), 8),
    cel(pal.mountain),
  );
  body.position.set(mx, f.y + 12, mz);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(15, 18, 7), flat(pal.snow));
  cap.position.set(mx, f.y + 44, mz);
  group.add(body, cap);
}
