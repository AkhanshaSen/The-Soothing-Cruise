/**
 * Chase camera — OpenCity src/car/camera.js (velocity follow, yaw lag, orbit).
 */
import * as THREE from 'three';
import { clamp, lerp, approach, smoothstep } from '../core/util.js';

const _dir = new THREE.Vector3();
const _boomDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _head = new THREE.Vector3();
const _p = new THREE.Vector3();
const _look = new THREE.Vector3();
const _right = new THREE.Vector3();
const _off = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const YAW_RATE = 4.5;
const MAX_YAW_LAG = 0.12;

function wrapPi(a) {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.yawLag = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.started = false;
    this._cur = new THREE.Vector3();
    this._lookCur = new THREE.Vector3();
    this._init = false;
  }

  reset() {
    this.started = false;
    this._init = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
  }

  /**
   * @param {object} p playerWorld() — x,y,z, carTx, carTz, velTx, velTz, tx, tz
   */
  update(p, dt, { lookBack = false, orbitYaw = 0, orbitPitch = 0, speed = 0 } = {}) {
    const speedKmh = Math.abs(speed) * 3.6;
    const speedT = clamp(speedKmh / 250, 0, 1);
    const back = lerp(6.1, 8.4, speedT) + 3 * speedT * speedT;
    const high = lerp(2.5, 3.1, speedT);

    _dir.set(p.carTx, 0, p.carTz);
    const velSq = p.velTx * p.velTx + p.velTz * p.velTz;
    if (velSq >= 4) {
      _dir.set(p.velTx, 0, p.velTz).normalize();
      _dir.x = _dir.x * 0.78 + p.carTx * 0.22;
      _dir.z = _dir.z * 0.78 + p.carTz * 0.22;
      _dir.normalize();
    } else if (speedKmh < 14) {
      const roadW = 1 - smoothstep(0, 14, speedKmh);
      _dir.set(
        _dir.x * (1 - roadW * 0.5) + p.tx * roadW * 0.5,
        0,
        _dir.z * (1 - roadW * 0.5) + p.tz * roadW * 0.5,
      ).normalize();
    }
    if (lookBack) _dir.negate();

    _boomDir.copy(_dir);
    const wantYaw = Math.atan2(_boomDir.z, _boomDir.x);
    if (!this.started) {
      this.yaw = wantYaw;
      this.started = true;
    }
    const cap = MAX_YAW_LAG * smoothstep(4, 20, Math.abs(speed));
    this.yawLag = clamp(wrapPi(this.yaw - wantYaw) * Math.exp(-YAW_RATE * dt), -cap, cap);
    this.yaw = wantYaw + this.yawLag;
    _boomDir.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));

    this.orbitYaw = approach(this.orbitYaw, orbitYaw, 8, dt);
    this.orbitPitch = approach(this.orbitPitch, orbitPitch, 8, dt);
    if (this.orbitYaw !== 0) _boomDir.applyAxisAngle(UP, this.orbitYaw);

    const bodyLift = 0.85;
    _head.set(p.x, p.y + bodyLift, p.z);
    _p.copy(_head).addScaledVector(_boomDir, -back).addScaledVector(_up, high - bodyLift);

    if (this.orbitPitch !== 0) {
      _right.crossVectors(_boomDir, _up).normalize();
      _off.subVectors(_p, _head);
      _off.applyAxisAngle(_right, this.orbitPitch);
      _p.copy(_head).add(_off);
    }

    const orbitAmt = Math.hypot(this.orbitYaw, this.orbitPitch);
    const orbitBlend = smoothstep(0.02, 0.22, orbitAmt);
    _look.set(p.x + _boomDir.x * 14, p.y + 1.0, p.z + _boomDir.z * 14);
    _look.lerp(_head, orbitBlend);

    if (!this._init) {
      this._cur.copy(_p);
      this._lookCur.copy(_look);
      this._init = true;
    }

    const posRate = lerp(8, 12, orbitBlend);
    const lookRate = lerp(12, 22, orbitBlend);
    this._cur.lerp(_p, 1 - Math.exp(-posRate * dt));
    this._lookCur.lerp(_look, 1 - Math.exp(-lookRate * dt));

    const floorY = p.y + 1.35;
    this._cur.y = Math.max(this._cur.y, floorY);
    _p.y = Math.max(_p.y, floorY);

    this.camera.position.copy(this._cur);
    this.camera.position.y = Math.max(this.camera.position.y, floorY);
    this.camera.lookAt(this._lookCur);

    const fov = 62 + 18 * speedT * speedT;
    this.camera.fov = approach(this.camera.fov, fov, 3, dt);
    this.camera.updateProjectionMatrix();
  }
}
