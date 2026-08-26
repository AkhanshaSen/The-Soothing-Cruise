/**
 * Drift FX — continuous rubber skid ribbons (OpenCity-style) + Kenney CC0 smoke puffs.
 * Emits only at high speed with a hard left/right steer.
 *
 * Smoke: Kenney Smoke Particles (CC0) — https://kenney.nl/assets/smoke-particles
 */
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { ROAD_SURFACE } from '../world.js';
import { DRIFT_MIN_KMH, DRIFT_HARD_STEER } from '../vehicle/drive.js';

const DRIFT_MIN_MS = DRIFT_MIN_KMH / 3.6;
const MAX_SEG = 280;
const SKID_LIFE = 10;
const MAX_SMOKE = 48;
const MAX_SMOKE_SPAWN = 4;

const SMOKE_URLS = [
  './assets/fx/smoke/whitePuff00.png',
  './assets/fx/smoke/whitePuff08.png',
  './assets/fx/smoke/whitePuff16.png',
  './assets/fx/smoke/blackSmoke00.png',
  './assets/fx/smoke/blackSmoke12.png',
  './assets/fx/smoke/blackSmoke18.png',
];

const SKID_VERT = /* glsl */ `
attribute float aBirth;
attribute float aStrength;
uniform float uTime;
varying float vAge;
varying float vStrength;
varying vec2 vUv;
void main() {
  vAge = uTime - aBirth;
  vStrength = aStrength;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKID_FRAG = /* glsl */ `
precision highp float;
uniform float uLifetime;
uniform vec3 uCore;
uniform vec3 uEdge;
varying float vAge;
varying float vStrength;
varying vec2 vUv;
void main() {
  if (vAge < 0.0 || vAge >= uLifetime) discard;
  float fade = 1.0 - smoothstep(uLifetime * 0.55, uLifetime, vAge);
  float across = abs(vUv.y - 0.5);
  float aa = max(fwidth(across) * 1.4, 0.002);
  float coverage = 1.0 - smoothstep(0.42 - aa, 0.42 + aa, across);
  if (coverage <= 0.001) discard;
  float core = 1.0 - smoothstep(0.22, 0.34, across);
  vec3 color = mix(uEdge, uCore, core);
  gl_FragColor = vec4(color, max(0.85, vStrength) * fade * coverage);
}`;

export class SkidFx {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Camera} [camera]
   */
  constructor(parent, camera = null) {
    this.parent = parent;
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'skid-fx';
    parent.add(this.root);

    this._time = 0;
    this._emitAcc = 0;
    this._smokeAcc = 0;
    this._lastX = 0;
    this._lastZ = 0;
    this._hasLast = false;
    this._lastNx = 0;
    this._lastNz = 1;

    this._buildSkidMesh();
    this._buildSmoke();
  }

  setCamera(camera) {
    this.camera = camera;
  }

  _buildSkidMesh() {
    const verts = MAX_SEG * 4;
    this._pos = new Float32Array(verts * 3);
    this._birth = new Float32Array(verts);
    this._str = new Float32Array(verts);
    this._birth.fill(-1e6);

    const uvs = new Float32Array(verts * 2);
    const idx = new Uint32Array(MAX_SEG * 6);
    for (let i = 0; i < MAX_SEG; i++) {
      const v = i * 4;
      const u = v * 2;
      uvs[u] = 0; uvs[u + 1] = 0;
      uvs[u + 2] = 0; uvs[u + 3] = 1;
      uvs[u + 4] = 1; uvs[u + 5] = 0;
      uvs[u + 6] = 1; uvs[u + 7] = 1;
      const x = i * 6;
      idx[x] = v; idx[x + 1] = v + 2; idx[x + 2] = v + 1;
      idx[x + 3] = v + 1; idx[x + 4] = v + 2; idx[x + 5] = v + 3;
    }

    const geo = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(this._pos, 3);
    this._birthAttr = new THREE.BufferAttribute(this._birth, 1);
    this._strAttr = new THREE.BufferAttribute(this._str, 1);
    geo.setAttribute('position', this._posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aBirth', this._birthAttr);
    geo.setAttribute('aStrength', this._strAttr);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    this._skidMat = new THREE.ShaderMaterial({
      vertexShader: SKID_VERT,
      fragmentShader: SKID_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uLifetime: { value: SKID_LIFE },
        uCore: { value: new THREE.Color(0x10080c) },
        uEdge: { value: new THREE.Color(0x1a0e12) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });

    this._skidMesh = new THREE.Mesh(geo, this._skidMat);
    this._skidMesh.frustumCulled = false;
    this._skidMesh.renderOrder = 4;
    this._skidMesh.visible = false;
    this.root.add(this._skidMesh);
    this._skidCursor = 0;
    this._skidDirty = false;
  }

  _buildSmoke() {
    this._smokeTex = [];
    this._loader = new THREE.TextureLoader();
    for (const url of SMOKE_URLS) {
      this._loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this._smokeTex.push(tex);
      });
    }

    this._smokeGeo = new THREE.PlaneGeometry(1, 1);
    this._smoke = [];
    for (let i = 0; i < MAX_SMOKE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      m.visible = false;
      m.renderOrder = 6;
      m.userData.life = 0;
      m.userData.maxLife = 1;
      m.userData.vx = 0;
      m.userData.vy = 0;
      m.userData.vz = 0;
      this.root.add(m);
      this._smoke.push(m);
    }
    this._smokeIdx = 0;
  }

  /**
   * @param {number} dt
   * @param {{ x:number, y:number, z:number, heading:number, carTx?:number, carTz?:number }} p
   * @param {{
   *   speed:number,
   *   handbrake?:number,
   *   yawOffset?:number,
   *   steer?:number,
   *   drift?:number,
   * }} state
   */
  update(dt, p, state) {
    this._time += dt;
    this._skidMat.uniforms.uTime.value = this._time;
    this._updateSmoke(dt);

    const speed = Math.abs(state.speed ?? 0);
    const steer = Math.abs(state.steer ?? 0);
    const yaw = Math.abs(state.yawOffset ?? 0);
    const hb = state.handbrake ?? 0;
    const driftK = state.drift ?? 0.6;

    // Visible drift only: ≥130 km/h AND very hard left/right steer.
    const hardSteer = steer >= DRIFT_HARD_STEER || (hb > 0.4 && yaw > 0.22);
    const active = speed >= DRIFT_MIN_MS && hardSteer;
    const strength = active
      ? clamp(
          (steer - DRIFT_HARD_STEER) * 2.2 + yaw * 1.6 + hb * 0.35,
          0.35,
          1,
        ) * (0.55 + driftK * 0.45)
      : 0;

    const prevX = this._lastX;
    const prevZ = this._lastZ;
    const dx = p.x - prevX;
    const dz = p.z - prevZ;
    const moved = Math.hypot(dx, dz);
    const heading = p.heading ?? 0;
    const nx = -Math.sin(heading);
    const nz = Math.cos(heading);

    if (!this._hasLast) {
      this._lastX = p.x;
      this._lastZ = p.z;
      this._lastNx = nx;
      this._lastNz = nz;
      this._hasLast = true;
      return;
    }

    this._lastX = p.x;
    this._lastZ = p.z;

    if (!active || strength < 0.3 || moved < 0.04) {
      this._emitAcc = 0;
      this._smokeAcc = 0;
      this._lastNx = nx;
      this._lastNz = nz;
      this._flushSkid();
      return;
    }

    this._emitAcc += moved;
    const spacing = lerp(0.42, 0.22, strength);
    while (this._emitAcc >= spacing) {
      this._emitAcc -= spacing;
      const t = clamp(1 - this._emitAcc / Math.max(moved, 1e-6), 0, 1);
      const ax = prevX + dx * Math.max(0, t - 0.08);
      const az = prevZ + dz * Math.max(0, t - 0.08);
      const bx = prevX + dx * t;
      const bz = prevZ + dz * t;
      const y = (p.y ?? 0) + ROAD_SURFACE + 0.028;
      const width = lerp(0.14, 0.28, strength);
      // Dual tire tracks.
      for (const side of [-0.55, 0.55]) {
        this._addSeg(
          ax + this._lastNx * side,
          y,
          az + this._lastNz * side,
          bx + nx * side,
          y,
          bz + nz * side,
          this._lastNx,
          this._lastNz,
          nx,
          nz,
          width,
          strength,
        );
      }
    }

    this._smokeAcc += dt * lerp(10, 28, strength);
    let spawned = 0;
    while (this._smokeAcc >= 1 && spawned < MAX_SMOKE_SPAWN) {
      this._smokeAcc -= 1;
      this._spawnSmoke(p, heading, strength, state.yawOffset || 0);
      spawned++;
    }

    this._lastNx = nx;
    this._lastNz = nz;
    this._flushSkid();
  }

  _addSeg(ax, ay, az, bx, by, bz, nax, naz, nbx, nbz, width, strength) {
    const i = this._skidCursor;
    this._skidCursor = (i + 1) % MAX_SEG;
    const half = width * 0.5;
    const v = i * 4;
    const p = v * 3;
    this._pos[p] = ax - nax * half;
    this._pos[p + 1] = ay;
    this._pos[p + 2] = az - naz * half;
    this._pos[p + 3] = ax + nax * half;
    this._pos[p + 4] = ay;
    this._pos[p + 5] = az + naz * half;
    this._pos[p + 6] = bx - nbx * half;
    this._pos[p + 7] = by;
    this._pos[p + 8] = bz - nbz * half;
    this._pos[p + 9] = bx + nbx * half;
    this._pos[p + 10] = by;
    this._pos[p + 11] = bz + nbz * half;
    const s = strength * (0.88 + Math.random() * 0.12);
    for (let k = 0; k < 4; k++) {
      this._birth[v + k] = this._time;
      this._str[v + k] = s;
    }
    this._skidDirty = true;
    this._skidMesh.visible = true;
  }

  _flushSkid() {
    if (!this._skidDirty) return;
    this._posAttr.needsUpdate = true;
    this._birthAttr.needsUpdate = true;
    this._strAttr.needsUpdate = true;
    this._skidDirty = false;
    let live = 0;
    for (let i = 0; i < MAX_SEG; i++) {
      const age = this._time - this._birth[i * 4];
      if (age >= 0 && age < SKID_LIFE) live++;
    }
    this._skidMesh.visible = live > 0;
  }

  _spawnSmoke(p, heading, strength, yawOffset) {
    if (!this._smokeTex.length) return;
    const m = this._smoke[this._smokeIdx++ % MAX_SMOKE];
    const tex = this._smokeTex[(Math.random() * this._smokeTex.length) | 0];
    m.material.map = tex;
    m.material.needsUpdate = true;

    const nx = -Math.sin(heading);
    const nz = Math.cos(heading);
    const tx = Math.cos(heading);
    const tz = Math.sin(heading);
    const side = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.35);
    const back = 1.1 + Math.random() * 0.9;
    const slip = Math.sign(yawOffset || 1);

    m.position.set(
      p.x + nx * side - tx * back,
      (p.y ?? 0) + ROAD_SURFACE + 0.15 + Math.random() * 0.2,
      p.z + nz * side - tz * back,
    );
    const rise = lerp(1.2, 2.4, strength);
    m.userData.vx = -tx * (0.4 + Math.random() * 0.8) + nx * slip * (0.3 + Math.random() * 0.9);
    m.userData.vy = rise;
    m.userData.vz = -tz * (0.4 + Math.random() * 0.8) + nz * slip * (0.3 + Math.random() * 0.9);
    m.userData.maxLife = lerp(0.55, 1.15, strength);
    m.userData.life = m.userData.maxLife;
    m.userData.peak = lerp(0.28, 0.55, strength);
    m.scale.setScalar(lerp(1.1, 2.2, strength));
    m.material.opacity = m.userData.peak;
    m.visible = true;
  }

  _updateSmoke(dt) {
    const cam = this.camera;
    for (const m of this._smoke) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) {
        m.visible = false;
        m.material.opacity = 0;
        continue;
      }
      const t = clamp(m.userData.life / m.userData.maxLife, 0, 1);
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.userData.vy *= 1 - 0.55 * dt;
      m.scale.multiplyScalar(1 + 0.55 * dt);
      m.material.opacity = m.userData.peak * t * t;
      if (cam) m.quaternion.copy(cam.quaternion);
    }
  }

  dispose() {
    this.parent.remove(this.root);
    this._skidMesh.geometry.dispose();
    this._skidMat.dispose();
    this._smokeGeo.dispose();
    for (const m of this._smoke) m.material.dispose?.();
    for (const t of this._smokeTex) t.dispose?.();
  }
}
