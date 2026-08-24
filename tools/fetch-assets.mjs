#!/usr/bin/env node
/**
 * Download Kenney CC0 asset packs into ./assets/
 * Run once: npm run assets
 */
import { mkdir, copyFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PACKS = [
  {
    name: 'car-kit',
    url: 'https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip',
    files: [
      'Models/GLB format/hatchback-sports.glb',
      'Models/GLB format/sedan.glb',
      'Models/GLB format/sedan-sports.glb',
      'Models/GLB format/race.glb',
      'Models/GLB format/van.glb',
      'Models/GLB format/suv.glb',
      'Models/GLB format/wheel-default.glb',
      'Models/FBX format/Textures/colormap.png',
      'Models/GLB format/Textures/colormap.png',
      'License.txt',
    ],
    dest: 'assets/vehicles',
  },
  {
    name: 'nature-kit',
    url: 'https://kenney.nl/media/pages/assets/nature-kit/9b505faf50-1677580952/kenney_nature-kit.zip',
    files: [
      'Models/GLB format/tree-default.glb',
      'Models/GLB format/tree-pine.glb',
      'Models/GLB format/tree-pineSmall.glb',
      'Models/GLB format/rock-large.glb',
      'Models/GLB format/rock-small.glb',
      'License.txt',
    ],
    dest: 'assets/nature',
  },
  {
    name: 'city-kit-commercial',
    url: 'https://kenney.nl/media/pages/assets/city-kit-commercial/9b505faf50-1677580952/kenney_city-kit-commercial.zip',
    files: [
      'Models/GLB format/building-a.glb',
      'Models/GLB format/building-b.glb',
      'Models/GLB format/building-c.glb',
      'Models/GLB format/building-d.glb',
      'Models/GLB format/building-e.glb',
      'Models/GLB format/building-f.glb',
      'License.txt',
    ],
    dest: 'assets/city',
  },
];

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function extract(zip, files, destDir) {
  await mkdir(destDir, { recursive: true });
  for (const file of files) {
    execFileSync('unzip', ['-j', '-o', zip, file, '-d', destDir], { stdio: 'pipe' });
    const base = path.basename(file);
    if (base === 'License.txt') {
      try {
        execFileSync('cp', [path.join(destDir, 'License.txt'), path.join(destDir, 'LICENSE-kenney.txt')], {
          stdio: 'ignore',
        });
      } catch {
        /* ignore */
      }
    }
  }
}

for (const pack of PACKS) {
  const zip = path.join(root, `.tmp-${pack.name}.zip`);
  const dest = path.join(root, pack.dest);
  console.log(`\n→ ${pack.name}`);
  try {
    await download(pack.url, zip);
    await extract(zip, pack.files, dest);
    if (pack.name === 'car-kit') {
      const texDir = path.join(dest, 'Textures');
      await mkdir(texDir, { recursive: true });
      await copyFile(path.join(dest, 'colormap.png'), path.join(texDir, 'colormap.png'));
    }
    console.log(`  ✓ ${dest}`);
  } catch (err) {
    console.warn(`  ✗ ${pack.name}: ${err.message}`);
  }
}

console.log('\nDone. Kenney assets are CC0 — see assets/*/LICENSE-kenney.txt');
