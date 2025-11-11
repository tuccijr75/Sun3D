# Sun3D Pro

A production-ready Electron widget that renders a live 3D Sun with a compact telemetry HUD, backed by a resilient local data service. The widget is transparent, always-on-top by default, and ships with hooks for hologram streaming and future distribution paths.

## Features

- **Live 3D globe** rendered with Three.js using EUV textures (SUVI/SDO with automatic fallbacks).
- **Data-driven visuals** that respond to X-ray flux, Kp index, solar wind, and Bz metrics.
- **Active-region overlays** mapped from NOAA region feeds.
- **Compact HUD** providing key metrics, alert summaries, CME risk, and planetary positions.
- **Configurable widget** with quick controls for view/source/band/side modes and an inline configuration panel.
- **Local data backend** (Express) exposing `/snapshot`, `/alerts`, `/cme`, `/planets`, and `/markers` JSON endpoints.
- **Hologram bridge stubs** prepared for LAN/WebRTC streaming without affecting the core widget when unused.

## Getting Started

### Requirements

- Node.js 18 or newer (Electron 28 ships with Node 18).<br>
- npm 8+.

### Install

```bash
npm install
```

The default install grabs only the runtime dependencies (`express`, `electron-store`, `three`, `ws`). Electron and
`electron-builder` are listed as optional/peer dependencies so that a locked-down environment can skip them during the initial
bootstrap.

> **Windows PowerShell**: If you encounter script execution errors (e.g. when corporate policies block npm install hooks), launch
> an elevated PowerShell prompt once and run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. This preserves security defaults
> while allowing the local tooling scripts that ship with Electron to execute.

#### Restricted environments

- Mirror or sideload the core npm packages if outbound registry calls are blocked. Each dependency can be installed from a vetted
  tarball via `npm install <path-to-tarball>`.
- Provide an Electron runtime separately:
  1. Download/approve an Electron build that matches the `>=28` peer requirement.
  2. Place the unpacked binary under `vendor/electron/` (see `scripts/run-electron.js` for the expected filenames) **or** expose the
     executable path through `ELECTRON_PATH`.
  3. Optional: install the npm package later with `npm install electron --save-dev` once registry access is restored.
- `electron-builder` is also optional. When packaging, install it ad-hoc (`npm install electron-builder --save-dev`) or provide an
  offline mirror and re-run `npm run build`.

### Run in development

```bash
npm start
```

The launcher resolves `electron` from your local install, an approved `vendor/electron` binary, or an `ELECTRON_PATH` override. If
no executable can be found the script exits with guidance instead of a cryptic module error. The main process starts the data
service automatically.

### Build distributables

```bash
npm run build
```

If `electron-builder` is unavailable the helper script prints instructions for supplying it; once installed it executes the
standard Electron Builder CLI so you can customise configuration as needed for Windows packaging.

## Application Structure

```
.
├── app/                 # Renderer assets (HTML, CSS, JS, Three.js bridge)
│   ├── index.html
│   ├── scripts/renderer.js
│   ├── styles/{reset,layout}.css
│   └── vendor/three.module.js
├── backend/             # Data service and fetch utilities
│   ├── services/dataService.js
│   ├── services/solarSources.js
│   └── utils/{cache,net}.js
├── hologram/            # Future network streaming bridge
├── main.js              # Electron entry point
├── preload.js           # Secure bridge (contextIsolation=true)
├── scripts/             # Launch helpers for Electron and electron-builder
├── package.json
└── README.md
```

## Renderer Overview

- Transparent, frameless 280×280 window by default. Drag the widget from the translucent top strip.
- 3D sphere responds to:
  - View modes: `norm`, `hot`, `diff` (difference/emissive highlighting).
  - Source modes: `auto`, `suvi`, `sdo` (persisted per session).
  - Band presets: `auto`, `171`, `193`, `304`.
  - Side modes: `near`, `far`, `mix` (future use – persisted and sent to backend).
- HUD (right dock) is text-only and lists metrics, alerts, CME summary, and a mini solar system canvas.
- Config panel (`cfg` link) toggles advanced settings:
  - Window width/height, FPS target, field-of-view.
  - Always-on-top toggle.
  - Hologram preset, streaming toggle, WebRTC toggle.
  - Settings persist via `electron-store`.

## Data Service

The Express server is started automatically by `main.js` on a random local port (loopback only). Endpoints:

- `GET /snapshot`
  - Returns `{ generatedAt, images, metrics, pulse, markers }`.
  - `images` includes `nearNow`, `nearPrev`, `far` URLs (with data URI fallbacks).
  - `metrics` include `xrayClass`, `kp`, `vsw`, `bz`, `stamp`, and `pulse`.
  - `pulse` is a normalised 0–1 severity signal.
  - `markers` array of `{ lat, lon, strength }` for active regions.
- `GET /alerts`
  - Array of `{ text, level, source }` summarising NOAA alerts/watches.
- `GET /cme`
  - Array of `{ severity, etaHours, earthDirected, target, impactSummary }`.
- `GET /planets`
  - Array of `{ name, a, angleRad }` with heliocentric positions computed from J2000 orbital elements.
- `GET /markers`
  - Mirrors the marker subset for overlays.

Each endpoint caches responses with configurable TTLs and survives transient upstream outages via sensible fallbacks. All network errors are logged server-side without crashing the renderer.

### Data Sources & Fallbacks

- **EUV imagery:** NOAA SUVI (195/193/171 Å) with automatic fallback to SDO AIA imagery and finally an embedded SVG texture if remote sources fail.
- **Metrics:** NOAA GOES X-ray flux, planetary K index, DSCOVR solar wind (plasma & magnetic field). Missing data defaults to nominal quiet-sun values.
- **Alerts/CME:** NOAA SWPC JSON feeds with graceful degradation to empty arrays when unavailable.
- **Markers:** NOAA active region JSON/text feeds; fallback seeds basic active regions.
- **Planets:** Calculated on-device from NASA J2000 orbital elements (Keplerian solution).

## Hologram & Streaming Bridge

`hologram/hologramBridge.js` exposes:

- `setPreset(preset)` – records hologram layout (off/front/cross).
- `toggleStreaming(on)` – starts/stops a frame pump that samples `/snapshot` for future LAN/WebRTC distribution.
- `toggleWebRTC(on)` – placeholder for WebRTC pipeline activation.
- Logging is centralised; no-op when disabled to avoid impacting the widget.

Extend this module to integrate WebSocket or WebRTC broadcast mechanisms. The renderer exposes `setHologramPreset`, `setHoloStreaming`, and `toggleWebRTC` bridge methods so UI additions can trigger the bridge safely.

## Security Notes

- Renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
- All renderer-to-main communication flows through the curated `sunAPI` surface in `preload.js`.
- CSP disallows inline scripts; all scripts are module-based.
- Remote fetches are handled in the main process/service to shield the renderer from TLS/HTTP issues.

## Troubleshooting

- **Blank textures:** Check logs for blocked EUV URLs; the widget auto-falls back to an embedded placeholder if remote sources are unavailable.
- **Data gaps:** The backend caches responses for 5 minutes. Force refresh by restarting the app or by clearing the cache logic inside `backend/services/dataService.js`.
- **Rendering performance:** Adjust FPS and quality via the config panel; lowering FPS reduces GPU usage on low-power systems.

## Extending

- Add more HUD rows or visual overlays by editing `app/scripts/renderer.js` and `app/index.html`.
- Integrate additional endpoints or telemetry sources in `backend/services/solarSources.js` and expose them via Express + the preload bridge.
- Flesh out hologram/WebRTC broadcasting inside `hologram/hologramBridge.js`.

## License

MIT
