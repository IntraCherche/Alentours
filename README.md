# <img src="public/icons/icon-192.png" width="40" alt=""> Alentours

You're cruising down the motorway and a city skyline appears on the horizon — but is it to your left or your right? Is that Lyon, Valence, or something else entirely? You can't check your phone, your co-pilot isn't sure, and the motorway sign already flashed past. That small frustration inspired this app.

**Alentours** is a road-trip companion that tells you, in real time, which town is nearby and exactly where it sits relative to your vehicle — left, right, straight ahead, or behind — so you always know what you're looking at through the window.

Designed to be glanced at from the passenger seat or mounted on a motorhome screen.

**[Try it live on GitHub Pages →](https://intracherche.github.io/Alentours/)**

## What it does

- **Directional awareness** — large arrows (⬅ ➡ ⬆ ⬇) flank the town name and show at a glance where the town sits relative to your heading; color-coded by direction
- **Multi-leg trips** — plan several legs of a journey and switch between them with a tab bar; each leg saves its own GPS path, progress, and towns cache; only one leg is active at a time
- **Route planning** — type an origin and destination; the actual driving route is fetched via OSRM (with straight-line fallback if unavailable), drawn on the map as a road-following polyline, and used for accurate distance done/left, ETA, and town corridor pre-fetching
- **GPS tracking** — follows your position in real time, draws your actual path over the planned route, shows current and average speed
- **Route progress** — progress bar with distance done, distance left, ETA and percentage
- **Nearest town panel** — as you drive, shows the closest town with:
  - Coat of arms (blason) fetched from Wikidata, shown next to the town name
  - Wikipedia landmark thumbnail
  - Nickname (e.g. "La Ville Rose"), population, altitude, inhabitant names, rivers, department (+ INSEE code) and region
  - Current mayor with gender indicator (♂ / ♀)
  - Auto-scrolling Wikipedia fun-fact: the last interesting paragraph of the intro, with administrative boilerplate and award/ranking copy filtered out
- **Place-type filter** — three modes: *All* (village, town, city), *Town & city* (hides hamlets), or *City only* (searches up to 80 km so a city skyline on the horizon is always identified; shows "No city in sight" when none is within range)
- **Offline-first pre-fetch** — at trip start, all towns along the route are fetched from Overpass, Wikipedia, and Wikidata and cached locally; no further network calls are needed while driving; enrichment data is stored permanently in IndexedDB so revisited towns are instant
- **Scalable UI** — font-size slider (×0.8 → ×2.0) in settings for easy reading at distance; progress and town panels scale together
- **Voice announcements (TTS)** — when a new town is detected, a natural-language sentence is spoken: town name, department, region, direction, nickname, approximate altitude and population (e.g. "Ce village est situé à 320 m d'altitude et compte environ 460 habitants"); an optional setting also reads the Wikipedia fun-fact aloud
- **Map follow zoom** — choose in Display settings whether the map tracks the vehicle while moving; seven zoom levels from a broad regional view down to street level, or keep the default full-route overview where start and destination are always visible
- **Demo mode** — hidden easter egg for simulating a drive along a planned route without GPS
- **Dark / light theme** and EN / FR language, both persisted
- **Session persistence** — closing and reopening the app resumes the trip exactly where you left off (route, GPS path, position)
- **PWA** — installable on Android and iOS (16.4+), OSM tiles and Wikipedia responses cached for offline use; on iOS a one-time banner reminds the user to disable Auto-Lock while driving

## Tech stack

| Concern | Library / API |
|---|---|
| UI framework | Vue 3 + Vite |
| Map | Leaflet + OpenStreetMap tiles |
| GPS | Browser Geolocation API |
| Geocoding | Nominatim (OpenStreetMap) |
| Route geometry & progress | OSRM (router.project-osrm.org) with haversine fallback |
| Nearby towns | Overpass API |
| Town descriptions | MediaWiki Action API (batch, with geo-search fallback) |
| Enriched town data | Wikidata SPARQL (`query.wikidata.org`) |
| Wiki cache | IndexedDB (permanent, cross-session) |
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
