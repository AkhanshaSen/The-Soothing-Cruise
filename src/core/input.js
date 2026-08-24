const keys = new Set();

export const touch = {
  steer: 0,
  throttle: 0,
  brake: 0,
};

let gamepadIndex = null;

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

window.addEventListener('gamepadconnected', (e) => {
  gamepadIndex = e.gamepad.index;
});
window.addEventListener('gamepaddisconnected', () => {
  gamepadIndex = null;
});

export function key(code) {
  return keys.has(code);
}

function pad() {
  if (gamepadIndex == null || !navigator.getGamepads) return null;
  return navigator.getGamepads()[gamepadIndex];
}

export function readInput() {
  const gp = pad();
  let steer = 0;
  let throttle = 0;
  let brake = 0;
  let handbrake = 0;
  let lookBack = false;
  let reset = false;
  let pause = false;
  let cruise = false;
  let radioNext = false;
  let radioPrev = false;

  if (key('KeyA') || key('ArrowLeft')) steer -= 1;
  if (key('KeyD') || key('ArrowRight')) steer += 1;
  if (key('KeyW') || key('ArrowUp')) throttle = 1;
  if (key('KeyS') || key('ArrowDown')) brake = 1;
  if (key('Space')) handbrake = 1;
  lookBack = key('KeyC');
  reset = key('KeyR');
  cruise = key('KeyQ');

  steer += touch.steer;
  throttle = Math.max(throttle, touch.throttle);
  brake = Math.max(brake, touch.brake);

  if (gp) {
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer += ax;
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    throttle = Math.max(throttle, rt);
    brake = Math.max(brake, lt);
    if (gp.buttons[0]?.pressed) handbrake = 1;
    if (gp.buttons[3]?.pressed) lookBack = true;
    if (gp.buttons[8]?.pressed) reset = true;
    if (gp.buttons[9]?.pressed) pause = true;
    if (gp.buttons[4]?.pressed) radioPrev = true;
    if (gp.buttons[5]?.pressed) radioNext = true;
  }

  steer = Math.max(-1, Math.min(1, steer));
  return {
    steer,
    throttle,
    brake,
    handbrake,
    lookBack,
    reset,
    pause,
    cruise,
    radioNext,
    radioPrev,
    photo: key('KeyP'),
    pauseKey: key('Escape'),
  };
}

export function consumeEdge() {
  return {
    pause: key('Escape'),
    reset: key('KeyR'),
  };
}
