#!/usr/bin/env node
/**
 * Download curated Kenney GLBs from the OpenCity repo (CC0 / ISC game).
 * Source: https://github.com/Basharkhan7776/opencity
 * Run: npm run assets:opencity
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/Basharkhan7776/opencity/main';

/** Paths mirror OpenCity's assets/ layout. */
const FILES = [
  // Vegetation — roadside trees & bushes
  'assets/vegetation/tree_1.glb',
  'assets/vegetation/tree_2.glb',
  'assets/vegetation/tree_3.glb',
  'assets/vegetation/tree_pine_1.glb',
  'assets/vegetation/tree_pine_2.glb',
  'assets/vegetation/bush_1.glb',
  'assets/vegetation/bush_2.glb',
  // Forest — rocks along coast / mountains
  'assets/forest/rocks-low.glb',
  'assets/forest/stones.glb',
  // City skyline (commercial kit)
  'assets/city/building-a.glb',
  'assets/city/building-b.glb',
  'assets/city/building-c.glb',
  'assets/city/building-d.glb',
  'assets/city/building-e.glb',
  'assets/city/building-f.glb',
  'assets/city/Textures/colormap.png',
  // Residential houses
  'assets/house/building-type-a.glb',
  'assets/house/building-type-b.glb',
  'assets/house/building-type-c.glb',
  'assets/house/building-type-d.glb',
  // Road props
  'assets/road/light-square.glb',
  'assets/road/sign-highway.glb',
];

/** Kenney packs share one colormap; house/forest/road GLBs expect it beside the models. */
const COLORMAP_COPIES = [
  'assets/house/Textures/colormap.png',
  'assets/forest/Textures/colormap.png',
  'assets/road/Textures/colormap.png',
];

async function download(rel) {
  const url = `${BASE}/${rel}`;
  const dest = path.join(root, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
  return dest;
}

console.log('Fetching OpenCity Kenney assets (CC0)…\n');
let ok = 0;
let fail = 0;
for (const rel of FILES) {
  try {
    const dest = await download(rel);
    console.log(`  ✓ ${path.relative(root, dest)}`);
    ok++;
  } catch (err) {
    console.warn(`  ✗ ${rel}: ${err.message}`);
    fail++;
  }
}

const { copyFile } = await import('node:fs/promises');
const srcTex = path.join(root, 'assets/city/Textures/colormap.png');
for (const rel of COLORMAP_COPIES) {
  try {
    const dest = path.join(root, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(srcTex, dest);
    console.log(`  ✓ ${rel} (shared colormap)`);
    ok++;
  } catch (err) {
    console.warn(`  ✗ ${rel}: ${err.message}`);
    fail++;
  }
}

const license = `OpenCity asset mirror
Source: https://github.com/Basharkhan7776/opencity (ISC)
3D models: Kenney.nl (CC0 1.0 Public Domain)
See assets/LICENSE-kenney.txt and https://kenney.nl
`;
await writeFile(path.join(root, 'assets/LICENSE-opencity.txt'), license);

console.log(`\nDone: ${ok} ok, ${fail} failed`);
console.log('License: assets/LICENSE-opencity.txt');
