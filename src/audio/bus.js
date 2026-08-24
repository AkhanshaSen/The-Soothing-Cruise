/** Minimal audio — never throws, never blocks the game loop. */
export const STATIONS = [
  { name: 'Harbor FM' },
  { name: 'Pine Frequency' },
  { name: 'Paper Moon' },
  { name: 'Night Bus' },
];

export class AudioBus {
  constructor() {
    this.station = 0;
    this.musicGain = 0.55;
    this.sfxGain = 0.45;
    this.started = false;
  }

  async start() {
    this.started = true;
  }

  setStation(i) {
    this.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  }

  update() {
    /* audio synthesis disabled — driving works without Web Audio */
  }
}
