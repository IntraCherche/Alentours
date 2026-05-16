# Changelog

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
