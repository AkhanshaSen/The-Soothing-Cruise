import { touch } from '../core/input.js';

export function bindTouch(root) {
  const steer = root.querySelector('#steer');
  const knob = root.querySelector('#knob');
  const gas = root.querySelector('#gas');
  const brake = root.querySelector('#brake');
  if (!steer) return { reset: false, pause: false };

  const setSteer = (clientX) => {
    const r = steer.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    const s = Math.max(-1, Math.min(1, (t - 0.5) * 2));
    touch.steer = s;
    knob.style.left = `${50 + s * 42}%`;
  };

  const endSteer = () => {
    touch.steer = 0;
    knob.style.left = '50%';
  };

  steer.addEventListener('pointerdown', (e) => {
    steer.setPointerCapture(e.pointerId);
    setSteer(e.clientX);
  });
  steer.addEventListener('pointermove', (e) => {
    if (e.buttons) setSteer(e.clientX);
  });
  steer.addEventListener('pointerup', endSteer);
  steer.addEventListener('pointercancel', endSteer);

  const hold = (el, key) => {
    const on = (v) => (e) => {
      e.preventDefault();
      touch[key] = v;
    };
    el.addEventListener('pointerdown', on(1));
    el.addEventListener('pointerup', on(0));
    el.addEventListener('pointercancel', on(0));
    el.addEventListener('pointerleave', on(0));
  };
  hold(gas, 'throttle');
  hold(brake, 'brake');
}
