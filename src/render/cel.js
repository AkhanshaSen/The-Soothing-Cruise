/**
 * OpenCity-style cel shading: warm/cool RGB toon ramp + luminance posterization.
 * Ported from https://github.com/Basharkhan7776/opencity (ISC).
 */
import * as THREE from 'three';

export function toonRamp(
  bands = [
    [0.34, 0x8085a1],
    [0.58, 0xa189a6],
    [0.72, 0xc08a6d],
    [1.0, 0xfff0cf],
  ],
  width = 64,
) {
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const t = (i + 0.5) / width;
    const band = bands.find((b) => t <= b[0]) || bands[bands.length - 1];
    const h = band[1];
    data[i * 4] = (h >> 16) & 255;
    data[i * 4 + 1] = (h >> 8) & 255;
    data[i * 4 + 2] = h & 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

let _shared = null;
export function sharedRamp() {
  if (!_shared) _shared = toonRamp();
  return _shared;
}

const LADDER_STEPS = 7;
const SHADOW_WINDOW = [0.42, 0.58];
const SHADOW_FLOOR = 0.1;

const _posterizeUniform = { value: 1 };
export function setPosterize(on) {
  _posterizeUniform.value = on ? 1 : 0;
}

const POSTERIZE = /* glsl */ `
{
 vec3 celC = gl_FragColor.rgb;
 float celY = dot(celC, vec3(0.2126, 0.7152, 0.0722));
 if (celY > 1e-5 && uCelPosterize > 0.5) {
   float celV = pow(celY, 1.0 / 3.0);
   float celQ = floor(celV * ${LADDER_STEPS}.0 + 0.5) / ${LADDER_STEPS}.0;
   float celS = pow(celQ, 3.0) / celY;
   float celM = max(celC.r, max(celC.g, celC.b));
   gl_FragColor.rgb = celC * min(celS, 1.0 / max(celM, 1e-4));
 }
}`;

const _shadowFloorUniform = { value: SHADOW_FLOOR };
export function setShadowFloor(v) {
  _shadowFloorUniform.value = v;
}

export function celMaterial(params = {}) {
  const { posterize = true, ...rest } = params;
  const mat = new THREE.MeshToonMaterial({ gradientMap: sharedRamp(), flatShading: true, ...rest });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      /return vec3\( texture2D\( gradientMap, coord \)\.r \);/,
      'return texture2D( gradientMap, coord ).rgb;',
    );
    shader.uniforms.uCelShadowFloor = _shadowFloorUniform;
    shader.fragmentShader =
      'uniform float uCelShadowFloor;\n' +
      shader.fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        THREE.ShaderChunk.shadowmap_pars_fragment.replace(
          'return mix( 1.0, shadow, shadowIntensity );',
          `return mix( 1.0, max( smoothstep( ${SHADOW_WINDOW[0].toFixed(2)}, ${SHADOW_WINDOW[1].toFixed(2)}, shadow ), uCelShadowFloor ), shadowIntensity );`,
        ),
      );
    if (posterize) {
      shader.uniforms.uCelPosterize = _posterizeUniform;
      shader.fragmentShader =
        'uniform float uCelPosterize;\n' +
        shader.fragmentShader.replace('#include <fog_fragment>', '#include <fog_fragment>\n' + POSTERIZE);
    }
  };
  mat.customProgramCacheKey = () => (posterize ? 'cel-tinted-ramp-q' : 'cel-tinted-ramp');
  return mat;
}

export function unlitCelMaterial(params = {}) {
  const { posterize = false, flatShading, ...rest } = params;
  const mat = celMaterial({ ...rest, posterize });
  if (flatShading !== undefined) mat.flatShading = flatShading;
  const compileCel = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    compileCel(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight = diffuseColor.rgb;\n#include <opaque_fragment>',
    );
  };
  mat.customProgramCacheKey = () => 'cel-tinted-ramp-unlit';
  return mat;
}

/** Lit cel-shaded toon material (OpenCity-style bands). */
export function cel(color, opts = {}) {
  if (opts.unlit) return flat(color, opts);
  return celMaterial({
    color,
    side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

/** Unlit solid material — always visible (use double:true for chase-cam subjects). */
export function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

/** Unlit cel for sky, water, lane marks. */
export function flat(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

/** Ink outline — parented to each mesh so it follows movement. */
export function inkOutline(group, color = 0x160c12, scale = 1.035) {
  const shells = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || !o.geometry) return;
    const shell = new THREE.Mesh(
      o.geometry,
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }),
    );
    shell.userData.isOutline = true;
    shell.scale.setScalar(scale);
    shell.renderOrder = (o.renderOrder || 0) - 1;
    o.add(shell);
    shells.push(shell);
  });
  return shells;
}
