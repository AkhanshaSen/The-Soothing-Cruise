import * as THREE from 'three';
import { basic, flat } from '../render/cel.js';
import { loadKenney, celShadeModel, fitModel, releaseCarInstance } from '../core/assets.js';

/** Build player or AI car — Kenney GLB when available, procedural fallback. */
export async function buildCar(spec, opts = {}) {
  if (spec.model) {
    try {
      return await buildKenneyCar(spec, opts);
    } catch (err) {
      console.warn(`Kenney model failed (${spec.model}), using procedural fallback`, err);
    }
  }
  return buildProceduralCar(spec, opts);
}

async function buildKenneyCar(spec, opts) {
  const body = await loadKenney(spec.model);
  const root = new THREE.Group();
  body.rotation.y = spec.modelYaw ?? Math.PI / 2;
  root.add(body);
  celShadeModel(root, { tint: spec.color, unlit: true });
  const fit = fitModel(root, spec.modelLength ?? 4.2);
  fit.ride = 0.04;
  if (opts.player) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 12),
      flat(0x000000, { transparent: true, opacity: 0.42 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    root.add(shadow);
  }
  root.userData = {
    wheels: fit.wheels,
    dims: { ride: fit.ride ?? 0.02, wheel: 0.34, l: fit.length * fit.scale },
    spec,
    kenney: true,
  };
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

export function buildProceduralCar(spec, opts = {}) {
  const g = new THREE.Group();
  const paint = basic(spec.color);
  const dark = basic(spec.accent);
  const glass = basic(0x7ec8e8, { transparent: true, opacity: 0.72 });
  const rubber = basic(0x141418);
  const chrome = basic(0xf0f0f0);

  const dims = dimsFor(spec.body);
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.l), paint);
  body.position.y = dims.ride + dims.h * 0.5;
  g.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(dims.w * 0.84, dims.cabin, dims.cabinL),
    spec.body === 'convertible' ? paint : glass,
  );
  cabin.position.set(0, dims.ride + dims.h + dims.cabin * 0.35, dims.cabinZ);
  g.add(cabin);

  if (spec.body === 'wagon' || spec.body === 'van' || spec.body === 'suv') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(dims.w * 0.86, 0.14, dims.l * 0.64), dark);
    roof.position.set(0, dims.ride + dims.h + dims.cabin * 0.82, -0.12);
    g.add(roof);
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(dims.wheel, dims.wheel, 0.32, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [dims.w * 0.52, dims.l * 0.34],
    [-dims.w * 0.52, dims.l * 0.34],
    [dims.w * 0.52, -dims.l * 0.34],
    [-dims.w * 0.52, -dims.l * 0.34],
  ]) {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.position.set(x, dims.wheel, z);
    g.add(w);
    wheels.push(w);
  }

  if (opts.player) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 12),
      flat(0x000000, { transparent: true, opacity: 0.42 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    g.add(shadow);
  }

  g.userData = { wheels, dims, spec, kenney: false };
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function releaseCar(mesh) {
  releaseCarInstance(mesh);
}

function dimsFor(body) {
  if (body === 'coupe') return { w: 1.7, h: 0.48, l: 4.1, cabin: 0.42, cabinL: 1.5, cabinZ: -0.05, ride: 0.18, wheel: 0.34 };
  if (body === 'wagon') return { w: 1.78, h: 0.58, l: 4.5, cabin: 0.55, cabinL: 2.1, cabinZ: -0.15, ride: 0.2, wheel: 0.36 };
  if (body === 'van') return { w: 1.9, h: 0.9, l: 4.7, cabin: 0.7, cabinL: 2.4, cabinZ: 0.05, ride: 0.28, wheel: 0.38 };
  if (body === 'suv') return { w: 1.86, h: 0.72, l: 4.35, cabin: 0.58, cabinL: 1.9, cabinZ: -0.08, ride: 0.34, wheel: 0.4 };
  if (body === 'convertible') return { w: 1.68, h: 0.42, l: 4.05, cabin: 0.22, cabinL: 1.4, cabinZ: 0.1, ride: 0.2, wheel: 0.33 };
  return { w: 1.68, h: 0.55, l: 3.85, cabin: 0.48, cabinL: 1.55, cabinZ: -0.05, ride: 0.2, wheel: 0.33 };
}
