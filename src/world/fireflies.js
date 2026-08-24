import * as THREE from 'three';

export class Fireflies {
  constructor(scene) {
    const n = 80;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0xfff1b0,
      size: 0.28,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    scene.add(this.points);
    this.base = pos;
  }

  update(vehicle, cycle, dt) {
    const want = cycle.night * 0.85;
    this.mat.opacity += (want - this.mat.opacity) * Math.min(1, dt * 2);
    const t = performance.now() * 0.001;
    for (let i = 0; i < 80; i++) {
      const a = i * 0.4 + t * 0.15;
      this.base[i * 3] = vehicle.pos.x + Math.cos(a) * (8 + (i % 7) * 2.4);
      this.base[i * 3 + 1] = vehicle.pos.y + 1.2 + Math.sin(t * 0.8 + i) * 1.1;
      this.base[i * 3 + 2] = vehicle.pos.z + Math.sin(a * 0.9) * (8 + (i % 5) * 2.2);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
