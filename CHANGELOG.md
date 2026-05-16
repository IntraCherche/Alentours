# Changelog

## [1.4.1] — 2026-05-16

### Changed
- **"City only" filter** now searches 80 km wide (cities are visible from far away and are sparse enough that 15 km would almost never find one). Switching to this mode triggers an immediate re-fetch; switching back resets the throttle so normal towns reload instantly.
- **"Town & city" filter** candidate pool changed: `nearestFromCache` now returns all places within range without slicing, and the live path buckets results by place rank (up to 5 per rank) before merging — so towns and cities are never crowded out by a wall of nearby villages.

### Fixed
- "Town & city" and "City only" filters showed a blank aside panel in rural areas where many hamlets are closer than the nearest town or city.
- "City only" filter was returning cities from a previous route's prefetch cache regardless of distance (e.g. Toulouse appearing from Roscoff, 700 km away). An 80 km radius cap is now applied to the cache lookup before falling through to a live query.
- "City only" filter now shows **"No city in sight"** instead of going blank when no city is within 80 km.

---

## [1.4.0] — 2026-05-16

### Added
- **Multi-trip tab bar**: manage several trip legs simultaneously with only one active at a time. A compact tab bar appears between the header and the map once the first trip is started, showing each leg's destination and live progress percentage. Tabs support one-tap switching, creating a new leg (+), and permanent deletion (×).
- Switching trips instantly saves the current GPS path, progress, and towns cache, then restores the selected trip's full state — no re-prefetch required since Wikidata/Wikipedia enrichment is already in the persistent IndexedDB cache.
- Existing sessions are automatically migrated into the trips list on first load after the update.

---

## [1.3.1] — 2026-05-16

### Added
- **Cache mode** setting in Travel Settings: choose between *No cache* (live lookups only), *Balanced* (6 km corridor pre-fetched at trip start), or *Offline use* (25 km corridor, full download). Default is Balanced.
- **Persistent IndexedDB wiki cache** (`useWikiCache.js`): Wikipedia and Wikidata data is stored across sessions so towns are instantly enriched on revisit without any network request.
- **Elapsed time** shown in the pre-fetch progress bar (e.g. `18% · 4 s — downloading…`).

### Changed
- **Overpass pre-fetch** now uses a single bounding-box query instead of N union-circle queries, avoiding the server-side 25 s timeout and dramatically reducing pre-fetch time on long routes.
- **Wikipedia fetching** switched from individual REST summary calls to the MediaWiki Action API batch endpoint (up to 20 towns per request), with a coordinate-based geo-search fallback for disambiguation pages or name mismatches.
- Pre-fetch now skips towns already present in the persistent IDB cache, so repeated trips over the same area do not re-download anything.

### Fixed
- Hamburger menu dropdown no longer appears hidden behind the map (z-index raised to 800, above Leaflet's popup pane at 700).

---

## [1.3.0] — 2026-05-16

### Added
- **Driven distance** cell in the speed row showing the actual distance covered along the GPS track (odometer), independent of the straight-line route projection.

### Changed
- **Route progress** now uses straight-line (as-the-crow-flies) projection instead of OSRM road routing. Progress only advances when moving toward the destination, unaffected by perpendicular movement. Town pre-fetching samples points along the straight line between origin and destination. Removes the dependency on the external OSRM routing API.

---

## [1.2.0] — 2026-05-16

### Added
- **Min. time per city** setting in Travel Settings: lock the nearby-city panel for a chosen duration (Immediate / Quick 30 s / Normal 1 min / Relaxed 2 min / Slow 5 min) so the display and TTS don't change before the user has had time to read or hear the announcement. Default is Relaxed (2 min).
- **Show nearby** filter in Travel Settings: limit the nearby-city panel to a minimum place type — All (village, town, city) / Town & city / City only.
- **Distance units** setting in Travel Settings: switch all distances and speeds between metric (km, km/h) and imperial (mi, mph). Defaults to metric.

---

## [1.1.1] — 2025

### Added
- Gear icon in the welcome message is now a clickable button that opens Travel Settings directly.

### Changed
- Default language set to French.

### Fixed
- Town fact rows aligned with CSS grid.

---

## [1.1.0] — 2025

### Added
- Town nickname displayed in the fact rows (from Wikidata `skos:altLabel`).

### Changed
- Reworked TTS announcement: includes department, region, direction, and nickname.

---

## [1.0.0] — 2025

### Added
- Nearby town detection via Overpass API with pre-fetch along planned route.
- Town enrichment from Wikidata: population, elevation, department, region, rivers, demonyms, coat of arms, nickname, Wikipedia extract.
- TTS announcements when the nearest town changes.
- Directional arrows (left / right / ahead / behind) relative to vehicle heading.
- Route planning via OSRM with progress bar, speed panel, and ETA.
- Auto-scrolling aside panel (portrait and landscape).
- Responsive layout: progress stats in top bar.
- Hamburger menu with Travel Settings drawer, theme toggle, TTS toggle, About modal.
- Adjustable town info font size.
- Vehicle icon picker.
- PWA support (installable, offline-capable).
- English / French localisation.
