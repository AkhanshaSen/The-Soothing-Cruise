/**
 * OpenCity control bindings — keyboard, mouse orbit, gamepad.
 * Raw axes; steering smoothing lives in stepVehicle().
 */
const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  handbrake: ['Space'],
  look: ['KeyC'],
  reset: ['KeyR'],
  skip: ['Enter', 'NumpadEnter'],
  pause: ['Escape'],
  map: ['KeyM'],
  menuUp: ['ArrowUp', 'KeyW'],
  menuDown: ['ArrowDown', 'KeyS'],
  menuLeft: ['ArrowLeft', 'KeyA'],
  menuRight: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
};

const PAD = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  l2: 6,
  r2: 7,
  select: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

const PAD_MENU_ON = 0.6;
const PAD_MENU_OFF = 0.35;

function pickPad() {
  const list = navigator.getGamepads?.() || [];
  let fallback = null;
  for (const p of list) {
    if (!p || !p.connected) continue;
    if (p.mapping === 'standard') return p;
    if (!fallback) fallback = p;
  }
  return fallback;
}

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = 0;
    this.lookBack = false;
    this.resetPressed = false;
    this.skipPressed = false;
    this.pausePressed = false;
    this.mapPressed = false;
    this.fullscreenToggle = false;
    this.flyToggle = false;
    this.menuUpPressed = false;
    this.menuDownPressed = false;
    this.menuLeftPressed = false;
    this.menuRightPressed = false;
    this.confirmPressed = false;
    this.touch = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this._pressedThisFrame = new Set();
    this._padWas = [];
    this._padMenu = 0;
    this._padMenuX = 0;

    this._onDown = (e) => {
      if (e.repeat) return;
      this.down.add(e.code);

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        this.flyToggle = true;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyF' || e.key === 'f')) {
        e.preventDefault();
        this.fullscreenToggle = true;
        return;
      }

      this._pressedThisFrame.add(e.code);
      if (Object.values(KEYS).some((list) => list.includes(e.code))) e.preventDefault();
    };
    this._onUp = (e) => this.down.delete(e.code);
    this._onBlur = () => this.down.clear();

    target.addEventListener('keydown', this._onDown, { passive: false });
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('blur', this._onBlur);
    this._target = target;
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onDown);
    this._target.removeEventListener('keyup', this._onUp);
    this._target.removeEventListener('blur', this._onBlur);
  }

  held(name) {
    return KEYS[name].some((k) => this.down.has(k));
  }

  pressed(name) {
    return KEYS[name].some((k) => this._pressedThisFrame.has(k));
  }

  codeHeld(code) {
    return this.down.has(code);
  }

  update() {
    const pad = pickPad();

    let steerWant = 0;
    let thr = 0;
    let brk = 0;
    let hb = 0;

    // A / left = turn right on the visual mesh, D / right = turn left
    // (Kenney nose vs road-frame yaw is 180° apart — flip keys, not the model).
    if (this.held('left')) steerWant += 1;
    if (this.held('right')) steerWant -= 1;
    if (this.held('throttle')) thr = 1;
    if (this.held('brake')) brk = 1;
    if (this.held('handbrake')) hb = 1;

    const level = (i) => {
      const b = pad?.buttons[i];
      if (!b) return 0;
      return b.value || (b.pressed ? 1 : 0);
    };

    if (pad) {
      const ax = pad.axes[0] || 0;
      const dz = Math.abs(ax) < 0.14 ? 0 : (ax - Math.sign(ax) * 0.14) / 0.86;
      if (dz) steerWant = -Math.sign(dz) * dz * dz;
      thr = Math.max(thr, level(PAD.r2));
      brk = Math.max(brk, level(PAD.l2));
      hb = Math.max(hb, level(PAD.south));
    }

    if (this.touch) {
      if (Math.abs(this.touch.steer) > 0.02) steerWant = this.touch.steer;
      thr = Math.max(thr, this.touch.throttle || 0);
      brk = Math.max(brk, this.touch.brake || 0);
      hb = Math.max(hb, this.touch.handbrake || 0);
    }

    this.steer = steerWant;
    this.throttle = thr;
    this.brake = brk;
    this.handbrake = hb;
    this.lookBack = this.held('look') || !!pad?.buttons[PAD.north]?.pressed;

    const padEdge = (i) => !!pad?.buttons[i]?.pressed && !this._padWas[i];

    this.resetPressed = this.pressed('reset') || padEdge(PAD.select);
    this.skipPressed = this.pressed('skip') || padEdge(PAD.west);

    const ay = pad ? pad.axes[1] || 0 : 0;
    let stick = 0;
    if (Math.abs(ay) < PAD_MENU_OFF) this._padMenu = 0;
    else if (Math.abs(ay) > PAD_MENU_ON && this._padMenu !== Math.sign(ay)) {
      this._padMenu = Math.sign(ay);
      stick = this._padMenu;
    }

    const axMenu = pad ? pad.axes[0] || 0 : 0;
    let stickX = 0;
    if (Math.abs(axMenu) < PAD_MENU_OFF) this._padMenuX = 0;
    else if (Math.abs(axMenu) > PAD_MENU_ON && this._padMenuX !== Math.sign(axMenu)) {
      this._padMenuX = Math.sign(axMenu);
      stickX = this._padMenuX;
    }

    this.pausePressed = this.pressed('pause') || padEdge(PAD.start);
    this.mapPressed = this.pressed('map');
    this.menuUpPressed = this.pressed('menuUp') || padEdge(PAD.dpadUp) || stick < 0;
    this.menuDownPressed = this.pressed('menuDown') || padEdge(PAD.dpadDown) || stick > 0;
    this.menuLeftPressed = this.pressed('menuLeft') || padEdge(PAD.dpadLeft) || stickX < 0;
    this.menuRightPressed = this.pressed('menuRight') || padEdge(PAD.dpadRight) || stickX > 0;
    this.confirmPressed = this.pressed('confirm') || padEdge(PAD.south);
    if (padEdge(PAD.east)) this.pausePressed = true;

    this._padWas.length = 0;
    if (pad) {
      for (let i = 0; i < pad.buttons.length; i++) {
        this._padWas[i] = pad.buttons[i].pressed;
      }
    }
    this._pressedThisFrame.clear();
  }

  consumeFullscreenToggle() {
    const v = this.fullscreenToggle;
    this.fullscreenToggle = false;
    return v;
  }

  consumeFlyToggle() {
    const v = this.flyToggle;
    this.flyToggle = false;
    return v;
  }
}

export function driverInputFrom(input) {
  return {
    steer: input.steer,
    throttle: input.throttle,
    brake: input.brake,
    handbrake: input.handbrake,
  };
}
