/**
 * Highway rival AI — independent cruise + OpenCity-style lane avoid bias.
 * No rubber-band to the player; no post-physics lateral teleports.
 */
import { clamp, approach, damp } from '../core/util.js';

export const DIFFICULTY = {
  easy:   { speedScale: 0.78, steerRate: 2.2, brakeEarly: 1.4, top: 34 },
  medium: { speedScale: 0.92, steerRate: 2.8, brakeEarly: 1.05, top: 40 },
  hard:   { speedScale: 1.00, steerRate: 3.2, brakeEarly: 0.9, top: 48 },
};

const DAMP_GAIN = 0.75;
const DAMP_SHARE = 0.28;
const STEER_LOCK = 0.22;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Seeded 1D wander (OpenCity lineNoise idea — no runtime import). */
function makeLineNoise(seed) {
  const a = 1.7 + (seed % 7) * 0.13;
  const b = 2.3 + (seed % 5) * 0.17;
  const ph = seed * 0.41;
  return (t) => Math.sin(t * a + ph) * 0.55 + Math.sin(t * b + ph * 1.3) * 0.45;
}

export class HighwayRivalDriver {
  /**
   * @param {import('../highway.js').Highway} highway
   * @param {{difficulty?:string, lane?:number, seed?:number, playerTop?:number, roadHalf?:number}} opts
   */
  constructor(highway, opts = {}) {
    this.highway = highway;
    this.diff = { ...(DIFFICULTY[opts.difficulty] || DIFFICULTY.medium) };
    const playerTopMs = (opts.playerTop ?? 150) / 3.6;
    this.diff.top = Math.min(this.diff.top * 1.1, playerTopMs * 0.78);
    this.baseLane = opts.lane || 0;
    this.lane = this.baseLane;
    this.roadHalf = opts.roadHalf ?? 6.4;
    const seed = opts.seed || 1;
    this.pace = 0.94 + ((seed * 0.037) % 0.1);
    this.lineNoise = makeLineNoise(seed);
    this.steerSmooth = 0;
    this.throttleSmooth = 0.5;
    this.brakeSmooth = 0;
    this.planSmooth = this.diff.top * this.diff.speedScale * this.pace;
    this.stuckFor = 0;
    this.contactHold = 0;
    this._lastS = 0;
    this._prevLat = this.baseLane;
  }

  setRoadHalf(half) {
    this.roadHalf = half;
  }

  /** Called from race contact so stuck/recover ignore bumper stalls. */
  noteContact() {
    this.contactHold = 0.58;
  }

  targetSpeed(s) {
    const d = this.diff;
    let v = d.top;
    for (const [ds, w] of [[12, 1], [34, 0.9], [62, 0.76]]) {
      const a = this.highway.at(s + ds * d.brakeEarly - 6);
      const b = this.highway.at(s + ds * d.brakeEarly);
      const c = this.highway.at(s + ds * d.brakeEarly + 6);
      const a1 = Math.atan2(b.z - a.z, b.x - a.x);
      const a2 = Math.atan2(c.z - b.z, c.x - b.x);
      const k = Math.abs(wrapAngle(a2 - a1)) / 6;
      const R = 1 / Math.max(k, 1e-4);
      const limit = Math.sqrt(0.7 * 9.81 * Math.min(R, 850));
      v = Math.min(v, limit * w);
    }
    return clamp(v * d.speedScale * this.pace, 10, d.top * 1.05);
  }

  /**
   * @param {{ s:number, lateral:number, yawOffset:number, speed:number }} state
   * @param {number} dt
   * @param {{ roadHalf?:number, others?: { state: { s:number, lateral:number } }[] }} [ctx]
   */
  drive(state, dt, ctx = {}) {
    const half = ctx.roadHalf ?? this.roadHalf;
    const laneLimit = Math.max(1.2, half - 2.4);
    const s = state.s || 0;
    const lat = state.lateral || 0;
    const speed = Math.abs(state.speed || 0);
    const dtSafe = Math.max(dt, 1e-4);

    if (this.contactHold > 0) this.contactHold = Math.max(0, this.contactHold - dt);

    // OpenCity-style avoid + seeded line wander on preferred lane.
    let avoid = 0;
    const inContact = this.contactHold > 0;
    if (!inContact) {
      const others = ctx.others || [];
      for (const o of others) {
        if (!o?.state || o.state === state) continue;
        const ds = o.state.s - s;
        const dl = (o.state.lateral || 0) - lat;
        if (ds < -3 || ds > 14) continue;
        if (Math.abs(dl) > 3.2) continue;
        avoid -= Math.sign(dl || 1) * (1 - Math.max(ds, 0) / 14) * 1.8;
      }
      const wander = this.lineNoise(s * 0.012) * 1.2;
      this.lane = clamp(
        this.baseLane + wander + clamp(avoid, -2.2, 2.2),
        -laneLimit,
        laneLimit,
      );
    }
    // During contact: freeze preferred lane so steer does not fight separation.
    const wantLat = this.lane;

    const latRate = (lat - this._prevLat) / dtSafe;
    this._prevLat = lat;

    const latErr = wantLat - lat;
    const yaw = state.yawOffset || 0;
    let steerRaw = clamp(-latErr * 0.08 - yaw * 2.0, -STEER_LOCK, STEER_LOCK);

    // Cross-track rate damp (OpenCity dampTerm) — stops door-rub oscillation.
    const drift = Math.atan2(latRate, Math.max(speed, 8));
    const dampTerm = -clamp(drift * DAMP_GAIN, -DAMP_SHARE * STEER_LOCK, DAMP_SHARE * STEER_LOCK);
    steerRaw = clamp(steerRaw + dampTerm, -STEER_LOCK, STEER_LOCK);

    const steerRate = inContact ? this.diff.steerRate * 0.35 : this.diff.steerRate;
    this.steerSmooth = approach(this.steerSmooth, steerRaw, steerRate, dt);
    state.yawOffset = damp(yaw, 0, inContact ? 4 : 7, dt);

    const planRaw = this.targetSpeed(s);
    this.planSmooth = approach(this.planSmooth, planRaw, 1.8, dt);
    const plan = this.planSmooth;

    let throttle = 0.55;
    let brake = 0;
    const over = speed - plan;
    if (over > 3.5) {
      brake = clamp(over / 14, 0.08, 0.55);
      throttle = 0.08;
    } else if (over > 1.2) {
      throttle = 0.25;
      brake = 0.05;
    } else {
      throttle = clamp((plan - speed) / 9 + 0.55, 0.35, 1);
    }

    this.throttleSmooth = approach(this.throttleSmooth, throttle, 2.4, dt);
    this.brakeSmooth = approach(this.brakeSmooth, brake, 2.6, dt);

    // Ignore bumper stalls when counting "stuck".
    if (this.contactHold > 0) {
      this.stuckFor = 0;
      this._lastS = s;
    } else if (Math.abs(s - this._lastS) < 0.08) {
      this.stuckFor += dt;
    } else {
      this.stuckFor = 0;
      this._lastS = s;
    }

    return {
      steer: this.steerSmooth,
      throttle: this.throttleSmooth,
      brake: this.brakeSmooth,
      handbrake: 0,
    };
  }

  recover(state) {
    const half = this.roadHalf;
    // Soft rewind — avoid 8 m teleports after false stuck.
    state.s = Math.max(40, state.s - 3.5);
    state.lateral = clamp(this.baseLane, -(half - 1.5), half - 1.5);
    this.lane = this.baseLane;
    this._prevLat = state.lateral;
    state.yawOffset = 0;
    state.steerAngle = 0;
    state.steerVel = 0;
    state.speed = this.planSmooth * 0.45;
    this.stuckFor = 0;
    this.contactHold = 0;
    this.steerSmooth = 0;
    this.throttleSmooth = 0.5;
    this.brakeSmooth = 0;
  }
}
