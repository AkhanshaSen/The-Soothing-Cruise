import * as THREE from 'three';

/** Recenters all world geometry around the player — keeps coords near origin for stable rendering. */
export class Stage {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'stage';
    scene.add(this.root);
    this.anchor = new THREE.Vector3();
  }

  /** Shift stage so worldPos appears at the origin. */
  recenter(x, y, z) {
    this.anchor.set(x, y, z);
    this.root.position.set(-x, -y, -z);
  }

  recenterVec(v) {
    this.recenter(v.x, v.y, v.z);
  }
}
