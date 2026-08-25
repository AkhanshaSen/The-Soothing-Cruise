/**
 * Virtual joystick + pedals → Input.touch.
 * Stick: X = steer, up = drive, down = brake.
 * Right buttons still work as Drive / Brake holds.
 */
export function bindTouch(root, input, { onPause, onReset } = {}) {
  const stick = root.querySelector('#steer');
  const knob = root.querySelector('#knob');
  const gas = root.querySelector('#gas');
  const brake = root.querySelector('#brake');
  const tpause = root.querySelector('#tpause');
  const treset = root.querySelector('#treset');
  if (!stick || !input?.touch) return;

  let active = false;
  let pointerId = null;
  let stickThrottle = 0;
  let stickBrake = 0;
  let pedalThrottle = 0;
  let pedalBrake = 0;
  const DEAD = 0.12;
  const MAX_TRAVEL = 0.42;

  const placeKnob = (nx, ny) => {
    if (!knob) return;
    const pctX = 50 + nx * MAX_TRAVEL * 100;
    const pctY = 50 + ny * MAX_TRAVEL * 100;
    knob.style.left = `${pctX}%`;
    knob.style.top = `${pctY}%`;
  };

  const syncDrive = () => {
    input.touch.throttle = Math.max(stickThrottle, pedalThrottle);
    input.touch.brake = Math.max(stickBrake, pedalBrake);
  };

  const axisAfterDead = (v) => {
    if (Math.abs(v) < DEAD) return 0;
    return Math.sign(v) * ((Math.abs(v) - DEAD) / (1 - DEAD));
  };

  const applyStick = (clientX, clientY) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width * 0.5;
    const cy = r.top + r.height * 0.5;
    const radius = Math.min(r.width, r.height) * 0.5;
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }

    // Match keyboard / gamepad: left → +steer, right → −steer
    // (Kenney nose vs road-frame yaw — same flip as Input.update keys).
    input.touch.steer = Math.max(-1, Math.min(1, axisAfterDead(-dx)));

    // Screen up (negative dy) = drive; screen down = brake.
    const fwd = axisAfterDead(-dy);
    stickThrottle = fwd > 0 ? fwd : 0;
    stickBrake = fwd < 0 ? -fwd : 0;
    syncDrive();
    placeKnob(dx, dy);
  };

  const endStick = () => {
    active = false;
    pointerId = null;
    input.touch.steer = 0;
    stickThrottle = 0;
    stickBrake = 0;
    syncDrive();
    placeKnob(0, 0);
  };

  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    active = true;
    pointerId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    applyStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pointerId) return;
    applyStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointerup', (e) => {
    if (e.pointerId === pointerId) endStick();
  });
  stick.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointerId) endStick();
  });

  const holdPedal = (el, which) => {
    if (!el) return;
    const set = (v) => (e) => {
      e.preventDefault();
      if (which === 'throttle') pedalThrottle = v;
      else pedalBrake = v;
      syncDrive();
    };
    el.addEventListener('pointerdown', set(1));
    el.addEventListener('pointerup', set(0));
    el.addEventListener('pointercancel', set(0));
    el.addEventListener('pointerleave', set(0));
  };
  holdPedal(gas, 'throttle');
  holdPedal(brake, 'brake');

  tpause?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onPause?.();
  });
  treset?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onReset?.();
  });

  placeKnob(0, 0);
}
