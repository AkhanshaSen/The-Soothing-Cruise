# The Soothing Cruise

An endless, soothing coastal drive — pick a car, cruise an infinite curved highway, and watch the sky shift from day to golden hour to night.

**Play online:** [https://akhanshasen.github.io/The-Soothing-Cruise/](https://akhanshasen.github.io/The-Soothing-Cruise/)

Built with vanilla JavaScript, Three.js, and Kenney CC0 assets. No bundler required.

## What it is

Sojourn is a mood piece, not an arcade. There are no laps, rivals, or traffic lights. You pick a car, roll onto an infinite two-lane road, and let the world change around you. Cruise assist can hold a gentle line down the lane so you can watch the sky. A synthesized radio plays original stations generated in the browser.

## Features

- **Endless highway** generated as you drive: smooth curvature, elevation, and biome blends every 1.4 km.
- **Eight scenic regions** with high-contrast OpenCity-style palette — green grass left, sand and water right, dark asphalt, bright sky.
- **Kenney CC0 vehicles** — real low-poly GLB models from [Kenney Car Kit](https://kenney.nl/assets/car-kit). Run `npm run assets` to refresh packs.
- **Comfort physics** with easing steering, weight pitch/roll, handbrake drift, off-road slowdown, and optional cruise assist.
- **Cel-shaded look** — MeshToonMaterial bands and ink outlines on the player car; flat unlit terrain for reliable WebGL across browsers.
- **OpenCity-style HUD** — minimap top-right, control hints and large KM/H speed readout along the bottom bar.
- **Living sky** — day, golden hour, dawn, and night. Headlights come on at dusk.
- **Procedural radio** — Harbor FM, Pine Frequency, Paper Moon, Night Bus. Zero MP3s.
- **Keyboard, gamepad, and touch** controls (OpenCity-compatible mapping).
- **Zero-build static hosting** via native ES modules and vendored Three.js.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle | W / Up | RT |
| Brake / reverse | S / Down | LT |
| Steer | A D / Arrows | Left stick |
| Handbrake | Space | A |
| Look back | C | Y |
| Cruise assist | Q | — |
| Next / previous station | N / B | RB / LB |
| Photo-style camera | P (hold) | — |
| Reset | R | Back |
| Pause | Esc | Start |

On a phone, the left slider steers and the right pedals drive and brake.

## Run locally

Needs Node 18+ only for the tiny static server. The game itself is static files.

```bash
npm start
```

Open the printed URL (default `http://localhost:8000`).

### Live demo (GitHub Pages)

Every push to `main` deploys automatically:

**https://akhanshasen.github.io/The-Soothing-Cruise/**

First-time setup (one-time, in the repo on GitHub):

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**
2. Push to `main` (or re-run the **Deploy to GitHub Pages** workflow under Actions)

No build command — static files only. Works on Vercel / Netlify the same way (`index.html` at the root).

### 3D assets (Kenney CC0)

Player cars use GLB models from Kenney's Car Kit (included under `assets/vehicles/`). Trees, buildings, rocks, and road props come from the [OpenCity](https://github.com/Basharkhan7776/opencity) repo (also Kenney CC0):

```bash
npm run assets          # Kenney car kit zip
npm run assets:opencity # scenery GLBs from OpenCity (vegetation, city, house, forest, road)
```

License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — credit [Kenney](https://kenney.nl) appreciated but not required. OpenCity assets are mirrored under `assets/` with attribution in `assets/LICENSE-opencity.txt`. See also `assets/LICENSE-kenney.txt`.

## Project layout

```
src/
  audio/      Web Audio engine rumble, wind, and radio
  core/       input, rng, math
  render/     cel toon materials, ink outlines, renderer
  ui/         HUD, garage, touch, CSS
  vehicle/    cars, comfort physics, chase camera
  world/      biomes, highway, streaming chunks, sky
  main.js     loop and menus
```

## License

ISC. Original code and procedural audio. Three.js via CDN.
