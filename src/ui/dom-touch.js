/**
 * On-screen drive buttons → Input.touch (OpenCity touch.js contract).
 * Lets the existing HUD arrows / pedals feed the same pipeline as keyboard.
 */
export class DomTouchBridge {
  constructor() {
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = 0;
    this.live = true;
    this._left = false;
    this._right = false;
    this._forward = false;
    this._back = false;
  }

  setLeft(on) {
    this._left = on;
    this._syncSteer();
  }

  setRight(on) {
    this._right = on;
    this._syncSteer();
  }

  setForward(on) {
    this._forward = on;
    this.throttle = on ? 1 : 0;
  }

  setBack(on) {
    this._back = on;
    this.brake = on ? 1 : 0;
  }

  _syncSteer() {
    this.steer = (this._right ? 1 : 0) - (this._left ? 1 : 0);
  }
}

export function bindDriveButtons(input, bridge) {
  input.touch = bridge;

  function bind(id, press, release) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const down = (e) => {
      e.preventDefault();
      press();
      btn.classList.add('pressed');
    };
    const up = () => {
      release();
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  }

  bind('btn-left', () => bridge.setLeft(true), () => bridge.setLeft(false));
  bind('btn-right', () => bridge.setRight(true), () => bridge.setRight(false));
  bind('btn-forward', () => bridge.setForward(true), () => bridge.setForward(false));
  bind('btn-back', () => bridge.setBack(true), () => bridge.setBack(false));
}
