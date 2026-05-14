# ⬡ Alentours

A road-trip companion app designed to be read from the passenger seat — or mounted on a motorhome screen.  
Plan a route, start the GPS, and get live info about the towns you pass through.

## What it does

- **Route planning** — type an origin and destination, the app builds a road route and draws it on the map
- **GPS tracking** — follows your position in real time, draws your actual path over the planned route, shows current speed
- **Route progress** — progress bar with distance done, distance left, and percentage
- **Nearest town panel** — as you drive, shows the closest town with:
  - Wikipedia landmark thumbnail
  - Population, inhabitant names, rivers, department (+ INSEE code) and region
  - Current mayor with gender indicator (♂ / ♀)
  - Auto-scrolling Wikipedia extract for long descriptions
- **Offline-first pre-fetch** — at trip start, all towns along the route are fetched from Overpass, Wikipedia, and Wikidata and cached locally; no further network calls are needed while driving
- **Scalable UI** — font-size slider (×0.8 → ×2.0) in settings for easy reading at distance; progress and town panels scale together
- **Dark / light theme** and EN / FR language, both persisted
- **Session persistence** — closing and reopening the app resumes the trip exactly where you left off (route, GPS path, position)
- **PWA** — installable, OSM tiles and Wikipedia responses cached for offline use

## Tech stack

| Concern | Library / API |
|---|---|
| UI framework | Vue 3 + Vite |
| Map | Leaflet + OpenStreetMap tiles |
| GPS | Browser Geolocation API |
| Geocoding | Nominatim (OpenStreetMap) |
| Routing | OSRM public API |
| Nearby towns | Overpass API |
| Town descriptions | Wikipedia REST API (`/page/summary`) |
| Enriched town data | Wikidata SPARQL (`query.wikidata.org`) |
| Offline / PWA | vite-plugin-pwa + Workbox |

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a browser with geolocation support.

## Build

```bash
npm run build
npm run preview   # local preview of the production build
```

The `base: './'` in `vite.config.js` makes the build relocatable (works on GitHub Pages or any subdirectory).

## License

MIT
