/** Procedural curved coastal highway — smooth distance `s` path. */
const STEP = 4;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash(seed, i) {
  let n = (i | 0) * 374761393 + seed * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return n >>> 0;
}

function noise1(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(seed, i);
  const b = hash(seed, i + 1);
  const ga = (a & 1 ? -1 : 1) * f;
  const gb = (b & 1 ? -1 : 1) * (f - 1);
  return ga + (gb - ga) * fade(f);
}

function fbm1(seed, x) {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < 5; i++) {
    v += a * noise1(seed + i * 19, x * f);
    n += a;
    a *= 0.5;
    f *= 2.05;
  }
  return v / n;
}

export const ROAD_SURFACE = 0.09;

export class Highway {
  constructor(seed = 11) {
    this.seed = seed;
    this.points = [{ s: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0, bend: 0 }];
  }

  generateUntil(sTarget) {
    let p = this.points[this.points.length - 1];
    while (p.s < sTarget) {
      const s = p.s + STEP;
      // Very long, gentle curves — stable at 150 km/h, no twitchy fbm.
      const bend =
        0.0036 * Math.sin(s * 0.0055) +
        0.0020 * Math.sin(s * 0.0024 + 1.15);
      const heading = p.heading + bend * STEP;
      // Flat coastal cruise — elevation/pitch caused recenter bob and jerky ride.
      const y = 0;
      const x = p.x + Math.cos(heading) * STEP;
      const z = p.z + Math.sin(heading) * STEP;
      const pitch = 0;
      p = { s, x, y, z, heading, pitch, bend };
      this.points.push(p);
    }
  }

  at(s) {
    this.generateUntil(s + STEP * 6);
    const i = Math.max(0, Math.min(this.points.length - 2, Math.floor(s / STEP)));
    const a = this.points[i];
    const b = this.points[i + 1];
    const t = (s - a.s) / STEP;
    const te = t * t * (3 - 2 * t);
    const heading = a.heading + wrapPi(b.heading - a.heading) * te;
    return {
      s,
      x: lerp(a.x, b.x, te),
      y: lerp(a.y, b.y, te),
      z: lerp(a.z, b.z, te),
      heading,
      pitch: lerp(a.pitch, b.pitch, te),
      bend: lerp(a.bend ?? 0, b.bend ?? 0, te),
      tx: Math.cos(heading),
      tz: Math.sin(heading),
      nx: -Math.sin(heading),
      nz: Math.cos(heading),
    };
  }

  /** Closest point on the highway centreline — keeps the car glued to the ribbon. */
  project(x, z, sHint = 0) {
    this.generateUntil(sHint + 240);
    let bestS = Math.max(0, sHint);
    let bestD = Infinity;

    for (let s = Math.max(0, sHint - 120); s <= sHint + 120; s += 2) {
      const f = this.at(s);
      const dx = x - f.x;
      const dz = z - f.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        bestS = s;
      }
    }

    for (let s = bestS - 4; s <= bestS + 4; s += 0.25) {
      const ss = Math.max(0, s);
      const f = this.at(ss);
      const dx = x - f.x;
      const dz = z - f.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        bestS = ss;
      }
    }

    const f = this.at(bestS);
    const dx = x - f.x;
    const dz = z - f.z;
    const lateral = dx * f.nx + dz * f.nz;
    const along = dx * f.tx + dz * f.tz;
    const sOut = Math.max(0, bestS + along);
    return { s: sOut, lateral, frame: this.at(sOut) };
  }
}
