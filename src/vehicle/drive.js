/**
 * Highway driving — road-frame integration (s, lateral, yawOffset).
 */
import { clamp, damp, lerp, smoothstep } from '../core/util.js';

const MASS = 1180;
const WB = 2.9;
const STEER_IN = 13.0;
const STEER_BACK = 26.0;
const WHEEL_R = 0.5;

const ENGINE = [
  [0.0, 0.55],
  [0.2, 0.85],
  [0.45, 1.0],
  [0.7, 1.0],
  [0.88, 0.9],
  [1.0, 0.62],
];
const GEARS = [3.35, 2.15, 1.52, 1.15, 0.92, 0.78];
const FINAL = 3.9;
const MAX_RPM = 7400;
const IDLE_RPM = 1050;
const DRIVE_TORQUE = 305;
const AERO_DRAG = 0.38;
const BRAKE_FORCE = 11800;
const HANDBRAKE_FORCE = 3200;
const REVERSE_FORCE = 2800;

/** Drift unlock — slip/FX only above this speed (km/h) with a hard steer. */
export const DRIFT_MIN_KMH = 130;
export const DRIFT_HARD_STEER = 0.82;
const DRIFT_MIN_MS = DRIFT_MIN_KMH / 3.6;

export function steerLockAt(speed) {
  return lerp(0.40, 0.08, smoothstep(4, 55, Math.abs(speed)));
}

function torqueAt(frac) {
  for (let i = 0; i < ENGINE.length - 1; i++) {
    const [x0, y0] = ENGINE[i];
    const [x1, y1] = ENGINE[i + 1];
    if (frac >= x0 && frac <= x1) return lerp(y0, y1, (frac - x0) / (x1 - x0));
  }
  return ENGINE[ENGINE.length - 1][1];
}

function steerToward(state, target, w, dt) {
  const d = state.steerAngle - target;
  const b = state.steerVel + w * d;
  const e = Math.exp(-w * dt);
  const dampened = d + b * dt;
  state.steerAngle = target + dampened * e;
  state.steerVel = (b - w * dampened) * e;
}

function gearForSpeed(speed) {
  const v = Math.abs(speed);
  for (let g = 0; g < GEARS.length; g++) {
    const rpm = (v / WHEEL_R) * GEARS[g] * FINAL * 60 / (Math.PI * 2);
    if (rpm < MAX_RPM * 0.94) return g;
  }
  return GEARS.length - 1;
}

function perfFromSpec(spec) {
  return {
    power: spec?.powerScale ?? (spec?.power ?? 12500) / 12500,
    drag: spec?.drag ?? 1,
    steer: spec?.steerScale ?? 1,
    drift: spec?.drift ?? 0.8,
  };
}

export function stepVehicle(state, input, dt, spec, roadHalf = 6.4, opts = {}) {
  const steerIn = clamp(input.steer ?? 0, -1, 1);
  const throttle = clamp(input.throttle ?? 0, 0, 1);
  const brake = clamp(input.brake ?? 0, 0, 1);
  const handbrakeIn = clamp(input.handbrake ?? 0, 0, 1);

  const perf = perfFromSpec(spec);
  const mass = spec?.mass ?? MASS;
  const wheelbase = spec?.wheelbase ?? WB;
  const topMs = (spec?.top ?? 150) / 3.6;
  const reverseMax = topMs * 0.38;

  if (state.steerVel == null) state.steerVel = 0;
  if (state.steerAngle == null) state.steerAngle = 0;
  if (state.yawOffset == null) state.yawOffset = 0;
  if (state.lateral == null) state.lateral = 0;
  if (state.gear == null) state.gear = 0;
  if (state.rpm == null) state.rpm = IDLE_RPM;

  let speed = state.speed ?? 0;
  const absSpeed = Math.abs(speed);
  // Handbrake always slows; slip only at ≥130 km/h with a hard left/right steer.
  const hardSteer = Math.abs(steerIn) >= DRIFT_HARD_STEER;
  const canDrift = absSpeed >= DRIFT_MIN_MS && hardSteer;
  const handbrake = handbrakeIn;
  const driftHb = canDrift ? handbrakeIn : 0;

  const lockScale = (spec?.steer ?? 0.58) / 0.62;
  const maxLock = steerLockAt(speed) * lockScale * perf.steer;
  // OpenCity: wantSteer = input.steer * maxLock (A = −1 left, D = +1 right).
  const wantSteer = steerIn * maxLock;
  const centering =
    Math.abs(wantSteer) < Math.abs(state.steerAngle) || wantSteer * state.steerAngle < 0;
  steerToward(state, wantSteer, (centering ? STEER_BACK : STEER_IN) * perf.steer, dt);

  state.gear = gearForSpeed(Math.max(speed, 0));
  const rpmRaw =
    (Math.max(absSpeed, 0.5) / WHEEL_R) * GEARS[state.gear] * FINAL * 60 / (Math.PI * 2);
  state.rpm = damp(state.rpm, clamp(rpmRaw, IDLE_RPM, MAX_RPM), 10, dt);

  const drive =
    torqueAt(state.rpm / MAX_RPM) *
    DRIVE_TORQUE *
    perf.power *
    GEARS[state.gear] *
    FINAL /
    WHEEL_R;

  const reversing = brake > 0.15 && speed < 1.4 && throttle < 0.05;
  let ax = 0;

  if (reversing) {
    ax = (-brake * REVERSE_FORCE * perf.power) / mass;
  } else {
    if (throttle > 0 && brake < 0.1) {
      const launch = absSpeed < 3 ? 1.6 : 1;
      ax += (throttle * drive * launch * (state.rpm > MAX_RPM * 0.98 ? 0.3 : 1)) / mass;
    }
    if (brake > 0 || handbrake > 0) {
      const sign = Math.sign(speed) || 1;
      ax -= ((brake * BRAKE_FORCE + handbrake * HANDBRAKE_FORCE) * sign) / mass;
    }
    if (absSpeed > 0.05) {
      ax -= (AERO_DRAG * perf.drag * speed * absSpeed) / mass;
      ax -= (160 * Math.sign(speed) * Math.min(1, absSpeed)) / mass;
    }
  }

  speed += ax * dt;
  if (!reversing && speed < 0 && throttle < 0.05) speed = 0;
  speed = clamp(speed, -reverseMax, topMs);
  state.speed = speed;

  const grip = 1 - driftHb * 0.5 * perf.drift;
  // OpenCity: +steer turns the nose right → negative yawOffset in road frame.
  let yawRate = -(speed * Math.tan(state.steerAngle)) / wheelbase;
  yawRate *= grip;
  if (driftHb > 0.2 && canDrift) {
    yawRate += -steerIn * driftHb * absSpeed * 0.042 * perf.drift;
  }

  // Turn-in at parking speeds when throttle is held (yawRate is 0 when speed = 0).
  if (absSpeed < 2.5 && throttle > 0.08 && Math.abs(steerIn) > 0.05) {
    yawRate += -steerIn * throttle * lerp(0.7, 0.12, smoothstep(0, 2.5, absSpeed));
  }

  state.yawOffset += yawRate * dt;

  if (Math.abs(steerIn) < 0.06 && driftHb < 0.1 && throttle < 0.05 && brake < 0.05) {
    state.yawOffset = damp(state.yawOffset, 0, 4, dt);
  }
  // Ordinary steering stays tight; unlocked handbrake opens a wider slip window.
  const yawCap = driftHb > 0.15
    ? lerp(0.34, 0.95, clamp(driftHb * perf.drift, 0, 1))
    : 0.34;
  state.yawOffset = clamp(state.yawOffset, -yawCap, yawCap);

  state.s = Math.max(0, state.s + speed * Math.cos(state.yawOffset) * dt);
  state.lateral += speed * Math.sin(state.yawOffset) * dt;

  // Cruise allows a soft shoulder; race (strict) hard-clips to the asphalt.
  const margin = opts.strict ? 0.35 : 16;
  state.lateral = clamp(state.lateral, -(roadHalf + margin), roadHalf + margin);
  if (opts.strict && Math.abs(state.lateral) > roadHalf * 0.9) {
    const edge = Math.sign(state.lateral || 1) * roadHalf * 0.88;
    state.lateral = damp(state.lateral, edge, 10, dt);
    state.yawOffset = damp(state.yawOffset, 0, 8, dt);
    state.speed *= 1 - 0.55 * dt;
  }

  state.vy = 0;
  state.r = 0;
  state.throttle = throttle;
  state.brake = brake;
  // Expose effective drift input (0 below unlock speed) for FX / HUD.
  state.handbrake = driftHb;

  return {
    steerAngle: state.steerAngle,
    slipAngle: state.yawOffset,
    gear: state.gear + 1,
    rpm: state.rpm,
  };
}

export function updateDrive(state, input, dt, spec, roadHalf, opts) {
  return stepVehicle(state, input, dt, spec, roadHalf, opts);
}
