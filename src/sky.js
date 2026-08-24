import * as THREE from 'three';

function smooth(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function lerpColor(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

/** Day / night / sunset sky driven by settings. */
export class SkySystem {
  constructor(scene, sun, hemi, ambient) {
    this.scene = scene;
    this.sun = sun;
    this.hemi = hemi;
    this.ambient = ambient;
    this.hours = 14;
    /** @type {'dynamic' | 'day' | 'sunset' | 'night' | 'dawn'} */
    this.mode = 'dynamic';
    this.cycleMinutes = 4;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'day') this.hours = 14;
    if (mode === 'sunset') this.hours = 18.5;
    if (mode === 'night') this.hours = 22;
    if (mode === 'dawn') this.hours = 6.2;
  }

  setCycleMinutes(m) {
    this.cycleMinutes = Math.max(0.5, m);
  }

  update(dt, camPos) {
    if (this.mode === 'dynamic') {
      const speed = 24 / (this.cycleMinutes * 60);
      this.hours = (this.hours + dt * speed) % 24;
    }

    const ang = ((this.hours - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = smooth(elev, 0.05, 0.45);
    const night = 1 - smooth(elev, -0.05, 0.3);
    const sunset = smooth(elev, 0.08, 0.38) * (1 - smooth(elev, 0.32, 0.55));

    const skyDay = 0x8cc8e8;
    const skySunset = 0xc88868;
    const skyNight = 0x182840;
    const fogDay = 0x8cc8e8;
    const fogSunset = 0xc08068;
    const fogNight = 0x1a2840;

    let sky = lerpColor(skyNight, skyDay, day);
    let fog = lerpColor(fogNight, fogDay, day);
    if (sunset > 0.08) {
      sky = lerpColor(sky, skySunset, sunset * 0.85);
      fog = lerpColor(fog, fogSunset, sunset * 0.85);
    }

    this.scene.background.setHex(sky);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(fog);
      this.scene.fog.near = 45 + night * 25 + day * 35;
      this.scene.far = 120 + day * 70 + (1 - night) * 40;
    }

    const sunWarm = 0xffe6bd;
    const sunSet = 0xffa860;
    const sunCool = 0x8090c0;
    let sunColor = lerpColor(sunCool, sunWarm, day);
    if (sunset > 0.1) sunColor = lerpColor(sunColor, sunSet, sunset);

    const sunInt = 0.15 + day * 1.15 + sunset * 0.55;
    this.sun.color.setHex(sunColor);
    this.sun.intensity = sunInt;

    this.hemi.color.setHex(lerpColor(0x3a4560, 0xa9d2ff, day));
    this.hemi.groundColor.setHex(lerpColor(0x1c1820, 0x3d5058, day));
    this.hemi.intensity = 0.18 + day * 0.37 + sunset * 0.15;

    // Keep night darker so warm street-lamp pools read clearly.
    this.ambient.color.setHex(lerpColor(0xffe0c0, 0xffffff, day));
    this.ambient.intensity = 0.05 + day * 0.25 + night * 0.04 + sunset * 0.06;

    if (camPos) {
      const sx = Math.cos(ang) * 80;
      const sy = 30 + Math.max(0.15, elev) * 55;
      const sz = Math.sin(ang) * 60;
      this.sun.position.set(camPos.x + sx, camPos.y + sy, camPos.z + sz);
      this.sun.target.position.set(camPos.x, camPos.y, camPos.z);
      this.sun.target.updateMatrixWorld();
    }

    return { day, night, sunset, hours: this.hours };
  }
}
