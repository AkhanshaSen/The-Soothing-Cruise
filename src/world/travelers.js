import * as THREE from 'three';
import { CARS } from '../vehicle/catalog.js';
import { buildProceduralCar } from '../vehicle/mesh.js';

export class Travelers {
  constructor(parent, highway) {
    this.highway = highway;
    this.items = CARS.slice(0, 4).map((spec, i) => {
      const mesh = buildProceduralCar(spec);
      mesh.scale.setScalar(0.95);
      parent.add(mesh);
      return {
        mesh,
        s: 100 + i * 120,
        speed: 10 + i * 1.1,
        lane: i % 2 === 0 ? 2.2 : -2.2,
      };
    });
  }

  update(dt, playerS) {
    for (const t of this.items) {
      t.s += t.speed * dt;
      if (t.s < playerS - 60) t.s = playerS + 200 + Math.random() * 120;
      if (t.s > playerS + 360) t.s = playerS - 30;
      const f = this.highway.at(t.s);
      t.mesh.position.set(f.x + f.nx * t.lane, f.y + 0.02, f.z + f.nz * t.lane);
      t.mesh.rotation.order = 'YXZ';
      t.mesh.rotation.y = -f.heading + Math.PI / 2;
      t.mesh.rotation.x = f.pitch * 0.4;
      const wheels = t.mesh.userData.wheels || [];
      for (const w of wheels) w.rotation.x += t.speed * dt * 2.6;
    }
  }
}
