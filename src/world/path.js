import { fbm1 } from '../core/rng.js';
import { lerp, wrapPi } from '../core/util.js';
import { biomeIndexAt } from './biomes.js';

export const STEP = 10;
export const ROAD_SURFACE = 0.09;

export class Highway {
  constructor(seed = 7) {
    this.seed = seed;
    this.points = [{ s: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0 }];
  }

  generateUntil(sTarget) {
    let p = this.points[this.points.length - 1];
    while (p.s < sTarget) {
      const s = p.s + STEP;
      const bend =
        0.014 * fbm1(this.seed, s * 0.001) +
        0.005 * Math.sin(s * 0.00055);
      const heading = p.heading + bend * STEP;
      const y = 2.2 * fbm1(this.seed + 11, s * 0.00032) + 1.2 * Math.sin(s * 0.0012);
      const x = p.x + Math.cos(heading) * STEP;
      const z = p.z + Math.sin(heading) * STEP;
      const pitch = Math.atan2(y - p.y, STEP);
      p = { s, x, y, z, heading, pitch, biome: biomeIndexAt(s) };
      this.points.push(p);
    }
  }

  at(s) {
    this.generateUntil(s + STEP * 4);
    const i = Math.max(0, Math.min(this.points.length - 2, Math.floor(s / STEP)));
    const a = this.points[i];
    const b = this.points[i + 1];
    const t = (s - a.s) / STEP;
    const heading = a.heading + wrapPi(b.heading - a.heading) * t;
    return {
      s,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      heading,
      pitch: lerp(a.pitch, b.pitch, t),
      tx: Math.cos(heading),
      tz: Math.sin(heading),
      nx: -Math.sin(heading),
      nz: Math.cos(heading),
    };
  }

  heightAt(x, z, sHint = 0) {
    const f = this.nearest(x, z, sHint);
    const dx = x - f.x;
    const dz = z - f.z;
    const lateral = dx * f.nx + dz * f.nz;
    const along = dx * f.tx + dz * f.tz;
    const road = Math.abs(lateral) < 6.2;
    let y = f.y + ROAD_SURFACE + along * Math.tan(Math.max(-0.35, Math.min(0.35, f.pitch)));
    if (!road) {
      if (lateral > 0) y += 0.05;
      else y -= 0.15;
    }
    return { y, lateral, onRoad: road, frame: f };
  }

  nearest(x, z, sHint = 0) {
    this.generateUntil(sHint + 400);
    let best = this.at(Math.max(0, sHint));
    let bestD = dist2(best, x, z);
    for (let ds = -180; ds <= 220; ds += STEP) {
      const f = this.at(Math.max(0, sHint + ds));
      const d = dist2(f, x, z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }
}

function dist2(f, x, z) {
  const dx = f.x - x;
  const dz = f.z - z;
  return dx * dx + dz * dz;
}
