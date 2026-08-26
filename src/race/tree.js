/**
 * Physical Christmas Tree pole at the race start line.
 * Lights sync to Countdown.display() phases.
 */
import * as THREE from 'three';
import { ROAD_SURFACE } from '../world.js';

function bulbMesh(color, r = 0.18) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
  m.userData.ownedGeo = true;
  m.userData.litColor = color;
  m.userData.dimColor = 0x2a2620;
  m.userData.on = false;
  return m;
}

export class ChristmasTreePole {
  /**
   * @param {THREE.Object3D} parent
   * @param {import('../highway.js').Highway} highway
   * @param {number} startS
   * @param {number} [lateral]
   */
  constructor(parent, highway, startS, lateral = 9.5) {
    this.parent = parent;
    this.root = new THREE.Group();
    this.root.name = 'christmas-tree';
    parent.add(this.root);

    const f = highway.at(startS - 2);
    const x = f.x + f.nx * lateral;
    const z = f.z + f.nz * lateral;
    const y = f.y + ROAD_SURFACE;
    this.root.position.set(x, y, z);
    this.root.rotation.y = -f.heading + Math.PI / 2;

    const poleM = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      roughness: 0.85,
      metalness: 0.15,
    });
    poleM.userData.owned = true;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), poleM);
    pole.position.y = 2.6;
    pole.castShadow = false;
    pole.userData.ownedGeo = true;
    this.root.add(pole);

    const boardM = new THREE.MeshStandardMaterial({
      color: 0x1a1612,
      roughness: 0.9,
      metalness: 0,
    });
    boardM.userData.owned = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.35, 3.6, 0.12), boardM);
    board.position.set(0, 3.1, 0.12);
    board.userData.ownedGeo = true;
    this.root.add(board);

    const place = (mesh, lx, ly) => {
      mesh.position.set(lx, ly, 0.22);
      this.root.add(mesh);
      return mesh;
    };

    this.preL = place(bulbMesh(0xf0c429, 0.12), -0.42, 4.55);
    this.preR = place(bulbMesh(0xf0c429, 0.12), 0.42, 4.55);
    this.stageL = place(bulbMesh(0xefb020, 0.13), -0.42, 4.15);
    this.stageR = place(bulbMesh(0xefb020, 0.13), 0.42, 4.15);
    this.ambers = [
      place(bulbMesh(0xffb300, 0.16), 0, 3.55),
      place(bulbMesh(0xffb300, 0.16), 0, 3.05),
      place(bulbMesh(0xffb300, 0.16), 0, 2.55),
    ];
    this.greenL = place(bulbMesh(0x22c55e, 0.17), -0.28, 1.95);
    this.greenR = place(bulbMesh(0x22c55e, 0.17), 0.28, 1.95);

    this._all = [
      this.preL,
      this.preR,
      this.stageL,
      this.stageR,
      ...this.ambers,
      this.greenL,
      this.greenR,
    ];
  }

  _set(bulb, on) {
    if (!bulb || bulb.userData.on === on) return;
    bulb.userData.on = on;
    bulb.material.color.setHex(on ? bulb.userData.litColor : bulb.userData.dimColor);
    bulb.material.opacity = on ? 1 : 0.22;
  }

  /**
   * @param {null | { preStage?:boolean, stage?:boolean, ambers?:boolean[], go?:boolean }} cd
   */
  sync(cd) {
    if (!cd) {
      for (const b of this._all) this._set(b, false);
      return;
    }
    this._set(this.preL, !!cd.preStage);
    this._set(this.preR, !!cd.preStage);
    this._set(this.stageL, !!cd.stage);
    this._set(this.stageR, !!cd.stage);
    for (let i = 0; i < 3; i++) this._set(this.ambers[i], !!cd.ambers?.[i]);
    this._set(this.greenL, !!cd.go);
    this._set(this.greenR, !!cd.go);
  }

  dispose() {
    this.parent.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && !o.material.userData?.shared) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material.dispose?.();
      }
    });
  }
}
