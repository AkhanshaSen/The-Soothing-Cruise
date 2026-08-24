/** OpenCity-style pause menu — keyboard navigation. */
export const PAUSE_ACTIONS = ['resume', 'vehicle', 'settings', 'restart'];

const LABELS = {
  resume: 'RESUME',
  vehicle: 'CHANGE VEHICLE',
  settings: 'SETTINGS',
  restart: 'RESTART',
};

export function updatePauseMenu(root, { index, carName, view = 'menu' }) {
  const menu = root.querySelector('#pause-menu');
  const settings = root.querySelector('#pause-settings');
  const vehicle = root.querySelector('#pause-vehicle');
  const carEl = root.querySelector('#pause-car');
  if (carEl) carEl.textContent = carName;

  if (menu) {
    menu.hidden = view !== 'menu';
    menu.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('selected', i === index);
    });
  }
  if (settings) settings.hidden = view !== 'settings';
  if (vehicle) vehicle.hidden = view !== 'vehicle';
}

export function handlePauseNav(root, { up, down, confirm, back, index, view, onAction, onViewChange }) {
  if (view === 'menu') {
    let next = index;
    if (up) next = (index - 1 + PAUSE_ACTIONS.length) % PAUSE_ACTIONS.length;
    if (down) next = (index + 1) % PAUSE_ACTIONS.length;
    if (next !== index) {
      updatePauseMenu(root, { index: next, carName: root.querySelector('#pause-car')?.textContent, view });
      return { index: next, view, consumed: true };
    }
    if (confirm) {
      const action = PAUSE_ACTIONS[index];
      if (action === 'settings') {
        onViewChange?.('settings');
        return { index, view: 'settings', consumed: true };
      }
      if (action === 'vehicle') {
        onViewChange?.('vehicle');
        return { index, view: 'vehicle', consumed: true };
      }
      onAction?.(action);
      return { index, view, consumed: true };
    }
    return { index, view, consumed: false };
  }

  if (back || confirm) {
    onViewChange?.('menu');
    return { index, view: 'menu', consumed: true };
  }
  return { index, view, consumed: false };
}

export { LABELS };
