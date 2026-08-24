import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!renderer.getContext()) {
    throw new Error('WebGL failed to initialize.');
  }
  renderer.setClearColor(0x8cc8e8, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  fit(renderer, canvas);
  return renderer;
}

export function fit(renderer, canvas, camera) {
  const w = Math.max(1, canvas.clientWidth | 0);
  const h = Math.max(1, canvas.clientHeight | 0);
  renderer.setSize(w, h, false);
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export function resize(renderer, camera, canvas) {
  fit(renderer, canvas, camera);
}
