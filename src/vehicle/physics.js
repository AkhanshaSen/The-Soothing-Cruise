import * as THREE from 'three';
import { clamp, damp, wrapPi } from '../core/util.js';

export class Vehicle {
  constructor(spec, highway) {
    this.spec = spec;
    this.highway = highway;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.steer = 0;
    this.s = 40;
    this.rpm = 900;
    this.assist = true;
    this.wheelSpin = 0;
    spawn(this, highway);
  }

  respawn() {
    spawn(this, this.highway);
    this.speed = 8;
  }

  update(dt, input) {
    const n = Math.max(1, Math.min(6, Math.round(dt / (1 / 90))));
    const step = dt / n;
    for (let i = 0; i < n; i++) this.step(step, input);
  }

  step(dt, input) {
    const spec = this.spec;
    let throttle = input.throttle;
    let steerIn = input.steer;
    let brake = input.brake;
    const ground = this.highway.heightAt(this.pos.x, this.pos.z, this.s);

    if (this.assist && !input.handbrake) {
      const err = wrapPi(ground.frame.heading - this.yaw);
      this.yaw += wrapPi(ground.frame.heading - this.yaw) * (1 - Math.exp(-12 * dt));
      if (Math.abs(steerIn) < 0.08) steerIn = clamp(err * 1.6, -1, 1);
      if (throttle < 0.05 && brake < 0.05) throttle = 0.4;
      const lat = ground.lateral;
      this.pos.x -= ground.nx * lat * 10 * dt;
      this.pos.z -= ground.nz * lat * 10 * dt;
    }

    const maxSteer = spec.steer * (1 - clamp(Math.abs(this.speed) / spec.top, 0, 0.72) * 0.55);
    this.steer = damp(this.steer, steerIn * maxSteer, 8, dt);

    const drag = 18 + this.speed * this.speed * 0.55;
    const drive = throttle * spec.power;
    const brakes = brake * 14000 + input.handbrake * 9000;
    const acc = (drive - brakes - drag * Math.sign(this.speed || 1)) / spec.mass;
    this.speed += acc * dt;
    if (brake > 0.2 && this.speed < 1.2) this.speed = Math.max(-8, this.speed - 6 * dt);
    this.speed = clamp(this.speed, -10, spec.top);

    const yawRate = this.speed * Math.tan(this.steer) / spec.wheelbase;
    this.yaw += yawRate * dt;

    if (Math.abs(ground.lateral) > 5.4) this.speed *= 1 - 0.55 * dt;

    this.pos.x += Math.cos(this.yaw) * this.speed * dt;
    this.pos.z += Math.sin(this.yaw) * this.speed * dt;
    this.s = ground.frame.s;
    this.pos.y = damp(this.pos.y, ground.y, 10, dt);
    this.pitch = damp(this.pitch, ground.frame.pitch - throttle * 0.04 + brake * 0.06, 6, dt);
    this.roll = damp(this.roll, -this.steer * 0.18 * clamp(this.speed / 20, 0, 1), 6, dt);
    this.wheelSpin += (this.speed / 0.34) * dt;
    this.rpm = 900 + Math.abs(this.speed) * 68 + throttle * 900;
  }
}

function spawn(v, highway) {
  const f = highway.at(40);
  v.s = 40;
  v.pos.set(f.x, f.y, f.z);
  v.yaw = f.heading;
  v.speed = 10;
}
