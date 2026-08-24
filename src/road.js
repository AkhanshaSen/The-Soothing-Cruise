/**
 * Vertex-coloured road ribbon — adapted from OpenCity world/track.js buildRoad().
 * Patchy asphalt tones, worn wheel tracks, and green verge shoulders.
 */
import * as THREE from 'three';
import { ROAD_SURFACE } from './highway.js';
import { clamp, smoothstep } from './core/util.js';
import { tableNoise1, noise2 } from './core/rng.js';

const ROAD_STEP = 3;
const COLUMNS = 9;

const grain = tableNoise1(991);
const rutN = tableNoise1(1201);
const wanderN = tableNoise1(1307);
const driftN = tableNoise1(1409);
const patchN = noise2(1409);
const microN = noise2(1703);

const base = new THREE.Color(0x55514d);
const shade = new THREE.Color(0x292a2b);
const pale = new THREE.Color(0x5b656f);
const verge = new THREE.Color(0x78975a);
const surface = new THREE.Color();

/** @param {import('./highway.js').Highway} highway */
export function buildRoadRibbon(highway, s0, sEnd, roadW) {
  const hw = roadW * 0.5;
  const stations = [];
  for (let s = s0; s <= sEnd + 0.01; s += ROAD_STEP) {
    stations.push(highway.at(s));
  }
  const N = stations.length;
  if (N < 2) return null;

  const verts = new Float32Array(N * COLUMNS * 3);
  const cols = new Float32Array(N * COLUMNS * 3);
  const idx = new Uint32Array((N - 1) * (COLUMNS - 1) * 6);

  let vi = 0;
  let ci = 0;
  let ii = 0;

  for (let i = 0; i < N; i++) {
    const f = stations[i];
    const wear = [0, 1].map((k) =>
      clamp(0.08 + rutN(f.s / 15 + k * 311) * 0.88 + rutN(f.s / 5.2 + k * 127) * 0.58, 0, 0.94),
    );
    const line = [0, 1].map((k) =>
      clamp(
        0.34 + wanderN(f.s / 13 + k * 211) * 0.2 + wanderN(f.s / 4.7 + k * 83) * 0.07,
        0.15,
        0.59,
      ),
    );
    const shoulder = [0, 1].map((k) =>
      clamp(0.4 + driftN(f.s / 25 + k * 407) * 0.5, 0.04, 0.82),
    );

    for (let c = 0; c < COLUMNS; c++) {
      const u = c / (COLUMNS - 1);
      const lat = (u - 0.5) * 2;
      const side = lat >= 0 ? 1 : 0;
      const amp = wear[side];
      const ctr = line[side];

      verts[vi++] = f.x + f.nx * lat * hw;
      verts[vi++] = f.y + ROAD_SURFACE;
      verts[vi++] = f.z + f.nz * lat * hw;

      const patch =
        patchN(f.s / 14, lat * 3.4 + 11) * 0.75 +
        patchN(f.s / 5.2 + 37, lat * 6.5 + 3) * 0.55 +
        microN(f.s / 2.8 + 91, lat * 10.5 + 17) * 0.35 -
        0.83;
      surface.copy(base);
      if (patch > 0) surface.lerp(pale, Math.min(patch, 1) * 0.86);
      else surface.lerp(shade, Math.min(-patch, 1) * 0.86);

      const aggregate = microN(f.s / 3.6 + 217, lat * 9.3 + 5) * 2 - 1;
      if (aggregate > 0.16) surface.lerp(pale, (aggregate - 0.16) * 0.68);
      else if (aggregate < -0.16) surface.lerp(shade, (-aggregate - 0.16) * 0.64);

      const rut = Math.exp(-Math.pow((Math.abs(lat) - ctr) * 11, 2)) * amp;
      const rutBreak = 0.2 + microN(f.s / 4.2 + side * 53, lat * 8.5 + 29) * 0.8;
      surface.lerp(pale, rut * rutBreak * 0.22);

      const edge = smoothstep(0.84, 1.0, Math.abs(lat));
      surface.lerp(verge, edge * shoulder[side]);

      const chip = grain(f.s / 3.2 + c * 19.7);
      if (chip > 0.38) surface.lerp(pale, (chip - 0.38) * 0.32);
      else if (chip < -0.38) surface.lerp(shade, (-chip - 0.38) * 0.28);

      const speckle = 1 + grain(f.s / 4.6 + c * 7.7) * 0.025;
      cols[ci++] = surface.r * speckle;
      cols[ci++] = surface.g * speckle;
      cols[ci++] = surface.b * speckle;
    }
  }

  for (let i = 0; i < N - 1; i++) {
    for (let c = 0; c < COLUMNS - 1; c++) {
      const a = i * COLUMNS + c;
      const b = a + 1;
      const d = a + COLUMNS;
      const e = d + 1;
      idx[ii++] = a;
      idx[ii++] = b;
      idx[ii++] = d;
      idx[ii++] = b;
      idx[ii++] = e;
      idx[ii++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.userData.owned = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownedGeo = true;
  return mesh;
}

/** Solid white edge lines — both shoulders. */
export function buildRoadEdges(highway, s0, sEnd, roadW, markM) {
  const group = new THREE.Group();
  const hw = roadW * 0.5 - 0.15;

  for (const side of [-1, 1]) {
    for (let s = s0; s < sEnd; s += 4) {
      const f = highway.at(s);
      const yaw = Math.atan2(f.tx, f.tz);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 3.6), markM);
      line.position.set(
        f.x + f.nx * hw * side,
        f.y + ROAD_SURFACE + 0.014,
        f.z + f.nz * hw * side,
      );
      line.rotation.y = yaw;
      line.castShadow = false;
      line.receiveShadow = false;
      line.userData.ownedGeo = true;
      group.add(line);
    }
  }

  return group;
}
