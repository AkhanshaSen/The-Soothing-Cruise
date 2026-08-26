/**
 * Player headlight beams — SpotLights + optional emissive nose discs.
 */
import * as THREE from 'three';

export class Headlights {
  /**
   * @param {THREE.Object3D} car
   */
  constructor(car) {
    this.car = car;
    this.forced = null; // null = auto from night, true/false = override
    this._on = false;

    this.root = new THREE.Group();
    this.root.name = 'headlights';
    car.add(this.root);

    const makeSpot = (x) => {
      const spot = new THREE.SpotLight(0xfff0d8, 0, 55, Math.PI / 7.5, 0.42, 1.4);
      spot.position.set(x, 0.55, 0);
      spot.castShadow = false;
      const target = new THREE.Object3D();
      target.position.set(x * 0.15, 0.15, 18);
      this.root.add(spot);
      this.root.add(target);
      spot.target = target;
      return spot;
    };

    this.left = makeSpot(-0.55);
    this.right = makeSpot(0.55);

    const bulbMat = new THREE.MeshBasicMaterial({
      color: 0xfff4d8,
      transparent: true,
      opacity: 0,
    });
    this._bulbMat = bulbMat;
    const bulbGeo = new THREE.CircleGeometry(0.09, 10);
    this.leftBulb = new THREE.Mesh(bulbGeo, bulbMat);
    this.rightBulb = new THREE.Mesh(bulbGeo, bulbMat.clone());
    this.leftBulb.position.set(-0.52, 0.48, 0);
    this.rightBulb.position.set(0.52, 0.48, 0);
    this.root.add(this.leftBulb, this.rightBulb);

    this._alignToModel();
  }

  _alignToModel() {
    const mf = this.car.userData?.modelForward;
    if (!mf || mf.lengthSq() < 1e-8) {
      // Kenney cars often face +Z after measure; spots already aimed +Z via target.
      return;
    }
    // Orient the light group so local +Z matches modelForward in car space.
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      mf.clone().normalize(),
    );
    this.root.quaternion.copy(q);
  }

  /** Bind to a newly swapped car mesh. */
  attach(car) {
    if (this.car === car) {
      this._alignToModel();
      return;
    }
    this.root.parent?.remove(this.root);
    this.car = car;
    car.add(this.root);
    this._alignToModel();
  }

  toggle() {
    if (this.forced === null) this.forced = true;
    else if (this.forced === true) this.forced = false;
    else this.forced = null;
    return this.forced;
  }

  /**
   * @param {number} night 0..1
   */
  update(night) {
    const want = this.forced === null ? night > 0.35 : this.forced;
    this._on = !!want;
    const intensity = this._on ? (this.forced === true ? 42 : 18 + night * 36) : 0;
    this.left.intensity = intensity;
    this.right.intensity = intensity;
    const glow = this._on ? 0.85 : 0;
    this.leftBulb.material.opacity = glow;
    this.rightBulb.material.opacity = glow;
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.left.dispose?.();
    this.right.dispose?.();
    this.leftBulb.geometry.dispose();
    this.rightBulb.geometry.dispose();
    this.leftBulb.material.dispose();
    this.rightBulb.material.dispose();
  }
}
