export const BIOMES = [
  {
    id: 'coast',
    name: 'Golden Coast',
    grass: 0x5cb050,
    grassDark: 0x4a9a42,
    sand: 0xe8c96a,
    sandDark: 0xc8a030,
    tree: 0x3d7f36,
    treeDark: 0x2f6b32,
    trunk: 0x6a4830,
    rock: 0xd0c0a0,
    water: 0x2a6e9a,
    waterDeep: 0x2878a8,
    road: 0x3a3a40,
    sky: 0x8cc8e8,
    fog: 0x8cc8e8,
    city: 0xd8e8f8,
    cityAccent: 0x88b8d8,
    mountain: 0x68a858,
    snow: 0xf0f8ff,
  },
  {
    id: 'pine',
    name: 'Pine Hollow',
    grass: 0x58a848,
    grassDark: 0x387828,
    sand: 0xc8b878,
    sandDark: 0xa89858,
    tree: 0x286838,
    treeDark: 0x184828,
    trunk: 0x4a3828,
    rock: 0x8a9088,
    water: 0x488898,
    waterDeep: 0x386878,
    road: 0x1a1a22,
    fog: 0xb8d0c8,
    sky: 0x98c8d8,
    city: 0xc8d8e0,
    cityAccent: 0x78a8b8,
    mountain: 0x488848,
    snow: 0xe8f0f0,
  },
  {
    id: 'cherry',
    name: 'Cherry Vale',
    grass: 0x98d068,
    grassDark: 0x68a048,
    sand: 0xf0d8a8,
    sandDark: 0xd8b878,
    tree: 0xe898b0,
    treeDark: 0xc87898,
    trunk: 0x6a4838,
    rock: 0xd8c8b8,
    water: 0x68b8d0,
    waterDeep: 0x4898b0,
    road: 0x1a1a22,
    fog: 0xf0d8e0,
    sky: 0xa8d0f0,
    city: 0xf0e0e8,
    cityAccent: 0xd8a8c0,
    mountain: 0x88b868,
    snow: 0xfff0f8,
  },
  {
    id: 'meadow',
    name: 'High Meadow',
    grass: 0xc8d858,
    grassDark: 0x98a838,
    sand: 0xe8d078,
    sandDark: 0xc8b058,
    tree: 0x68a838,
    treeDark: 0x488820,
    trunk: 0x5a4028,
    rock: 0xc8b888,
    water: 0x58a8b8,
    waterDeep: 0x388898,
    road: 0x1a1a22,
    fog: 0xe8e8c0,
    sky: 0x98c8f0,
    city: 0xe8e8d0,
    cityAccent: 0xa8c878,
    mountain: 0x98b848,
    snow: 0xf8f8e8,
  },
  {
    id: 'desert',
    name: 'Moon Desert',
    grass: 0xd8b868,
    grassDark: 0xb89848,
    sand: 0xf0d088,
    sandDark: 0xd0b068,
    tree: 0x988848,
    treeDark: 0x786830,
    trunk: 0x5a4028,
    rock: 0xd8c098,
    water: 0x4888a8,
    waterDeep: 0x386888,
    road: 0x1a1a22,
    fog: 0xf0d8b0,
    sky: 0xf0c898,
    city: 0xf0e8d0,
    cityAccent: 0xd8a878,
    mountain: 0xc8a858,
    snow: 0xfff8e8,
  },
  {
    id: 'lake',
    name: 'Lake Mirror',
    grass: 0x68a858,
    grassDark: 0x488838,
    sand: 0xd8c898,
    sandDark: 0xb8a878,
    tree: 0x387848,
    treeDark: 0x285830,
    trunk: 0x4a3828,
    rock: 0xa8a898,
    water: 0x3898b8,
    waterDeep: 0x287898,
    road: 0x1a1a22,
    fog: 0xc8dce8,
    sky: 0x90c8e8,
    city: 0xd8e8f0,
    cityAccent: 0x88b0c8,
    mountain: 0x589848,
    snow: 0xf0f8ff,
  },
  {
    id: 'aurora',
    name: 'Aurora Pass',
    grass: 0xd0e0e8,
    grassDark: 0xa0b8c8,
    sand: 0xe8e0d0,
    sandDark: 0xc8c0b0,
    tree: 0x386868,
    treeDark: 0x284848,
    trunk: 0x3a3838,
    rock: 0xc8d0d8,
    water: 0x68a8c8,
    waterDeep: 0x4888a8,
    road: 0x1a1a22,
    fog: 0xd0e0f0,
    sky: 0x6888a8,
    city: 0xe0e8f0,
    cityAccent: 0x88c8d8,
    mountain: 0x688898,
    snow: 0xf0f8ff,
  },
  {
    id: 'lavender',
    name: 'Lavender Dusk',
    grass: 0x9888c0,
    grassDark: 0x7868a0,
    sand: 0xd8c0a0,
    sandDark: 0xb8a080,
    tree: 0x8868a8,
    treeDark: 0x684888,
    trunk: 0x5a4038,
    rock: 0xc0b0a0,
    water: 0x6888b8,
    waterDeep: 0x486898,
    road: 0x1a1a22,
    fog: 0xe0d0e8,
    sky: 0xc8a8d8,
    city: 0xe8d8f0,
    cityAccent: 0xb898c8,
    mountain: 0x8878a8,
    snow: 0xf8f0ff,
  },
];

const SPAN = 1400;
const BLEND = 160;

export function biomeIndexAt(s) {
  return Math.floor(s / SPAN) % BIOMES.length;
}

export function biomeBlendAt(s) {
  const i = biomeIndexAt(s);
  const local = s - Math.floor(s / SPAN) * SPAN;
  const next = (i + 1) % BIOMES.length;
  const t = local > SPAN - BLEND ? (local - (SPAN - BLEND)) / BLEND : 0;
  return { a: BIOMES[i], b: BIOMES[next], t };
}

export function lerpHex(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

export function paletteAt(s) {
  const { a, b, t } = biomeBlendAt(s);
  const mix = (k) => lerpHex(a[k], b[k], t);
  return {
    name: t > 0.35 ? `${a.name} → ${b.name}` : a.name,
    grass: mix('grass'),
    grassDark: mix('grassDark'),
    sand: mix('sand'),
    sandDark: mix('sandDark'),
    tree: mix('tree'),
    treeDark: mix('treeDark'),
    trunk: mix('trunk'),
    rock: mix('rock'),
    water: mix('water'),
    waterDeep: mix('waterDeep'),
    road: mix('road'),
    fog: mix('fog'),
    sky: mix('sky'),
    city: mix('city'),
    cityAccent: mix('cityAccent'),
    mountain: mix('mountain'),
    snow: mix('snow'),
    from: a,
    to: b,
    t,
  };
}
