/**
 * Highway race decorations — arches + roof arrow using highway.at(s).
 * Adapted from OpenCity race/marks.js.
 */
import * as THREE from 'three';
import { ROAD_SURFACE } from '../world.js';

const LIVE = 0xf0b429;
const NEXT = 0xe8d4a8;

function archGeo(radius, tube) {
  const pts = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * i) / steps;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tube, 8, false);
}

function makeFlatArrowGeo(thickness = 0.18, margin = 0) {
  const shape = new THREE.Shape();
  const tipZ = 0.95 + margin * 1.1;
  const wingX = 0.60 + margin;
  const wingZ = 0.08 - margin * 0.4;
  const notchX = 0.28 + margin * 0.5;
  const notchZ = 0.20 + margin * 0.3;
  const tailZ = -0.72 - margin;
  const tailNotchZ = -0.46 - margin * 0.4;
  shape.moveTo(0, tipZ);
  shape.lineTo(wingX, wingZ);
  shape.lineTo(notchX, notchZ);
  shape.lineTo(notchX, tailZ);
  shape.lineTo(0, tailNotchZ);
  shape.lineTo(-notchX, tailZ);
  shape.lineTo(-notchX, notchZ);
  shape.lineTo(-wingX, wingZ);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  geo.rotateX(Math.PI / 2);
  geo.center();
  return geo;
}

function makeArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb800 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x181412 });
  const hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const border = new THREE.Mesh(makeFlatArrowGeo(0.08, 0.04), dark);
  border.position.y = -0.06;
  const body = new THREE.Mesh(makeFlatArrowGeo(0.18, 0), mat);
  body.position.y = 0.02;
  g.add(border, body);
  g.userData.mat = mat;
  g.userData.hi = hi;
  return g;
}

export class HighwayRaceMarks {
  /**
   * @param {THREE.Object3D} parent  usually world.stage (recentering)
   * @param {{ checkpoints: { s:number, radius:number }[] }} route
   * @param {import('../highway.js').Highway} highway
   */
  constructor(parent, route, highway) {
    this.parent = parent;
    this.route = route;
    this.highway = highway;
    this.root = new THREE.Group();
    this.root.name = 'race-marks';
    parent.add(this.root);

    this.gates = [];
    for (let i = 0; i < route.checkpoints.length; i++) {
      const cp = route.checkpoints[i];
      const f = highway.at(cp.s);
      const group = new THREE.Group();
      group.position.set(f.x, f.y + ROAD_SURFACE + 0.06, f.z);
      group.rotation.y = -f.heading + Math.PI / 2;

      const liveMat = new THREE.MeshBasicMaterial({
        color: LIVE, transparent: true, opacity: 0.95, depthWrite: false,
      });
      const nextMat = new THREE.MeshBasicMaterial({
        color: NEXT, transparent: true, opacity: 0.55, depthWrite: false,
      });
      const live = new THREE.Mesh(archGeo(cp.radius, 0.20), liveMat);
      const soon = new THREE.Mesh(archGeo(cp.radius * 0.92, 0.14), nextMat);
      live.visible = false;
      soon.visible = false;
      group.add(live, soon);
      this.root.add(group);
      this.gates.push({ group, live, soon, s: cp.s });
    }

    this.arrow = makeArrow();
    this.root.add(this.arrow);
    this.current = 0;
    this._clock = 0;
  }

  /**
   * @param {{ x:number, y:number, z:number }} playerWorld absolute highway space
   * @param {number} currentIndex
   */
  update(playerWorld, currentIndex) {
    const cps = this.route.checkpoints;
    if (!cps.length) return;
    const n = cps.length;
    const cur = ((currentIndex % n) + n) % n;
    const nxt = cur < n - 1 ? cur + 1 : -1;
    this.current = cur;

    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      g.live.visible = i === cur;
      g.soon.visible = i === nxt;
    }

    const cp = cps[cur];
    const gf = this.highway.at(cp.s);
    this._clock += 0.016;
    const hover = Math.sin(this._clock * 4.0) * 0.06;
    this.arrow.position.set(playerWorld.x, playerWorld.y + 2.5 + hover, playerWorld.z);
    const dx = gf.x - playerWorld.x;
    const dz = gf.z - playerWorld.z;
    this.arrow.rotation.set(0.18, Math.atan2(dx, dz), 0, 'YXZ');
    this.arrow.visible = true;
  }

  dispose() {
    this.parent.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.gates.length = 0;
    this.arrow = null;
  }
}
