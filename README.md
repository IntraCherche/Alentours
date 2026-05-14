# ⬡ RoadDash — Motorhome Ambient Dashboard

An open-source ambient display for motorhome passengers.  
Shows live position, route progress, and nearby town info on a TV via Chromecast tab casting.

## Features

- 🗺️ **Live map** — OpenStreetMap, dark-themed, auto-follows position
- 📊 **Route progress bar** — load a GPX, see how far you've come and how far to go
- 🏘️ **Nearest towns** — Overpass API + Wikipedia, auto-refreshed as you drive
- ↔️ **Left / right indicator** — tells passengers which side of the road a town is on
- 📡 **Zero-server** — BroadcastChannel between sender and receiver tabs, no backend needed
- 📲 **PWA** — installable, works offline (map tiles cached after first use)

## Tech Stack

- Vue 3 + Vite + Vue Router
- `gpxparser` for GPX parsing
- Leaflet for maps (OpenStreetMap tiles)
- Overpass API for nearby POIs
- Wikipedia REST API for town descriptions
- BroadcastChannel API for sender → receiver sync
- `vite-plugin-pwa` for service worker + offline support

## Setup

```bash
npm install
npm run dev
```

Open two browser tabs:
- **Sender** → `http://localhost:5173/#/sender` (on your phone)
- **Receiver** → `http://localhost:5173/#/receiver` (cast this tab to the TV)

## Deploy to GitHub Pages

```bash
npm run build
# Push the dist/ folder to your gh-pages branch
```

Set `base: './'` is already configured in `vite.config.js`.

## How Casting Works (no Cast SDK needed)

1. Open the **Sender** URL in Chrome on your Android phone
2. Open the **Receiver** URL in Chrome on any device connected to the same Wi-Fi
3. In Chrome on the receiver device, tap ⋮ → Cast → select your Chromecast
4. Both tabs communicate via `BroadcastChannel` (same origin)

No Google Cast SDK registration needed. No fees.

## Roadmap

- [ ] Wikipedia language auto-detected from locale
- [ ] Bearing-to-next-waypoint arrow
- [ ] Elevation profile
- [ ] Google Cast SDK proper integration (background casting)
- [ ] Dark/light theme toggle for daytime use

## License

MIT
