import { buildChunk } from './chunks.js';
import { paletteAt } from './biomes.js';

const CHUNK = 90;
const AHEAD = 9;
const BEHIND = 2;

export class World {
  constructor(parent, highway, seed) {
    this.parent = parent;
    this.highway = highway;
    this.seed = seed;
    this.chunks = new Map();
    this.fog = null;
  }

  sync(s) {
    const i0 = Math.max(0, Math.floor(s / CHUNK) - BEHIND);
    const i1 = Math.floor(s / CHUNK) + AHEAD;
    const keep = new Set();
    for (let i = i0; i <= i1; i++) {
      keep.add(i);
      if (!this.chunks.has(i)) {
        const g = buildChunk(this.highway, i * CHUNK, CHUNK, this.seed);
        this.parent.add(g);
        this.chunks.set(i, g);
      }
    }
    for (const [i, g] of this.chunks) {
      if (!keep.has(i)) {
        this.parent.remove(g);
        g.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
            else o.material.dispose();
          }
        });
        this.chunks.delete(i);
      }
    }
  }

  palette(s) {
    return paletteAt(s);
  }
}
