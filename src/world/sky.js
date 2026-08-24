import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.bg = new THREE.Color(0x8cc8e8);
    scene.background = this.bg;
    scene.fog = new THREE.Fog(0x8cc8e8, 120, 450);

    this.sun = new THREE.DirectionalLight(0xffe6bd, 2.5);
    this.sun.position.set(-150, 125, 165);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 220;
    const s = 70;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.085;
    scene.add(this.sun);

    this.fillA = new THREE.DirectionalLight(0x93a9e6, 0.45);
    this.fillA.position.set(150, 56, -165);
    scene.add(this.fillA);

    this.fillB = new THREE.DirectionalLight(0x8fb0cf, 0.26);
    this.fillB.position.set(-165, 74, -150);
    scene.add(this.fillB);

    this.hemi = new THREE.HemisphereLight(0xa9d2ff, 0x3d5058, 0.5);
    scene.add(this.hemi);
  }

  update(clock, pal, mode, camPos) {
    const cycle = clockToCycle(clock, mode);
    const dusk = mode === 'title' || mode === 'sunset' || cycle.sunset > 0.45;

    if (dusk) {
      this.bg.setHex(0xc8a888);
      this.scene.fog.color.setHex(0xc8a080);
      this.scene.fog.near = 280;
      this.scene.fog.far = 480;
      this.sun.color.setHex(0xffd8a0);
      this.sun.intensity = 1.4;
      this.hemi.intensity = 0.5;
    } else {
      this.bg.setHex(pal.sky);
      this.scene.fog.color.setHex(pal.fog);
      this.scene.fog.near = 120;
      this.scene.fog.far = 450;
      this.sun.color.setHex(0xffe6bd);
      this.sun.intensity = 2.5;
      this.hemi.intensity = 0.5;
    }

    this.scene.background = this.bg;

    if (camPos) {
      this.sun.position.set(camPos.x - 150, camPos.y + 125, camPos.z + 165);
      this.sun.target.position.set(camPos.x, camPos.y, camPos.z);
      if (!this.sun.target.parent) this.scene.add(this.sun.target);
      this.sun.target.updateMatrixWorld();
    } else {
      this.sun.position.set(-150, 125, 165);
    }

    return { ...cycle, dusk };
  }
}

export function clockToCycle(hours, mode) {
  let h = hours;
  if (mode === 'day' || mode === 'title') h = 14;
  if (mode === 'sunset') h = 18.4;
  if (mode === 'night') h = 22.5;
  if (mode === 'dawn') h = 5.8;
  const ang = ((h - 6) / 24) * Math.PI * 2;
  const sunDir = new THREE.Vector3(
    Math.cos(ang),
    Math.max(0.2, Math.sin(ang) * 0.75 + 0.25),
    Math.sin(ang * 0.55) * 0.35,
  ).normalize();
  const elev = sunDir.y;
  const day = smooth(elev, 0.1, 0.45);
  const night = 1 - smooth(elev, 0.12, 0.35);
  const sunset = smooth(elev, 0.15, 0.35) * (1 - smooth(elev, 0.35, 0.55));
  return { hours: h, sunDir, day, night, sunset, elev };
}

function smooth(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function advanceClock(hours, dt, mode, cycleMinutes) {
  if (mode !== 'dynamic') return hours;
  const speed = 24 / Math.max(0.5, cycleMinutes);
  return (hours + dt * speed) % 24;
}
