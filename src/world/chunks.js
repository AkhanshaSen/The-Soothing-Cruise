import * as THREE from 'three';
import { paletteAt } from './biomes.js';
import { ROAD_SURFACE } from './path.js';
import { flat, inkOutline } from '../render/cel.js';
import { scatterTrees, placeCity, placeMountain, scatterRoadProps } from './scenery.js';

const ROAD_HALF = 4.8;
const STEPS = 14;
const MARK = 0xe8e2d4;
const INK = 0x160c12;
const INK_SCALE = 1.045;

function shadowMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addOutlined(group, mesh) {
  group.add(mesh);
  inkOutline(mesh, INK, INK_SCALE);
  return mesh;
}

export function buildChunk(highway, s0, length, seed) {
  const group = new THREE.Group();
  group.userData.s0 = s0;
  const pal = paletteAt(s0 + length * 0.5);

  for (let i = 0; i < STEPS; i++) {
    const t0 = i / STEPS;
    const t1 = (i + 1) / STEPS;
    const sA = s0 + t0 * length;
    const sB = s0 + t1 * length;
    const a = highway.at(sA);
    const b = highway.at(sB);
    const mid = highway.at((sA + sB) * 0.5);
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) + 0.6;
    const yaw = -mid.heading + Math.PI / 2;

    const grass = addOutlined(
      group,
      shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(55, 0.4, segLen), flat(pal.grass, { double: true }))),
    );
    grass.position.set(mid.x + mid.nx * 32, mid.y - 0.15, mid.z + mid.nz * 32);
    grass.rotation.y = yaw;

    const sand = addOutlined(
      group,
      shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, segLen), flat(pal.sand, { double: true }))),
    );
    sand.position.set(mid.x - mid.nx * 12, mid.y - 0.18, mid.z - mid.nz * 12);
    sand.rotation.y = yaw;

    const water = new THREE.Mesh(
      new THREE.BoxGeometry(90, 0.3, segLen),
      flat(pal.water, { double: true }),
    );
    water.position.set(mid.x - mid.nx * 58, mid.y - 0.35, mid.z - mid.nz * 58);
    water.rotation.y = yaw;
    group.add(water);

    const road = addOutlined(
      group,
      shadowMesh(
        new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 0.08, 0.18, segLen), flat(0x2a2a30, { double: true })),
      ),
    );
    road.position.set(mid.x, mid.y + 0.03, mid.z);
    road.rotation.y = yaw;

    const roadTop = addOutlined(
      group,
      shadowMesh(
        new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.14, segLen), flat(pal.road, { double: true })),
      ),
    );
    roadTop.position.set(mid.x, mid.y + ROAD_SURFACE, mid.z);
    roadTop.rotation.y = yaw;

    addCenterDashes(group, mid, segLen, yaw);
  }

  scatterTrees(group, highway, s0, length, pal, seed);
  scatterRoadProps(group, highway, s0, length, seed);
  const chunkIdx = Math.floor(s0 / length);
  if (chunkIdx % 4 === 2) addCrosswalk(group, highway, s0 + length * 0.5);
  if (chunkIdx % 3 === 0) placeCity(group, highway, s0, length, pal, seed);
  if (chunkIdx % 2 === 0) placeMountain(group, highway, s0 + length * 0.4, pal, seed);
  return group;
}

const DASH_LEN = 2.2;
const DASH_GAP = 2.8;

function addCenterDashes(group, mid, segLen, yaw) {
  const step = DASH_LEN + DASH_GAP;
  const tx = mid.tx;
  const tz = mid.tz;
  for (let d = -segLen * 0.5 + DASH_LEN * 0.5; d < segLen * 0.5 - DASH_LEN * 0.25; d += step) {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.02, DASH_LEN),
      flat(MARK, { double: true }),
    );
    dash.position.set(mid.x + tx * d, mid.y + ROAD_SURFACE + 0.005, mid.z + tz * d);
    dash.rotation.y = yaw;
    group.add(dash);
  }
}

function addCrosswalk(group, highway, s) {
  const f = highway.at(s);
  const yaw = -f.heading;
  for (let i = -4; i <= 4; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.02, ROAD_HALF * 2 + 0.4),
      flat(MARK, { double: true }),
    );
    stripe.position.set(f.x + f.nx * i * 0.62, f.y + ROAD_SURFACE + 0.008, f.z + f.nz * i * 0.62);
    stripe.rotation.y = yaw;
    group.add(stripe);
  }
}
