/**
 * Vehicle step — OpenCity src/car/physics.js adapted to road-frame (s, lateral, yawOffset).
 *
 * Input each substep: { steer, throttle, brake, handbrake } in [-1,1] / [0,1].
 * No smoothing here — Input reports raw axes; steer filter + tyres live here.
 */
import { clamp, damp, lerp, smoothstep } from '../core/util.js';

const G = 9.81;
const MASS = 1180;
const IZZ = 1500;
const TYRE_B = 7.4;
const TYRE_C = 1.5;
const MU_BASE = 1.28;
const STEER_IN = 20.0;
const STEER_BACK = 31.0;
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
const AERO_DRAG = 0.42;
const BRAKE_FORCE = 12200;
const HANDBRAKE_FORCE = 3400;

/** OpenCity steerLockAt — exported for AI / HUD if needed. */
export function steerLockAt(speed) {
  return lerp(0.62, 0.16, smoothstep(4, 46, speed));
}

function torqueAt(frac) {
  for (let i = 0; i < ENGINE.length - 1; i++) {
    const [x0, y0] = ENGINE[i];
    const [x1, y1] = ENGINE[i + 1];
    if (frac >= x0 && frac <= x1) return lerp(y0, y1, (frac - x0) / (x1 - x0));
  }
  return ENGINE[ENGINE.length - 1][1];
}

function tyreForce(slip, load, mu) {
  return mu * load * Math.sin(TYRE_C * Math.atan(TYRE_B * slip));
}

/** OpenCity _steerToward — critically damped 2nd-order wheel filter. */
function steerToward(state, target, w, dt) {
  const d = state.steerAngle - target;
  const b = state.steerVel + w * d;
  const e = Math.exp(-w * dt);
  const dampened = d + b * dt;
  state.steerAngle = target + dampened * e;
  state.steerVel = (b - w * dampened) * e;
}

function gearForSpeed(speed) {
  for (let g = 0; g < GEARS.length; g++) {
    const rpm = (Math.abs(speed) / WHEEL_R) * GEARS[g] * FINAL * 60 / (Math.PI * 2);
    if (rpm < MAX_RPM * 0.94) return g;
  }
  return GEARS.length - 1;
}

/**
 * One fixed substep — call at 120 Hz (OpenCity main.js SUBSTEP = 1/120).
 * @returns {{ steerAngle: number, slipAngle: number }}
 */
export function stepVehicle(state, input, dt, spec) {
  const throttle = clamp(input.throttle ?? 0, 0, 1);
  const brake = clamp(input.brake ?? 0, 0, 1);
  const handbrake = clamp(input.handbrake ?? 0, 0, 1);
  const steerIn = clamp(input.steer ?? 0, -1, 1);

  const perfPower = (spec?.power ?? 12500) / 12500;
  const perfDrag = 1;
  const perfSteer = spec?.steerScale ?? 1;
  const perfGrip = (spec?.grip ?? 13.2) / 13.2;
  const perfDrift = spec?.drift ?? 1;
  const mass = spec?.mass ?? MASS;
  const wheelbase = spec?.wheelbase ?? 2.9;
  const A = wheelbase * 0.46;
  const B = wheelbase * 0.54;

  if (state.steerVel == null) state.steerVel = 0;
  if (state.steerAngle == null) state.steerAngle = 0;
  if (state.vy == null) state.vy = 0;
  if (state.r == null) state.r = 0;
  if (state.gear == null) state.gear = 0;
  if (state.rpm == null) state.rpm = IDLE_RPM;
  if (state.speed == null) state.speed = 0;

  const speed = state.speed;
  const absSpeed = Math.abs(speed);

  // ---- steering (OpenCity: lock at speed + 2nd-order filter) ----
  const lockScale = (spec?.steer ?? 0.58) / 0.62;
  const maxLock = steerLockAt(absSpeed) * lockScale;
  const wantSteer = steerIn * maxLock;
  const centering =
    Math.abs(wantSteer) < Math.abs(state.steerAngle) || wantSteer * state.steerAngle < 0;
  steerToward(state, wantSteer, (centering ? STEER_BACK : STEER_IN) * perfSteer, dt);
  const steerAngle = state.steerAngle;

  // ---- longitudinal (engine, brakes, aero — OpenCity Fx path) ----
  state.gear = gearForSpeed(speed);
  const rpmRaw =
    (absSpeed / WHEEL_R) * GEARS[state.gear] * FINAL * 60 / (Math.PI * 2);
  state.rpm = damp(state.rpm, clamp(rpmRaw, IDLE_RPM, MAX_RPM), 9, dt);

  let Fx = 0;
  const drive =
    torqueAt(state.rpm / MAX_RPM) * DRIVE_TORQUE * perfPower * GEARS[state.gear] * FINAL / WHEEL_R;
  const thrust = throttle * drive * (state.rpm > MAX_RPM * 0.985 ? 0.25 : 1);
  Fx += thrust;

  const braking = brake * BRAKE_FORCE + handbrake * HANDBRAKE_FORCE;
  Fx -= Math.sign(speed || 1) * braking;

  Fx -= AERO_DRAG * perfDrag * speed * absSpeed;
  const rollRes = 240 * Math.sign(speed) * Math.min(1, absSpeed);
  Fx -= rollRes;

  const ax = Fx / mass + state.vy * state.r;
  state.speed += ax * dt;
  if (state.speed < 0) state.speed = 0;

  // ---- lateral tyres (bicycle slip + magic formula) ----
  const mu = MU_BASE * perfGrip;
  const vxSafe = Math.max(absSpeed, 1.2) * Math.sign(speed || 1);
  const signVx = Math.sign(vxSafe);

  let Fyf = 0;
  let Fyr = 0;
  if (absSpeed > 0.35) {
    const slipF = Math.atan2(state.vy + A * state.r, absSpeed) - steerAngle * signVx;
    const slipR = Math.atan2(state.vy - B * state.r, absSpeed);
    const load = mass * G * 0.5;

    Fyf = tyreForce(-slipF, load, mu);
    const hbRear = lerp(1, 0.16, clamp(handbrake * perfDrift, 0, 1));
    Fyr = tyreForce(-slipR, load, mu * hbRear);

    const scrub = clamp(30 * state.vy * Math.abs(state.vy), -7000, 7000);
    const Fy = Fyf + Fyr - scrub;

    const ay = Fy / mass - speed * state.r;
    state.vy += ay * dt;

    const torque = A * Fyf * Math.cos(steerAngle) - B * Fyr;
    state.r += (torque / IZZ) * dt;
    state.r -= state.r * clamp(2.6 - absSpeed * 0.08, 0.4, 2.6) * dt;

    const rMax = (mu * G) / Math.max(absSpeed, 5) * 1.28 + 0.15;
    if (Math.abs(state.r) > rMax) {
      state.r = lerp(state.r, Math.sign(state.r) * rMax, clamp(dt * 7, 0, 1));
    }
  }

  if (absSpeed < 0.12 && throttle < 0.02) {
    state.speed *= 0.86;
    state.r *= 0.8;
  }

  state.yawOffset += state.r * dt;
  state.yawOffset = clamp(state.yawOffset, -0.4, 0.4);

  // ---- road-frame position ----
  state.s += speed * Math.cos(state.yawOffset) * dt;
  state.lateral -= (state.vy + speed * Math.sin(state.yawOffset)) * dt;

  const slipAngle = Math.atan2(state.vy, absSpeed + 1.2);
  state.throttle = throttle;
  state.brake = brake;
  state.handbrake = handbrake;

  return { steerAngle, slipAngle, gear: state.gear + 1, rpm: state.rpm };
}

/** @deprecated use stepVehicle */
export function updateDrive(state, input, dt, spec) {
  return stepVehicle(state, input, dt, spec);
}
