/**
 * Christmas Tree launch sequence — drag-style pre-stage / stage / amber / green.
 * Wall-clock only (same terms as OpenCity countdown).
 */
import { clamp, smoothstep } from '../core/util.js';

const PRE_WALL = 0.55;
const STAGE_WALL = 0.55;
const AMBER_WALL = 0.50;
const AMBERS = 3;
const LIGHTS_WALL = PRE_WALL + STAGE_WALL + AMBERS * AMBER_WALL;
const GO_WALL = 1.1;
const TAIL_WALL = 2.4;
const POP_WALL = 0.22;
const POP_SCALE = 1.12;
const FADE_WALL = 0.28;

const REV_IDLE = 0.14;
const REV_LIMIT = 0.985;
const REV_RATE = 6.5;
const REV_FLUTTER = 0.022;
const REV_FLUTTER_HZ = 18;

export class Countdown {
  constructor() {
    this.armed = false;
    this.t = 0;
    this.rev = REV_IDLE;
    this.throttle = 0;
    this._amber = -1;
    this._tone = null;
    this._done = false;
  }

  arm() {
    this.armed = true;
    this.t = 0;
    this.rev = REV_IDLE;
    this.throttle = 0;
    this._amber = -1;
    this._tone = null;
    this._done = false;
  }

  get alive() {
    return this.armed && !this._done;
  }

  /** Cars frozen until the green light. */
  get holding() {
    return this.armed && !this._done && this.t < LIGHTS_WALL;
  }

  skip() {
    if (!this.armed || this._done) return;
    this.armed = false;
    this._done = true;
    this._tone = null;
    this.rev = REV_IDLE;
  }

  update(dt, throttle = 0) {
    if (!this.alive) return;
    this.t += dt;
    this.throttle = clamp(throttle, 0, 1);

    const held = this.t < LIGHTS_WALL;
    const target = held ? REV_IDLE + (REV_LIMIT - REV_IDLE) * this.throttle : REV_IDLE;
    const k = 1 - Math.exp(-REV_RATE * dt);
    this.rev = this.rev + (target - this.rev) * k;

    const amberStep = this._amberStep();
    if (amberStep > this._amber) {
      this._amber = amberStep;
      this._tone = amberStep >= AMBERS ? 'go' : amberStep >= 0 ? 'count' : 'stage';
    }
    if (this.t >= LIGHTS_WALL + TAIL_WALL) this._done = true;
  }

  _amberStep() {
    if (this.t < PRE_WALL + STAGE_WALL) return -1;
    const into = this.t - (PRE_WALL + STAGE_WALL);
    if (this.t >= LIGHTS_WALL) return AMBERS;
    return Math.min(AMBERS - 1, Math.floor(into / AMBER_WALL));
  }

  get displayRev() {
    if (!this.armed || this._done) return null;
    const flutter =
      this.holding && this.rev > REV_LIMIT - 0.06
        ? REV_FLUTTER * Math.sin(this.t * REV_FLUTTER_HZ * Math.PI * 2)
        : 0;
    return clamp(this.rev + flutter, 0, 1);
  }

  takeTone() {
    const t = this._tone;
    this._tone = null;
    return t;
  }

  get hype() {
    if (!this.armed || this._done) return 0;
    if (this.t < LIGHTS_WALL) {
      const amber = Math.max(0, this._amberStep() + 1);
      return clamp(0.12 + 0.14 * amber, 0, 1);
    }
    return clamp(Math.exp(-(this.t - LIGHTS_WALL) / 0.95), 0, 1);
  }

  /**
   * Christmas Tree state for HUD / world lights.
   * @returns {null | {
   *   phase: string,
   *   preStage: boolean,
   *   stage: boolean,
   *   ambers: boolean[],
   *   go: boolean,
   *   text: string | null,
   *   scale: number,
   *   alpha: number,
   * }}
   */
  display() {
    if (!this.armed || this._done) return null;
    const go = this.t >= LIGHTS_WALL;
    if (go && this.t >= LIGHTS_WALL + GO_WALL) return null;

    const preStage = this.t >= 0.08;
    const stage = this.t >= PRE_WALL;
    const ambers = [false, false, false];
    if (!go) {
      const a = this._amberStep();
      for (let i = 0; i <= a && i < AMBERS; i++) ambers[i] = true;
    } else {
      ambers[0] = ambers[1] = ambers[2] = true;
    }

    let phase = 'prestage';
    if (go) phase = 'go';
    else if (this.t >= PRE_WALL + STAGE_WALL) phase = 'amber';
    else if (stage) phase = 'stage';

    const into = go
      ? this.t - LIGHTS_WALL
      : this.t >= PRE_WALL + STAGE_WALL
        ? (this.t - (PRE_WALL + STAGE_WALL)) % AMBER_WALL
        : this.t % PRE_WALL;
    const life = go ? GO_WALL : AMBER_WALL;

    return {
      phase,
      preStage,
      stage,
      ambers,
      go,
      text: go ? 'GO' : null,
      scale: go ? 1 + (POP_SCALE - 1) * (1 - smoothstep(0, POP_WALL, into)) : 1,
      alpha: go ? 1 - smoothstep(life - FADE_WALL, life, into) : 1,
    };
  }
}

export const COUNTDOWN_SECONDS_WALL = LIGHTS_WALL;
