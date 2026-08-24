import * as THREE from 'three';
import { lerp, damp, dampAngle, smoothstep } from '../core/util.js';

export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.yawOff = 0;
    this.boomYaw = 0;
    this.yawOff = 0;
    this.look = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.fov = 62;
  }

  snapAtOrigin(vehicle) {
    const speed = Math.abs(vehicle.speed);
    const spdT = smoothstep(6, 52, speed);
    const dist = lerp(6.1, 8.4, spdT);
    const height = lerp(2.0, 2.5, spdT);
    const lookAhead = lerp(2, 5, spdT);
    const fov = lerp(62, 79, spdT);

    const vx = Math.cos(vehicle.yaw) * vehicle.speed;
    const vz = Math.sin(vehicle.yaw) * vehicle.speed;
    const velYaw = Math.abs(speed) > 0.5 ? Math.atan2(vz, vx) : vehicle.yaw;
    const aimYaw = lerp(velYaw, vehicle.yaw, 0.22);

    this.boomYaw = aimYaw + Math.PI;
    this.yawOff = this.boomYaw;
    this.fov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    this.pos.set(Math.cos(this.boomYaw) * dist, height, Math.sin(this.boomYaw) * dist);
    this.look.set(Math.cos(aimYaw) * lookAhead, 0.9, Math.sin(aimYaw) * lookAhead);
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }

  updateAtOrigin(dt, vehicle, lookBack) {
    const speed = Math.abs(vehicle.speed);
    const spdT = smoothstep(6, 52, speed);
    const dist = lerp(6.1, 8.4, spdT);
    const height = lerp(2.0, 2.5, spdT);
    const lookAhead = lerp(2, 5, spdT);
    const targetFov = lerp(62, 79, spdT);

    const vx = Math.cos(vehicle.yaw) * vehicle.speed;
    const vz = Math.sin(vehicle.yaw) * vehicle.speed;
    const velYaw = Math.abs(speed) > 0.5 ? Math.atan2(vz, vx) : vehicle.yaw;
    const aimYaw = lerp(velYaw, vehicle.yaw, 0.22);

    const back = lookBack ? Math.PI : 0;
    const targetBoomYaw = aimYaw + Math.PI + back;
    this.boomYaw = dampAngle(this.boomYaw, targetBoomYaw, 3.2, dt);

    const posRate = lerp(7.5, 12, spdT);
    const tx = Math.cos(this.boomYaw) * dist;
    const tz = Math.sin(this.boomYaw) * dist;
    this.pos.x = damp(this.pos.x, tx, posRate, dt);
    this.pos.y = damp(this.pos.y, height, posRate * 0.8, dt);
    this.pos.z = damp(this.pos.z, tz, posRate, dt);

    const lookRate = lerp(8, 14, spdT);
    const lx = Math.cos(aimYaw) * lookAhead;
    const lz = Math.sin(aimYaw) * lookAhead;
    this.look.x = damp(this.look.x, lx, lookRate, dt);
    this.look.y = damp(this.look.y, 0.9, lookRate, dt);
    this.look.z = damp(this.look.z, lz, lookRate, dt);

    this.fov = damp(this.fov, targetFov, 8, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(lookBack ? new THREE.Vector3(0, 0.9, 0) : this.look);
  }

  snap(vehicle) {
    this.snapAtOrigin(vehicle);
  }

  update(dt, vehicle, lookBack) {
    this.updateAtOrigin(dt, vehicle, lookBack);
  }
}
