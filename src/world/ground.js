import * as THREE from 'three';
import { flat } from '../render/cel.js';

/** Always-visible road strip under the player — proves WebGL mesh drawing works. */
export class FollowGround {
  constructor(parent) {
    const group = new THREE.Group();
    group.name = 'follow-ground';

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 48),
      flat(0x1a1a22, { double: true }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.03;
    group.add(road);

    const grassL = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 48),
      flat(0x78c850, { double: true }),
    );
    grassL.rotation.x = -Math.PI / 2;
    grassL.position.set(20, 0.01, 0);
    group.add(grassL);

    const sandR = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 48),
      flat(0xe8c850, { double: true }),
    );
    sandR.rotation.x = -Math.PI / 2;
    sandR.position.set(-11, 0.01, 0);
    group.add(sandR);

    const waterR = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 48),
      flat(0x3898c8, { double: true }),
    );
    waterR.rotation.x = -Math.PI / 2;
    waterR.position.set(-36, -0.02, 0);
    group.add(waterR);

    parent.add(group);
    this.group = group;
  }

  update(vehicle, highway) {
    const f = highway.at(vehicle.s);
    this.group.position.set(f.x, f.y, f.z);
    this.group.rotation.y = f.heading;
  }
}
