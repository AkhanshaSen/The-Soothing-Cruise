/** OpenCity-style pause menu — keyboard navigation. */
export const PAUSE_ACTIONS = ['resume', 'vehicle', 'race', 'settings', 'fullscreen', 'restart'];

export const TIME_MODES = [
  { id: 'dyn30', label: 'DYNAMIC (30 MIN)', mode: 'dynamic', cycle: 30 },
  { id: 'dyn15', label: 'DYNAMIC (15 MIN)', mode: 'dynamic', cycle: 15 },
  { id: 'dyn3', label: 'DYNAMIC (3 MIN)', mode: 'dynamic', cycle: 3 },
  { id: 'dyn1', label: 'DYNAMIC (1 MIN)', mode: 'dynamic', cycle: 1 },
  { id: 'dyn8', label: 'DYNAMIC (8 MIN)', mode: 'dynamic', cycle: 8 },
  { id: 'day', label: 'ALWAYS DAY', mode: 'day' },
  { id: 'sunset', label: 'ALWAYS SUNSET', mode: 'sunset' },
  { id: 'night', label: 'ALWAYS NIGHT', mode: 'night' },
  { id: 'dawn', label: 'ALWAYS DAWN', mode: 'dawn' },
];

export const GFX_RES = [0.7, 1.0, 1.5];
export const GFX_RES_LABELS = ['0.7X', '1.0X', '1.5X'];
export const GFX_DIST = [300, 500, 700];
export const GFX_SHADOWS = [true, false];
export const GFX_SHADOW_LABELS = ['ON', 'OFF'];

export const SETTINGS_ROWS = ['resolution', 'drawDistance', 'shadows', 'timeOfDay'];

export function defaultGfx() {
  return { resIdx: 1, distIdx: 1, shadowIdx: 0, timeIdx: 2 };
}

/** Balanced phone defaults — sharp enough, still smooth. */
export function mobileDefaultGfx() {
  return { resIdx: 1, distIdx: 1, shadowIdx: 1, timeIdx: 2 };
}

function isCoarseDevice() {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  return typeof window !== 'undefined' && 'ontouchstart' in window && Math.min(screen.width, screen.height) < 900;
}

export function loadGfx() {
  const d = isCoarseDevice() ? mobileDefaultGfx() : defaultGfx();
  try {
    const raw = localStorage.getItem('roaddrive.gfx');
    if (!raw) return d;
    const s = JSON.parse(raw);
    const clampIdx = (v, n, fb) => (Number.isInteger(v) && v >= 0 && v < n ? v : fb);
    return {
      resIdx: clampIdx(s.resIdx, GFX_RES.length, d.resIdx),
      distIdx: clampIdx(s.distIdx, GFX_DIST.length, d.distIdx),
      shadowIdx: clampIdx(s.shadowIdx, GFX_SHADOWS.length, d.shadowIdx),
      timeIdx: clampIdx(s.timeIdx, TIME_MODES.length, d.timeIdx),
    };
  } catch {
    return d;
  }
}

export function saveGfx(gfx) {
  try {
    localStorage.setItem('roaddrive.gfx', JSON.stringify(gfx));
  } catch {
    /* ignore */
  }
}

function settingsValues(gfx) {
  return [
    `< ${GFX_RES_LABELS[gfx.resIdx]} >`,
    `< ${GFX_DIST[gfx.distIdx]} M >`,
    `< ${GFX_SHADOW_LABELS[gfx.shadowIdx]} >`,
    `< ${TIME_MODES[gfx.timeIdx].label} >`,
  ];
}

const LABELS = ['RESOLUTION', 'DRAW DISTANCE', 'SHADOWS', 'TIME OF DAY'];

export function updatePauseMenu(root, {
  index,
  carName,
  view = 'menu',
  settingsIndex = 0,
  gfx,
  raceIndex = 0,
  raceSetup,
} = {}) {
  const shell = root.querySelector('.oc-pause') || root.querySelector('#pause');
  const menu = root.querySelector('#pause-menu');
  const settings = root.querySelector('#pause-settings');
  const vehicle = root.querySelector('#pause-vehicle');
  const race = root.querySelector('#pause-race');
  const carEl = root.querySelector('#pause-car');
  const hintMain = root.querySelector('#pause-hint-main');
  if (carEl) carEl.textContent = carName;
  if (shell) shell.dataset.view = view;

  if (menu) {
    menu.hidden = false;
    menu.classList.toggle('hidden', view !== 'menu');
    menu.style.display = view === 'menu' ? 'block' : 'none';
    menu.querySelectorAll('li').forEach((li, i) => {
      li.classList.toggle('selected', i === index);
    });
  }
  if (hintMain) hintMain.style.display = view === 'menu' ? '' : 'none';
  if (settings) {
    settings.hidden = false;
    settings.classList.toggle('hidden', view !== 'settings');
    settings.style.display = view === 'settings' ? 'block' : 'none';
    if (view === 'settings' && gfx) {
      const vals = settingsValues(gfx);
      settings.querySelectorAll('.settings-row').forEach((row, i) => {
        row.classList.toggle('selected', i === settingsIndex);
        const val = row.querySelector('.settings-val');
        if (val) val.textContent = vals[i];
      });
    }
  }
  if (vehicle) {
    vehicle.hidden = false;
    vehicle.classList.toggle('hidden', view !== 'vehicle');
    vehicle.style.display = view === 'vehicle' ? 'block' : 'none';
  }
  if (race) {
    race.hidden = false;
    race.classList.toggle('hidden', view !== 'race');
    race.style.display = view === 'race' ? 'block' : 'none';
    if (view === 'race' && raceSetup) {
      race.querySelectorAll('.settings-row').forEach((row, i) => {
        row.classList.toggle('selected', i === raceIndex);
      });
      const lenEl = race.querySelector('#race-len-val');
      const diffEl = race.querySelector('#race-diff-val');
      if (lenEl) lenEl.textContent = `< ${raceSetup.lengthLabel} >`;
      if (diffEl) diffEl.textContent = `< ${raceSetup.diffLabel} >`;
    }
  }
}

export function cycleSetting(gfx, row, dir, { mobile = false } = {}) {
  const next = { ...gfx };
  if (row === 0) {
    // Phones: only 0.7X / 1.0X — 1.5X tanks frame rate.
    const n = mobile ? 2 : GFX_RES.length;
    next.resIdx = (next.resIdx + dir + n) % n;
  } else if (row === 1) next.distIdx = (next.distIdx + dir + GFX_DIST.length) % GFX_DIST.length;
  else if (row === 2) next.shadowIdx = (next.shadowIdx + dir + GFX_SHADOWS.length) % GFX_SHADOWS.length;
  else if (row === 3) next.timeIdx = (next.timeIdx + dir + TIME_MODES.length) % TIME_MODES.length;
  return next;
}

export function handlePauseNav(root, {
  up, down, left, right, confirm, back, index, view, settingsIndex = 0, gfx, onAction, onViewChange, onGfxChange,
  mobile = false, raceIndex = 0, raceSetup, onRaceChange, onRaceStart,
}) {
  if (view === 'menu') {
    let next = index;
    if (up) next = (index - 1 + PAUSE_ACTIONS.length) % PAUSE_ACTIONS.length;
    if (down) next = (index + 1) % PAUSE_ACTIONS.length;
    if (next !== index) {
      updatePauseMenu(root, {
        index: next,
        carName: root.querySelector('#pause-car')?.textContent,
        view,
        settingsIndex,
        gfx,
        raceIndex,
        raceSetup,
      });
      return { index: next, view, settingsIndex, raceIndex, consumed: true };
    }
    if (confirm) {
      const action = PAUSE_ACTIONS[index];
      if (action === 'settings') {
        onViewChange?.('settings');
        return { index, view: 'settings', settingsIndex: 0, raceIndex, consumed: true };
      }
      if (action === 'vehicle') {
        onViewChange?.('vehicle');
        return { index, view: 'vehicle', settingsIndex, raceIndex, consumed: true };
      }
      if (action === 'race') {
        onViewChange?.('race');
        return { index, view: 'race', settingsIndex, raceIndex: 0, consumed: true };
      }
      onAction?.(action);
      return { index, view, settingsIndex, raceIndex, consumed: true };
    }
    return { index, view, settingsIndex, raceIndex, consumed: false };
  }

  if (view === 'settings') {
    let row = settingsIndex;
    if (up) row = (settingsIndex - 1 + SETTINGS_ROWS.length) % SETTINGS_ROWS.length;
    if (down) row = (settingsIndex + 1) % SETTINGS_ROWS.length;
    if (left || right) {
      const dir = right ? 1 : -1;
      onGfxChange?.(cycleSetting(gfx, row, dir, { mobile }));
      return { index, view, settingsIndex: row, raceIndex, consumed: true };
    }
    if (back) {
      onViewChange?.('menu');
      return { index, view: 'menu', settingsIndex: row, raceIndex, consumed: true };
    }
    if (row !== settingsIndex) {
      updatePauseMenu(root, {
        index,
        carName: root.querySelector('#pause-car')?.textContent,
        view,
        settingsIndex: row,
        gfx,
        raceIndex,
        raceSetup,
      });
      return { index, view, settingsIndex: row, raceIndex, consumed: true };
    }
    return { index, view, settingsIndex: row, raceIndex, consumed: false };
  }

  if (view === 'race') {
    const rows = 3;
    let row = raceIndex;
    if (up) row = (raceIndex - 1 + rows) % rows;
    if (down) row = (raceIndex + 1) % rows;
    if ((left || right) && row < 2) {
      onRaceChange?.(row, right ? 1 : -1);
      return { index, view, settingsIndex, raceIndex: row, consumed: true };
    }
    if (confirm) {
      if (row === 2) onRaceStart?.();
      else onRaceChange?.(row, 1);
      return { index, view, settingsIndex, raceIndex: row, consumed: true };
    }
    if (back) {
      onViewChange?.('menu');
      return { index, view: 'menu', settingsIndex, raceIndex: row, consumed: true };
    }
    if (row !== raceIndex) {
      updatePauseMenu(root, {
        index,
        carName: root.querySelector('#pause-car')?.textContent,
        view,
        settingsIndex,
        gfx,
        raceIndex: row,
        raceSetup,
      });
      return { index, view, settingsIndex, raceIndex: row, consumed: true };
    }
    return { index, view, settingsIndex, raceIndex: row, consumed: false };
  }

  if (back || confirm) {
    onViewChange?.('menu');
    return { index, view: 'menu', settingsIndex, raceIndex, consumed: true };
  }
  return { index, view, settingsIndex, raceIndex, consumed: false };
}

export { LABELS };
