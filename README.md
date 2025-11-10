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

> **Windows PowerShell**: If you encounter script execution errors (e.g. when corporate policies block npm install hooks), launch
> an elevated PowerShell prompt once and run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. This preserves security defaults
> while allowing the local tooling scripts that ship with Electron to execute.

#### Restricted environments

- Some enterprise networks flag the public `electron` package. When that happens, set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` before
  running `npm install` and manually place an approved Electron distribution under `node_modules/electron/` (the folder structure
  expected by the launcher). Alternatively, configure `ELECTRON_OVERRIDE_DIST_URL` to point at an internally mirrored download
  endpoint.
- After installing, clear the environment variable or reinstall without it if you want `electron-builder` to fetch platform
  archives automatically.

### Run in development

```bash
npm start
```

This launches the Electron widget and starts the internal data service automatically.

### Build distributables

```bash
npm run build
```

Electron Builder is configured with defaults and can be customised via `electron-builder` options if packaging for Windows.

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
