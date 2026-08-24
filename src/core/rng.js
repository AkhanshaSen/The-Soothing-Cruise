export class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }

  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  signed() {
    return this.next() * 2 - 1;
  }

  range(a, b) {
    return a + this.next() * (b - a);
  }

  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function grad(hash, x) {
  return (hash & 1 ? -1 : 1) * x;
}

export function noise1(seed, x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(seed, i);
  const b = hash(seed, i + 1);
  return lerpGrad(a, b, fade(f), f);
}

function hash(seed, i) {
  let n = (i | 0) * 374761393 + seed * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return n >>> 0;
}

function lerpGrad(ha, hb, u, f) {
  const ga = grad(ha, f);
  const gb = grad(hb, f - 1);
  return ga + (gb - ga) * u;
}

export function fbm1(seed, x, octaves = 4) {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise1(seed + i * 19, x * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return v / n;
}

/** 2D value noise — ported from OpenCity src/core/rng.js */
export function noise2(seed = 1) {
  const r = new Rng(seed);
  const N = 256;
  const tab = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) tab[i] = r.next();
  const at = (x, y) => tab[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
}

/** OpenCity-style 1D table noise (used by buildRoad colour fields). */
export function tableNoise1(seed = 1) {
  const r = new Rng(seed);
  const tab = new Float32Array(512);
  for (let i = 0; i < 512; i++) tab[i] = r.next() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    const a = tab[((i % 512) + 512) % 512];
    const b = tab[(((i + 1) % 512) + 512) % 512];
    return a + (b - a) * s;
  };
}
