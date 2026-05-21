# <img src="public/icons/icon-192.png" width="40" alt=""> Alentours

You're cruising down the motorway and a city skyline appears on the horizon — but is it to your left or your right? Is that Lyon, Valence, or something else entirely? You can't check your phone, your co-pilot isn't sure, and the motorway sign already flashed past. That small frustration inspired this app.

**Alentours** is a road-trip companion that tells you, in real time, which town is nearby and exactly where it sits relative to your vehicle — left, right, straight ahead, or behind — so you always know what you're looking at through the window.

Designed to be glanced at from the passenger seat or mounted on a motorhome screen.

**[Try it live on GitHub Pages →](https://intracherche.github.io/Alentours/)**

## What it does

- **Route progress with ETA** — a progress bar tracks distance done, distance left, and your estimated time of arrival so everyone in the car knows how far the next stop is
- **Town details as you drive** — as you pass through or near a town, the app shows its coat of arms, a Wikipedia photo, nickname, population, altitude, mayor, and a fun-fact pulled from Wikipedia; large directional arrows tell you instantly whether the town is to your left, right, or straight ahead
- **Sightseeing mode** (🚶) — on foot in a city, switch to pedestrian mode and the app queries Wikidata for monuments, museums, churches, and castles within 500 m, pinning each one on the map so you always know what's around the corner
- **Voice announcements** — each new town or point of interest is read aloud so the driver keeps eyes on the road and the kids in the back stay entertained
- **Offline mode** — a cache setting lets you pre-download all towns and Wikipedia content before departure; once done, the app works fully without any network signal — designed so that kids can use it on their own devices without needing a mobile data plan

## Tech stack

| Concern | Library / API |
|---|---|
| UI framework | Vue 3 + Vite |
| Map | Leaflet + OpenStreetMap tiles |
| GPS | Browser Geolocation API |
| Geocoding & reverse geocoding | Nominatim (OpenStreetMap) |
| Route geometry & progress | OSRM (router.project-osrm.org) with haversine fallback |
| Nearby towns | Overpass API |
| Nearby POIs (foot mode) | Wikidata SPARQL `wikibase:around` service |
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

## Security

- **Content Security Policy** — a strict CSP `<meta>` tag whitelists every external origin (OSM, Nominatim, Overpass, OSRM, Wikipedia, Wikidata) and blocks everything else.
- **API response validation** — all data from Wikipedia and Wikidata is type-checked, length-capped, and URL-validated before use.
- **No secrets** — all APIs used are free and public; no API keys are present in the source.

## License

MIT
