/**
 * Highway sprint race — OpenCity CityRace behaviour on the coastal highway.
 * Player + AI share stepVehicle / road-frame state (s, lateral, yawOffset).
 * Race uses a wider (~4-lane) asphalt overlay; cruise road stays unchanged.
 */
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/util.js';
import { stepVehicle } from '../vehicle/drive.js';
import { ROAD_SURFACE, ROAD_W } from '../world.js';
import { buildRoadRibbon, buildRoadEdges } from '../road.js';
import { Countdown } from './countdown.js';
import { HighwayRaceMarks } from './marks.js';
import { HighwayRivalDriver } from './rival.js';
import { awardPlace, loadMedals, saveMedals } from './medals.js';
import { ChristmasTreePole } from './tree.js';

export const RACE_LENGTHS = [400, 800, 1500, 2500, 5000];
export const RACE_LENGTH_LABELS = ['400 M', '800 M', '1.5 KM', '2.5 KM', '5.0 KM'];
export const RACE_DIFFS = ['easy', 'medium', 'hard'];
export const RACE_DIFF_LABELS = ['EASY', 'MEDIUM', 'HARD'];
export const RACE_FIELD = 4;

/** ~4-lane race deck (cruise stays ROAD_W = 14). */
export const RACE_ROAD_W = ROAD_W * 2;
export const RACE_ROAD_HALF = RACE_ROAD_W / 2 - 0.6;

const ROW = 18.0;
const HYST = 1.0;
const CP_SPACING = 75;
/** OpenCity-style body box (slightly inside true body). */
const C_LEN = 3.9;
const C_WID = 1.85;
const CONTACT_CLEAR = 0.35;
const CONTACT_PUSH_CAP = 0.5;
const CONTACT_PUSH_SCALE = 0.5;
/** Stick with last resolve axis unless the other overlap is clearly larger. */
const AXIS_STICK = 1.25;

/**
 * Grid: 3 AI ahead, player last.
 * Wide longitudinal gaps + opposite lanes so the player does not clip anyone at launch.
 * [Δs ahead of start, lateral]
 */
const GRID = [
  [ROW * 3, 6.0],   // P1 — far ahead, left
  [ROW * 2, -6.0],  // P2 — mid, right
  [ROW, 6.0],       // P3 — still clear of player, left
  [0, -6.0],        // YOU — rear right
];

const RIVAL_NAMES = ['COBALT', 'OCHRE', 'SAGE'];

const _meshFwd = new THREE.Vector3();
const _modelFwd = new THREE.Vector3();

function ordinal(n) {
  const t = n % 10;
  const h = n % 100;
  if (h >= 11 && h <= 13) return `${n}TH`;
  return `${n}${t === 1 ? 'ST' : t === 2 ? 'ND' : t === 3 ? 'RD' : 'TH'}`;
}

function emptyState(s, lat) {
  return {
    s,
    lateral: lat,
    yawOffset: 0,
    steerAngle: 0,
    steerVel: 0,
    vy: 0,
    r: 0,
    gear: 0,
    rpm: 1050,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    rollLoad: 0,
    pitchLoad: 0,
    speed: 0,
  };
}

function buildCheckpoints(startS, length) {
  const cps = [];
  const n = Math.max(2, Math.round(length / CP_SPACING));
  for (let i = 1; i <= n; i++) {
    const s = startS + (length * i) / n;
    cps.push({ s, radius: RACE_ROAD_HALF * 0.95 });
  }
  return cps;
}

export class HighwayRace {
  /**
   * @param {{
   *   highway: import('../highway.js').Highway,
   *   scene: THREE.Scene,
   *   parent?: THREE.Object3D,
   *   length: number,
   *   difficulty: string,
   *   startS?: number,
   *   playerSpec: object,
   *   rivalSpecs: object[],
   *   loadMesh: (spec: object) => Promise<THREE.Object3D>,
   * }} opts
   */
  constructor(opts) {
    this.highway = opts.highway;
    this.scene = opts.scene;
    this.parent = opts.parent || opts.scene;
    this.length = opts.length;
    this.difficulty = opts.difficulty || 'medium';
    this.startS = opts.startS ?? 40;
    this.finishS = this.startS + this.length;
    this.playerSpec = opts.playerSpec;
    this.rivalSpecs = opts.rivalSpecs;
    this.loadMesh = opts.loadMesh;
    this.roadHalf = RACE_ROAD_HALF;
    this.roadW = RACE_ROAD_W;

    this.countdown = new Countdown();
    this.marks = null;
    this.tree = null;
    this._deck = null;
    this.entries = [];
    this.playerSlot = null;
    this._order = [];
    this.clock = 0;
    this.live = false;
    this.over = false;
    this.results = null;
    this.medalAward = null;
    this.route = {
      length: this.length,
      loop: false,
      checkpoints: buildCheckpoints(this.startS, this.length),
    };
    /** @type {Set<number>} active contact pair keys (hysteresis) */
    this._pairs = new Set();
    /** @type {Map<number, 'lat'|'s'>} sticky resolve axis per pair */
    this._pairAxis = new Map();
    /** Slots currently overlapping (tight mesh follow). */
    this._inContact = new Set();
  }

  get holding() {
    return this.countdown.holding;
  }

  _buildRaceDeck() {
    const deck = new THREE.Group();
    deck.name = 'race-deck';
    const markM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    markM.userData.shared = true;
    const s0 = Math.max(0, this.startS - 30);
    const s1 = this.finishS + 60;
    const STEP = 90;
    for (let s = s0; s < s1; s += STEP) {
      const end = Math.min(s + STEP + 2, s1);
      const ribbon = buildRoadRibbon(this.highway, s, end, this.roadW);
      if (ribbon) {
        ribbon.position.y += 0.012;
        deck.add(ribbon);
      }
      deck.add(buildRoadEdges(this.highway, s, end, this.roadW, markM));
    }
    for (let s = s0 + 2; s < s1; s += 8) {
      const f = this.highway.at(s);
      const yaw = Math.atan2(f.tx, f.tz);
      for (const lat of [-this.roadW * 0.25, 0, this.roadW * 0.25]) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(Math.abs(lat) < 0.1 ? 0.16 : 0.12, 0.03, Math.abs(lat) < 0.1 ? 2.2 : 1.6),
          markM,
        );
        dash.position.set(
          f.x + f.nx * lat,
          f.y + ROAD_SURFACE + 0.02,
          f.z + f.nz * lat,
        );
        dash.rotation.y = yaw;
        dash.userData.ownedGeo = true;
        deck.add(dash);
      }
    }
    this.parent.add(deck);
    this._deck = deck;
  }

  async begin(playerState) {
    this._buildRaceDeck();
    this.marks = new HighwayRaceMarks(this.parent, this.route, this.highway);
    this.tree = new ChristmasTreePole(this.parent, this.highway, this.startS, this.roadHalf + 2.2);

    const playerGrid = GRID[GRID.length - 1];
    Object.assign(playerState, emptyState(this.startS + playerGrid[0], playerGrid[1]));
    this.playerSlot = this._slot(playerState, {
      isPlayer: true,
      name: 'YOU',
      mesh: null,
      driver: null,
      spec: this.playerSpec,
    });

    const meshes = await Promise.all(
      this.rivalSpecs.slice(0, RACE_FIELD - 1).map((spec) => this.loadMesh(spec)),
    );

    for (let i = 0; i < meshes.length; i++) {
      const spec = this.rivalSpecs[i];
      const mesh = meshes[i];
      mesh.frustumCulled = true;
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      this.parent.add(mesh);
      const [ds, lat] = GRID[i];
      const state = emptyState(this.startS + ds, lat);
      const driver = new HighwayRivalDriver(this.highway, {
        difficulty: this.difficulty,
        lane: lat,
        seed: i + 3,
        playerTop: this.playerSpec?.top ?? 150,
        roadHalf: this.roadHalf,
      });
      this.entries.push(
        this._slot(state, {
          isPlayer: false,
          name: RIVAL_NAMES[i] || `RIVAL ${i + 1}`,
          mesh,
          driver,
          spec,
        }),
      );
    }

    this._order = [...this.entries, this.playerSlot];
    this._settle(this._order.length);
    this.countdown.arm();
    this.live = true;
    this.over = false;
    this.clock = 0;
    this.results = null;
    this.medalAward = null;
    this._pairs.clear();
    this._pairAxis.clear();
    this._inContact.clear();
  }

  /**
   * @param {number} dt
   * @param {object} playerState
   * @param {{ steer:number, throttle:number, brake:number, handbrake:number }} playerInput
   */
  step(dt, playerState, playerInput) {
    if (!this.live) return;
    this.countdown.update(dt, playerInput?.throttle ?? 0);
    this.playerSlot.state = playerState;
    this._clampOnRoad(playerState, dt);
    this.tree?.sync(this.countdown.display());

    if (this.over) {
      this._applyMeshes(dt);
      this._updateMarks(playerState);
      return;
    }

    if (this.countdown.holding) {
      // Hold grid pose during Christmas Tree; soft mesh keep (no launch pop).
      for (const e of this.entries) {
        e.state.speed = 0;
        e.state.yawOffset = 0;
        e.state.steerAngle = 0;
        e.state.steerVel = 0;
        e.state.lateral = e.driver.baseLane ?? e.driver.lane;
      }
      this._applyMeshes(dt, false);
      this._updateMarks(playerState);
      return;
    }

    this.clock += dt;
    const half = this.roadHalf;
    const driveOpts = { strict: true };
    const field = [this.playerSlot, ...this.entries];

    for (const e of this.entries) {
      if (e.finished) {
        stepVehicle(e.state, { steer: 0, throttle: 0, brake: 0.5, handbrake: 0 }, dt, e.spec, half, driveOpts);
        this._clampOnRoad(e.state, dt);
        continue;
      }
      const input = e.driver.drive(e.state, dt, {
        roadHalf: half,
        others: field,
      });
      stepVehicle(e.state, input, Math.min(dt, 1 / 30), e.spec, half, driveOpts);
      this._clampOnRoad(e.state, dt);
      e.state.yawOffset = damp(e.state.yawOffset, 0, 8, dt);
      e.state.yawOffset = clamp(e.state.yawOffset, -0.05, 0.05);
      if (e.driver.stuckFor > 3.2 && e.driver.contactHold <= 0) {
        e.driver.recover(e.state);
      }
      this._progress(e);
    }
    this._progress(this.playerSlot);
    // Contacts live from green light — same butter path as mid-race (no 2.2s gate).
    this._contacts(dt);
    this._settle(1);

    if (this.playerSlot.finished && !this.over) this._finish();

    this._applyMeshes(dt);
    this._updateMarks(playerState);
  }

  _clampOnRoad(st, dt = 1 / 60) {
    // Match contact lim so edge damp does not fight capped lateral pushes.
    const lim = this.roadHalf - 1.2;
    if (st.lateral > lim) {
      st.lateral = damp(st.lateral, lim, 5, dt);
      st.yawOffset *= 0.9;
    } else if (st.lateral < -lim) {
      st.lateral = damp(st.lateral, -lim, 5, dt);
      st.yawOffset *= 0.9;
    }
  }

  _updateMarks(playerState) {
    const f = this.highway.at(playerState.s);
    this.marks?.update(
      {
        x: f.x + f.nx * playerState.lateral,
        y: f.y + ROAD_SURFACE + 0.02,
        z: f.z + f.nz * playerState.lateral,
      },
      this.playerSlot.cp,
    );
  }

  hud() {
    const pos = this.positionOf(this.playerSlot);
    return {
      position: pos,
      fieldSize: this._order.length,
      time: this.playerSlot.finished ? this.playerSlot.time : this.clock,
      countdown: this.countdown.display(),
      results: this.results,
      medal: this.medalAward,
      holding: this.countdown.holding,
      roadHalf: this.roadHalf,
    };
  }

  positionOf(slot) {
    const i = this._order.indexOf(slot);
    return i < 0 ? this._order.length : i + 1;
  }

  skipCountdown() {
    this.countdown.skip();
  }

  dispose() {
    this.live = false;
    this.marks?.dispose();
    this.marks = null;
    this.tree?.dispose();
    this.tree = null;
    if (this._deck) {
      this.parent.remove(this._deck);
      this._deck.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material && !o.material.userData?.shared) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
          else o.material.dispose?.();
        }
      });
      this._deck = null;
    }
    for (const e of this.entries) {
      if (e.mesh) this.parent.remove(e.mesh);
    }
    this.entries.length = 0;
    this._order.length = 0;
    this.playerSlot = null;
    this._pairs.clear();
    this._pairAxis.clear();
    this._inContact.clear();
  }

  _slot(state, extra) {
    return {
      state,
      cp: 0,
      progress: state.s - this.startS,
      finished: false,
      time: 0,
      ...extra,
    };
  }

  _progress(e) {
    if (e.finished) return;
    e.progress = e.state.s - this.startS;
    const cps = this.route.checkpoints;
    if (!cps.length) return;
    while (e.cp < cps.length && e.state.s >= cps[e.cp].s - 1.5) {
      e.cp++;
    }
    if (e.state.s >= this.finishS) {
      e.finished = true;
      e.time = this.clock;
      e.state.speed *= 0.4;
    }
  }

  _finish() {
    this.over = true;
    const pos = this.positionOf(this.playerSlot);
    this.results = {
      pos,
      label: ordinal(pos),
      time: this.playerSlot.time,
      field: this._order.length,
    };
    const medals = loadMedals();
    this.medalAward = awardPlace(medals, pos);
    saveMedals(medals);
  }

  _settle(passes) {
    const beats = (b, a) => {
      if (b.finished && a.finished) return b.time < a.time;
      if (b.finished !== a.finished) return b.finished;
      return b.progress > a.progress + HYST;
    };
    for (let p = 0; p < passes; p++) {
      let moved = false;
      for (let i = 0; i < this._order.length - 1; i++) {
        if (beats(this._order[i + 1], this._order[i])) {
          const t = this._order[i];
          this._order[i] = this._order[i + 1];
          this._order[i + 1] = t;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  _contacts(_dt) {
    const all = [this.playerSlot, ...this.entries];
    const lim = this.roadHalf - 1.2;
    const nextIn = new Set();
    const still = new Set();
    const stillAxis = new Map();

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const slotA = all[i];
        const slotB = all[j];
        const a = slotA.state;
        const b = slotB.state;
        const key = i * 8 + j;
        const ds = a.s - b.s;
        const dl = a.lateral - b.lateral;
        const overS = C_LEN - Math.abs(ds);
        const overL = C_WID - Math.abs(dl);

        // Drop only when clear by a margin (OpenCity hysteresis).
        if (overS <= -CONTACT_CLEAR || overL <= -CONTACT_CLEAR) {
          continue;
        }

        const had = this._pairs.has(key);
        // Margin zone: keep pair so next rub is not "fresh".
        if (overS <= 0 || overL <= 0) {
          if (had) {
            still.add(key);
            const ax = this._pairAxis.get(key);
            if (ax) stillAxis.set(key, ax);
          }
          continue;
        }

        still.add(key);
        nextIn.add(slotA);
        nextIn.add(slotB);
        if (slotA.driver) slotA.driver.noteContact();
        if (slotB.driver) slotB.driver.noteContact();

        const fresh = !had;
        let axis = this._pairAxis.get(key);
        if (!axis) {
          axis = overL <= overS ? 'lat' : 's';
        } else if (axis === 'lat' && overS > overL * AXIS_STICK) {
          axis = 's';
        } else if (axis === 's' && overL > overS * AXIS_STICK) {
          axis = 'lat';
        }
        stillAxis.set(key, axis);

        this._resolvePair(slotA, slotB, ds, dl, overS, overL, fresh, lim, axis, key);
        slotA._contactFrame = true;
        slotB._contactFrame = true;
      }
    }

    this._pairs = still;
    this._pairAxis = stillAxis;
    this._inContact = nextIn;
  }

  /**
   * Apply contact delta to physics and presentation together (OpenCity slide idea).
   */
  _slideSlot(slot, ds, dlat, lim) {
    const st = slot.state;
    if (ds) st.s += ds;
    if (dlat) st.lateral = clamp(st.lateral + dlat, -lim, lim);
    if (slot._vis?.ready) {
      if (ds) slot._vis.s += ds;
      if (dlat) slot._vis.lat = clamp(slot._vis.lat + dlat, -lim, lim);
    }
  }

  /**
   * Single-axis capped separation (OpenCity _resolve adapted to road-frame state).
   */
  _resolvePair(slotA, slotB, ds, dl, overS, overL, fresh, lim, axis, key) {
    const a = slotA.state;
    const b = slotB.state;
    if (axis === 'lat') {
      const side = dl !== 0 ? Math.sign(dl) : (key & 1 ? 1 : -1);
      const push = Math.min(overL, CONTACT_PUSH_CAP) * CONTACT_PUSH_SCALE;
      this._slideSlot(slotA, 0, side * push, lim);
      this._slideSlot(slotB, 0, -side * push, lim);
      if (fresh) {
        const kick = 0.02;
        a.yawOffset = clamp((a.yawOffset || 0) + side * kick, -0.12, 0.12);
        b.yawOffset = clamp((b.yawOffset || 0) - side * kick, -0.12, 0.12);
      }
      a.speed *= fresh ? 0.992 : 0.997;
      b.speed *= fresh ? 0.992 : 0.997;
    } else {
      const rearSlot = ds < 0 ? slotA : slotB;
      const frontSlot = ds < 0 ? slotB : slotA;
      const rear = rearSlot.state;
      const front = frontSlot.state;
      const push = Math.min(overS, CONTACT_PUSH_CAP) * CONTACT_PUSH_SCALE;
      this._slideSlot(rearSlot, -push, 0, lim);
      this._slideSlot(frontSlot, push, 0, lim);
      const closing = (rear.speed || 0) - (front.speed || 0);
      if (closing > 0) {
        rear.speed -= closing * (fresh ? 0.35 : 0.22);
        front.speed += closing * (fresh ? 0.22 : 0.15);
      }
    }
  }

  _applyMeshes(dt = 1 / 60, snap = false) {
    // Road-frame blend then project — contact deltas already applied to _vis via _slideSlot.
    const kSoft = 1 - Math.exp(-10 * dt);
    const kTight = 1 - Math.exp(-26 * dt);
    const kYaw = 1 - Math.exp(-28 * dt);
    for (const e of this.entries) {
      if (!e.mesh) continue;
      const contact =
        !!e._contactFrame ||
        this._inContact.has(e) ||
        (e.driver && e.driver.contactHold > 0);
      e._contactFrame = false;

      const targetS = e.state.s;
      const targetLat = e.state.lateral;
      const targetYaw = e.state.yawOffset || 0;

      if (!e._vis) {
        e._vis = { s: targetS, lat: targetLat, yaw: targetYaw, ready: false };
      }
      if (snap || !e._vis.ready) {
        e._vis.s = targetS;
        e._vis.lat = targetLat;
        e._vis.yaw = targetYaw;
        e._vis.ready = true;
      } else if (contact) {
        // Tight follow — never hard-snap a discontinuous target, never soft chase.
        e._vis.s = lerp(e._vis.s, targetS, kTight);
        e._vis.lat = lerp(e._vis.lat, targetLat, kTight);
        e._vis.yaw = lerp(e._vis.yaw, targetYaw, kYaw);
      } else {
        e._vis.s = lerp(e._vis.s, targetS, kSoft);
        e._vis.lat = lerp(e._vis.lat, targetLat, kSoft);
        e._vis.yaw = lerp(e._vis.yaw, targetYaw, kYaw);
      }

      const f = this.highway.at(e._vis.s);
      const heading = f.heading + e._vis.yaw;
      e.mesh.position.set(
        f.x + f.nx * e._vis.lat,
        f.y + ROAD_SURFACE + 0.02,
        f.z + f.nz * e._vis.lat,
      );
      const mf = e.mesh.userData.modelForward;
      if (mf && mf.lengthSq() > 1e-8) {
        _meshFwd.set(Math.cos(heading), 0, Math.sin(heading)).normalize();
        _modelFwd.copy(mf).normalize();
        e.mesh.quaternion.setFromUnitVectors(_modelFwd, _meshFwd);
      } else {
        e.mesh.rotation.order = 'YXZ';
        e.mesh.rotation.set(0, -heading + Math.PI / 2, 0);
      }
    }
  }
}

export { ordinal };
