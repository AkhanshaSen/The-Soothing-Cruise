/**
 * Animated coastal water — vertex/fragment shaders adapted from OpenCity
 * src/flat/OceanWaves.js (island radial shore → UV-based shore strip).
 */
import * as THREE from 'three';

let sharedMat = null;
let time = 0;

const VERT = `
uniform float uTime;
varying vec3 vNormal;
varying float vWaveHeight;
varying float vDepth;
varying vec2 vXZ;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec3 pos = position;
  vXZ = pos.xz;
  vDepth = uv.x;

  float shoreDist = (1.0 - uv.x) * 130.0;
  float w1 = sin(dot(pos.xz, vec2(0.035, 0.022)) - uTime * 1.7) * 0.22;
  float w2 = sin(dot(pos.xz, vec2(-0.018, 0.034)) - uTime * 2.1) * 0.14;
  float w3 = sin(dot(pos.xz, vec2(0.042, -0.012)) + uTime * 1.3) * 0.08;
  float oceanSwell = w1 + w2 + w3;

  float waveSpeed = 2.5;
  float shorePhase = shoreDist * 0.13 - uTime * waveSpeed + snoise(pos.xz * 0.015) * 1.4;
  float shoreCrest = pow(max(0.0, sin(shorePhase) * 0.5 + 0.5), 1.9);
  float beachZone = smoothstep(130.0, 10.0, shoreDist) * smoothstep(-8.0, 20.0, shoreDist);
  float beachWave = shoreCrest * 0.55 * beachZone;

  float oceanWeight = smoothstep(-5.0, 50.0, shoreDist);
  float totalWave = oceanSwell * oceanWeight + beachWave;
  pos.y += totalWave;

  vWaveHeight = totalWave;
  float dHdx = cos(dot(pos.xz, vec2(0.035, 0.022)) - uTime * 1.7) * 0.035 * 0.22;
  float dHdz = cos(dot(pos.xz, vec2(0.035, 0.022)) - uTime * 1.7) * 0.022 * 0.22;
  vNormal = normalize(vec3(-dHdx, 1.0, -dHdz));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = `
uniform vec3 uDeepWaterColor;
uniform vec3 uMidWaterColor;
uniform vec3 uShallowWaterColor;
uniform vec3 uCrestHighlight;
uniform vec3 uFoamColor;
uniform vec3 uWaveFoamColor;
uniform float uNightFactor;

varying vec3 vNormal;
varying float vWaveHeight;
varying float vDepth;
varying vec2 vXZ;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  float depthFactor = clamp(vDepth, 0.0, 1.0);
  vec3 waterCol = mix(uShallowWaterColor, uMidWaterColor, smoothstep(0.0, 0.45, depthFactor));
  waterCol = mix(waterCol, uDeepWaterColor, smoothstep(0.45, 1.0, depthFactor));

  float crestT = smoothstep(0.14, 0.32, vWaveHeight);
  waterCol = mix(waterCol, uCrestHighlight, crestT * 0.6);

  float ndotl = max(0.0, dot(normalize(vNormal), normalize(vec3(0.5, 0.85, 0.35))));
  float celBand = ndotl > 0.65 ? 1.0 : ndotl > 0.35 ? 0.78 : 0.62;
  waterCol *= celBand;

  float fNoise1 = snoise(vXZ * 0.18);
  float surfFoam = smoothstep(0.38, 0.52, vWaveHeight + fNoise1 * 0.12) * smoothstep(0.85, 0.15, vDepth);
  float oceanCap = smoothstep(0.22, 0.36, vWaveHeight) * smoothstep(0.35, 0.85, vDepth);
  float totalFoam = clamp(surfFoam * 0.85 + oceanCap * 0.65, 0.0, 1.0);
  vec3 finalFoam = mix(uWaveFoamColor, uFoamColor, smoothstep(0.25, 0.85, totalFoam));
  vec3 finalColor = mix(waterCol, finalFoam, totalFoam);

  if (uNightFactor > 0.0) finalColor *= mix(1.0, 0.42, uNightFactor);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function getWaterMaterial() {
  if (sharedMat) return sharedMat;
  sharedMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepWaterColor: { value: new THREE.Color(0x184c72) },
      uMidWaterColor: { value: new THREE.Color(0x277a9e) },
      uShallowWaterColor: { value: new THREE.Color(0x36b6c4) },
      uCrestHighlight: { value: new THREE.Color(0x76e6f4) },
      uFoamColor: { value: new THREE.Color(0xf4fdff) },
      uWaveFoamColor: { value: new THREE.Color(0xd0f5fc) },
      uNightFactor: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  });
  sharedMat.userData.shared = true;
  return sharedMat;
}

/** One animated water strip beside the road (shore at uv.x≈0, deep ocean at uv.x≈1). */
export function buildWaterStrip(mx, my, mz, yaw, width, length, y = -0.22) {
  const segsW = 12;
  const segsL = Math.max(4, Math.ceil(length / 6));
  const geo = new THREE.PlaneGeometry(width, length + 4, segsW, segsL);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(yaw);
  geo.translate(mx, my + y, mz);
  geo.userData.ownedGeo = true;

  const mesh = new THREE.Mesh(geo, getWaterMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export function tickWater(dt, night = 0) {
  time += dt;
  if (!sharedMat) return;
  sharedMat.uniforms.uTime.value = time;
  sharedMat.uniforms.uNightFactor.value = night;
}
