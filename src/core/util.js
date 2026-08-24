export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dampAngle(current, target, lambda, dt) {
  return current + wrapPi(target - current) * (1 - Math.exp(-lambda * dt));
}

export function saturate(v) {
  return clamp(v, 0, 1);
}

export function smoothstep(a, b, x) {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function hexColor(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}
