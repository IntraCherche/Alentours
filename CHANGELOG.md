# Changelog

## [1.5.21] — 2026-05-20

### Added
- **Demo mode for sightseeing (foot) mode** — the demo unlock and toggle now appear in both car and foot modes. In foot mode, enabling demo reveals a configuration form in the Trip panel: a start-location picker, a speed slider (3–30 km/h), a walk-length slider (200 m – 5 km), and a 3×3 compass rose to pick the walking direction. Tapping Start fetches a real OSRM pedestrian route toward the chosen bearing, then walks it back in reverse — triggering landmark discovery along the way exactly as real GPS would. Pause, resume, replay and stop controls appear while the demo is running. All parameters (length, bearing) are persisted across sessions.
- **Offline download radius label clarified** — the setting now reads "Offline download radius — sightseeing (km)" to make clear it only applies to foot/sightseeing mode.

---

## [1.5.20] — 2026-05-20

### Changed
- **Trip panel promoted to top-level menu entry** — Trip planning and GPS controls are now a direct "🗺 Trip" entry in the hamburger menu instead of a tab inside the settings drawer. The travel-mode toggle (Car / Sightseeing) sits at the top of that panel, replacing the old separate foot-mode menu item. The settings drawer now contains only Display, Audio, and Advanced tabs.
- **City display timing simplified to Immediate / Automatic** — The old numeric min-time options are replaced by two modes: Immediate (switch instantly) and Automatic (wait for TTS to finish, then apply a 1.5 s gap; falls back to 60 s when voice is off). Old numeric localStorage values are migrated to Automatic.
- **TTS sub-settings greyed out when voice is disabled** — Description reading and verbosity controls are now visually disabled when TTS is off, making it clear they have no effect.
- **Per-mode settings for map zoom and city timing** — `mapFollowZoom` and `nearbyMinDuration` are now saved and restored independently for car mode and foot mode. Switching modes no longer overwrites the other mode's preferences; each mode remembers its own zoom level and city display timing. Existing values are preserved as the initial default for both modes on first upgrade.

---

## [1.5.19] — 2026-05-19

### Added
- **"New walk" button in foot mode** — opening the Trip settings tab while a walk is in progress now shows an "Active walk" section with a "🔄 New walk" button. Pressing it clears the drawn path on the map and resets announced landmarks so the next walk starts fresh. The existing "Start walk" button also now clears any previous path before beginning.

---

## [1.5.18] — 2026-05-19

### Fixed
- **TTS `synthesis-failed` / engine corruption** — Repeated `not-allowed` errors throughout a dev session left Chrome's speech synthesis engine in a corrupted state. Two fixes: (1) `speechSynthesis.cancel()` is now called at module init to wipe stale state on every page load or HMR hot-reload; (2) the first-ever speak call (from the gesture unlock handler) is now synchronous — no `setTimeout` — which properly establishes Chrome's sticky activation and prevents the `not-allowed` → corruption chain.

---

## [1.5.17] — 2026-05-19

### Fixed
- **TTS `not-allowed` on Android/Chrome (root cause)** — GPS watchers fire before the user has tapped anything; calling `speechSynthesis.speak()` from a non-gesture context immediately returns `not-allowed`. The fragile silent-primer approach is replaced by a queue-and-flush strategy: GPS announcements are queued until the first user gesture, then spoken directly inside the gesture handler which grants Chrome "sticky activation" for the rest of the session. All subsequent GPS calls work without needing a gesture context.

### Added
- **"Test voice" button** in Audio settings — lets you verify TTS is working and also serves as the gesture unlock on first use.

---

## [1.5.16] — 2026-05-19

### Fixed
- **TTS `synthesis-failed` regression from v1.5.15** — The primer introduced in 1.5.15 had two defects that caused every real announcement to fail with `synthesis-failed`: (1) the primer utterance was a local variable and got GC'd by Chrome mid-synthesis, corrupting the engine's internal state; (2) `' '` (space) is treated as empty text by some engines and fails immediately. Both are fixed: the utterance is now held at module scope (like `_activeUtt`) and uses `'.'` instead of a space. Additionally, `speechSynthesis.cancel()` is now called in the primer's `onend`/`onerror` to flush any residual engine error state before the first real announcement — which is what caused the visible symptom (`speaking=false pending=false` yet `speak()` still failing).

---

## [1.5.15] — 2026-05-19

### Fixed
- **TTS `not-allowed` on Chrome / Chromium** — Chrome requires `speechSynthesis.speak()` to have been called at least once *within* a user gesture before it allows calls from non-gesture contexts (GPS events, timers). Every automatic town/POI announcement was blocked with a `not-allowed` error. The fix registers a one-shot capturing listener (`click` / `touchstart` / `keydown`) on `document` at module load; the first user interaction speaks a zero-volume space, satisfying Chrome's activation requirement for the rest of the page session.

---

## [1.5.14] — 2026-05-19

### Changed
- **Removed OSRM route timeout setting from Advanced** — 15 s is reliable enough that the knob added no value; the value is now hardcoded. The timeout toast (straight-line fallback notice) is kept but no longer references Advanced settings.

### Added
- **Clear cache button in Advanced settings** — tapping shows an inline confirmation row; confirming deletes the `alentours-wiki` IndexedDB (Wikipedia extracts + POI data) and shows a brief "Cache cleared" toast. Useful when cached data is stale or corrupt.

---

## [1.5.13] — 2026-05-19

### Fixed
- **Foot mode TTS silent on first announcement** — `speechSynthesis.cancel()` was called unconditionally before every `speak()`, even when nothing was queued. On Chrome/Android, cancelling an idle synthesis corrupts its internal state so the next `speak()` is silently swallowed. Foot-mode POI announcements are typically the first TTS call on the page (nothing previously speaking), so they hit this every time. The fix skips `cancel()` when `!ss.speaking && !ss.pending` and calls `ss.speak()` directly. Also keeps a module-level reference to the `SpeechSynthesisUtterance` to prevent premature GC before the 50 ms deferred speak fires.

---

## [1.5.12] — 2026-05-19

### Added
- **POI map marker in foot mode** — when a nearby POI is announced, a purple dot with a permanent name label is placed on the map at the POI's exact coordinates, so the user can immediately see which direction to look without needing an external map app. The marker is replaced when the nearest POI changes and removed when exiting foot mode.

---

## [1.5.11] — 2026-05-19

### Fixed
- **Demo mode: display state reset on each run** — starting or replaying a demo now clears `displayedNearest`, resets `lastDisplayChange` to zero, cancels any pending timer, resets the town-fetch throttle, and clears the TTS announcement history. Without this, replaying within the min-display window caused the first town to be timer-delayed, which then chained into each subsequent town getting its own timer cycle — reproducing the sequential city accumulation that the 1.5.10 fix addressed for real-mode GPS.

## [1.5.10] — 2026-05-19

### Fixed
- **Min. display time no longer queues transient cities** — every GPS fetch replaces the towns array with new object references, causing the watch on `nearest` to fire on every GPS tick even when the same town was already displayed. After the lock timer fired and showed city C4, the very next GPS update (same C4, new ref) restarted a fresh timer, which then showed C5, C6, etc. in order long after they had been passed. The fix adds an early-return guard when `nearest.id === displayedNearest.id`, so the timer is only started when the actual nearest town changes. GPS jitter that briefly returns to the displayed town now also cancels any pending switch. The timer callback calls `tryUpdateDisplayedNearest` recursively so it always shows whoever is *currently* nearest when the lock expires, not a captured snapshot.

---

## [1.5.8] — 2026-05-18

### Fixed
- **Car trip sections hidden in foot mode** — the "Active trip" and "Pre-fetching towns" sections in the Trip tab were missing a `!footMode` guard, so switching from car mode to foot mode while a route was loaded left those car-specific panels visible. Both sections now hide when foot mode is active.

---

## [1.5.7] — 2026-05-18

### Fixed
- **Map zoom oscillation in foot mode** — `updateMap` was calling `map.setView` with a hardcoded zoom of 12 on every GPS fix when no route polyline exists (always the case in foot mode). The `effectivePosition` watcher then immediately called `setView` again with the user's follow zoom, causing two competing animations on every tick. The redundant `setView` inside `updateMap` has been removed; the watcher is the sole authority on map position and zoom.

---

## [1.5.6] — 2026-05-18

### Fixed
- **About is now the last menu entry** — the *About* item was moved after *Lock screen* so it sits at the bottom of the menu.

---

## [1.5.5] — 2026-05-18

### Fixed
- **Map zoom no longer oscillates on Android** — the `ResizeObserver` on the map container was unconditionally calling `fitBounds` (overview zoom) on every resize, including Android browser chrome toggling. It now only resets zoom in overview mode; in follow mode it calls `invalidateSize` only.

---

## [1.5.4] — 2026-05-18

### Fixed
- **Foot mode panel now manually scrollable** — the description panel in sightseeing mode overflows with a scrollbar instead of auto-scrolling, so the user can read at their own pace.

---

## [1.5.3] — 2026-05-18

### Added
- **Pocket lock** — a 🔒 *Lock screen* entry in the top-bar menu covers the screen with a full-screen touch-blocking overlay so the phone can be pocketed without accidental taps. The unlock gesture (swipe up, or hold 1.5 s) is configurable in the Advanced settings tab and defaults to swipe.
- **Screen Wake Lock** — GPS tracking now requests the Screen Wake Lock API on start, keeping the screen on while driving. The lock is re-acquired automatically if the OS releases it (e.g. after returning from another app).

### Fixed
- **Pocket lock button always visible** — the lock button now appears in the menu regardless of GPS state; previously it was hidden until GPS was started.

---

## [1.5.2] — 2026-05-18

### Fixed
- **Route geometry lost on page refresh** — the OSRM polyline is now saved to both the session snapshot and the trip record, and restored on reload. Previously `routePoints` and `routeMode` were never persisted, so the map always fell back to a straight line between A and B after a refresh.

---

## [1.5.1] — 2026-05-18

### Fixed
- **Foot mode language refresh** — switching language while in sightseeing mode now immediately clears the POI cache and re-fetches landmarks in the new language. Previously the throttle prevented re-querying until the user moved 100 m.

---

## [1.5.0] — 2026-05-18

### Added
- **Sightseeing / foot mode** — a new mode toggled from the top-bar menu (🚶) switches the app from road-trip tracking to pedestrian exploration:
  - Queries Wikidata via SPARQL (`wikibase:around`) for cultural POIs within 500 m: monuments, museums, churches, castles, archaeological sites, bridges, cemeteries, and more (18 Wikidata types).
  - Enriches POIs that have a Wikipedia sitelink with their full intro extract and thumbnail via the MediaWiki API.
  - Shows the nearest POI in the main panel with name, distance, image, short description, and Wikipedia extract.
  - TTS announces each new POI; a verbosity setting (Audio tab) controls whether the announcement is brief (name only), normal (one sentence), or full (complete extract).
  - Throttled to 1 SPARQL call per 100 m moved or 60 s elapsed to avoid hammering the endpoint.
  - Foot mode state is persisted to `localStorage`.
- **TTS per-session deduplication** (`useTTS`) — `shouldAnnounce` / `markAnnounced` / `clearAnnounced` replace the single `lastAnnouncedTownId` variable. A town or POI is not re-announced for 2 hours, preventing repeated speech in traffic jams or when walking back past a monument. The cooldown map is cleared when a trip is reset or a new one is started.
- **OSRM timeout setting** — an *Advanced* settings field lets the user choose the route-fetch timeout (5–120 s, default 15 s). A red toast appears when the timeout fires and the app falls back to crow-fly distance.
- **"Use my location" button** — a small ⊕ button next to the *From* label in the trip planner fills the origin field with the device's current position (reverse-geocoded via Nominatim). Uses the live GPS position if already running; otherwise fires a one-shot `getCurrentPosition`.

### Changed
- Top-bar route name replaced by "🚶 Sightseeing" label when foot mode is active.
- Progress bar hidden in foot mode (irrelevant without a planned route).
- GPS settings section is now visible in foot mode even without a loaded route.
- `clearAnnounced()` is called on trip reset and new-trip creation to avoid stale suppressions carrying over.

---

## [1.4.16] — 2026-05-18

### Added
- **Full address input** — the From and To fields in the trip planner now accept and resolve complete addresses (street + house number), not just city names. Nominatim results include `addressdetails=1`; the label formatter prefers `house_number + road` when present.

---

## [1.4.15] — 2026-05-18

### Added
- **Invert route button** — a ⇅ button between the From and To fields in the Plan Trip section swaps origin and destination in one tap. Both the resolved place and the query text are exchanged; the swapped state is persisted so a page reload keeps the inverted route.

---

## [1.4.14] — 2026-05-17

### Added
- **Persistent data-sharing notice** — two permanent, always-visible notices explain which third-party services receive the device's location:
  - **About modal** (☰ → ⓘ) — a "Data & Privacy" section lists OpenStreetMap, Wikipedia & Wikidata, and OSRM with a one-line description of what each service receives, plus a note that no data is stored server-side.
  - **Settings → GPS section** — a one-line caption below the *Start GPS* button names the three services, shown every time the control is in view.

---

## [1.4.13] — 2026-05-17 🔒 Security audit

This release is the result of a full security audit of the codebase. No critical exploits were found, but several hardening measures have been applied across the stack.

### Security

- **Content Security Policy** — a strict CSP `<meta>` tag is now present in `index.html`. It whitelists every external origin the app legitimately contacts (OSM tiles, Nominatim, Overpass, OSRM, Wikipedia, Wikidata) and blocks scripts, objects, frames, and images from any unlisted domain. This closes the most impactful injection surface.
- **Privacy notice** — a first-launch modal (FR / EN) now informs the user that their approximate GPS position is shared with OpenStreetMap, Wikipedia / Wikidata, and OSRM. GPS cannot be started — automatically on session restore or manually via the *Start GPS* button — until the notice is acknowledged. Acceptance is persisted in `localStorage` so the modal appears only once.
- **API response sanitization** — all data received from Wikipedia and Wikidata is now validated before entering the app:
  - Text fields are type-checked and length-capped (`safeStr`).
  - Image and coat-of-arms URLs are validated to `https://upload.wikimedia.org` or `https://commons.wikimedia.org`; bare `http://` URLs are upgraded to HTTPS (`safeWikiUrl`).
  - Wikidata entity IDs (QIDs) are validated against `/^Q\d+$/` (`safeQid`).
  - Numeric fields (`population`, `elevation`) are guarded by `Number.isFinite()`.
  - The `mayorGender` field is now validated to one of `male | female | other`.
- **Geolocation double-watch guard** — `useGeolocation.start()` now returns immediately if a watcher is already active, preventing duplicate GPS watchers that could drain battery and produce conflicting position updates.
- **Error message sanitization** — raw `err.message` strings from failed network fetches are no longer forwarded to the UI (potential for partial server-response leakage). All three fetch error paths now show the generic message *"Network error"*.

---

## [1.4.12] — 2026-05-17

### Fixed
- **Current speed hidden in demo mode** — the speed display was reading `position.speed` (the raw GPS position, never updated in demo mode) instead of `effectivePosition.speed`. The demo position now correctly feeds the current-speed cell.

---

## [1.4.11] — 2026-05-17

### Fixed
- **Demo stop returns to real GPS location** — pressing *Stop* now unconditionally centers the map on the current GPS position (zoom 13 when the map-follow mode is set to *Overview*). Previously the map stayed at the demo's last town or showed the route overview, depending on settings. Pause still freezes the map at the demo's current position. A demo that ends naturally (reaches destination) stays at the destination until *Stop* is pressed, at which point the real GPS location takes over.

---

## [1.4.10] — 2026-05-17

### Fixed
- **OSRM timeout for long trips** — the OSRM fetch timeout was raised from 6 s to 15 s. The public demo server takes proportionally longer for long routes (full polyline6 geometry over hundreds of kilometres), causing it to always exceed 6 s and silently fall back to crow-fly distance. Short trips were unaffected; long trips now correctly receive and display the road route.

---

## [1.4.9] — 2026-05-17

### Added
- **Wikipedia fun-fact extract** — the town description card and TTS now show the last interesting paragraph of the Wikipedia intro instead of the first two administrative sentences. Administrative boilerplate (commune/municipality declaration, department, region, population) and commercial copy ("élue meilleure ville selon Lonely Planet", "prix et classements") are filtered out; the algorithm walks backwards from the last paragraph so the most distinctive fact about the place is shown first. Result: *Toulouse* → "Le cassoulet, la saucisse et la violette sont les spécialités emblématiques de la gastronomie toulousaine." instead of the standard commune/prefecture sentence.
- **Language-aware Wikipedia & Wikidata cache** — the IndexedDB and localStorage caches are now keyed per language (`${osmId}_fr` / `${osmId}_en`). Switching the app language from French to English (or vice versa) triggers a fresh fetch of Wikipedia extracts and Wikidata labels in the selected language. The IDB schema version is bumped to 2; existing entries are cleared automatically on first open.

### Fixed
- **Blank panel with "relaxed" min-time setting** — when the nearest-town panel cleared (no town in range), `lastDisplayChange` was not reset, so the next town that appeared had to wait out the remainder of the previous town's hold time (up to several minutes for the "relaxed" preset). Fixed: `lastDisplayChange` is now reset to 0 when the panel clears, so the next town is shown immediately.
- **Demo mode stays at destination** — when a demo trip finishes the map and panel now remain at the destination instead of jumping back to the start position. A *Replay* button restarts the route from the beginning; *Stop* is the only action that returns to the real GPS position.

### Changed
- **TTS description label** — "Lire la description à voix haute" renamed to "Lire la description de la ville à voix haute" for clarity.

---

## [1.4.8] — 2026-05-17

### Added
- **OSRM road routing** — at trip start the app queries `router.project-osrm.org` to obtain the actual driving geometry. Road distance replaces the previous crow-flies estimate, the planned-route line on the map now follows roads instead of being a straight dashed line, and town pre-fetching samples points along the real corridor rather than a straight line between origin and destination. If OSRM is unreachable or times out (6 s), the app falls back silently to the straight-line computation as before.
- **Progress tracking along the road** — position updates are now projected onto the nearest segment of the OSRM polyline (replacing the dot-product projection onto a single vector), giving accurate distance-done/left figures even on curved routes.

### Fixed
- **Prefetch progress bar always visible** — the prefetch progress section is now guaranteed to be on screen whenever downloading is in progress: `startTrip` forces the Trip tab open before the OSRM fetch begins, and a second guard switches to the Trip tab the moment `prefetching` becomes true (covers the case where the user navigated to another tab while OSRM was loading). The backdrop is locked during both the OSRM-loading and prefetching phases so an accidental tap can no longer dismiss the panel mid-download. An 800 ms pause after prefetch completion lets the user see the "active trip" confirmation before the drawer closes.

---

## [1.4.7] — 2026-05-17

### Added
- **Demo mode** — hidden easter egg for simulating a drive along a planned route without GPS.
- **Map follow zoom** — new "Map follow zoom" setting in the Display tab controls whether the map tracks the vehicle while moving and at what zoom level. Default is *Full route · no follow* (existing behaviour: map stays fitted to show the entire planned route). Seven levels are available from *Region (~300 km)* down to *Very close (~5 km)*. Applies to both real GPS tracking and demo mode; switching to a zoom level makes the map pan smoothly to the vehicle on every position update.

---

## [1.4.6] — 2026-05-17

### Changed
- **Settings drawer reorganised into three tabs** — *Trip* (plan trip, GPS, cache mode), *Display* (language, theme, units, text size, vehicle icon, place filter, display duration), and *Audio* (voice on/off, read description). The drawer no longer requires scrolling through unrelated sections to find a setting.
- **Theme and TTS controls removed from the hamburger menu** and relocated into their respective settings tabs. The menu now contains only *Settings* and *About*, making it a pure navigation tool rather than a mix of navigation and preferences.

---

## [1.4.5] — 2026-05-16

### Fixed
- **Panel-town never appeared on Android (and any fresh session)** — `tryUpdateDisplayedNearest` was stamping `lastDisplayChange = Date.now()` even when setting `displayedNearest` to `null` (initial state). When the first real town arrived seconds later, the elapsed time was far shorter than the 120 s `nearbyMinDuration` default, so the panel was throttled and stayed blank for up to 2 minutes. Fix: `lastDisplayChange` is now only advanced when a real town is being shown (`if (nearest.value)`), and the throttle is bypassed entirely when clearing to null.
- **TTS silent on Android (and desktop)** — `speechSynthesis.cancel()` is asynchronous on mobile browsers, not just iOS; calling `speak()` immediately after dropped the utterance on Android Chrome. The 50 ms gap after `cancel()` is now applied on all platforms, removing the iOS-only guard.

---

## [1.4.4] — 2026-05-16

### Fixed
- **Android TTS regression (v1.4.3)** — the conditional `ss.speaking || ss.pending` check in the new `speak()` implementation could send the first call into the 50 ms timeout path on certain Android Chrome builds where `ss.pending` is truthy at startup. A queued timeout then raced with the next synchronous `speak()`, causing a stale utterance to play after the current one ("wrong town announced") and in some states preventing the aside from updating. Fix: revert to the original always-cancel-then-speak approach on Android; the 50 ms iOS delay is now guarded by an explicit `isIOSDevice` platform check, keeping Android behaviour identical to v1.4.2.
- **iOS hint `computed` order** — `showIosHint` was declared before the `watching` ref it references; moved after the geolocation setup to eliminate the temporal dead zone dependency.

---

## [1.4.3] — 2026-05-16

### Added
- **iOS compatibility** — the app now works on iPhone and iPad (iOS 16.4+):
  - `apple-touch-icon` declared so iOS uses the correct icon when added to the home screen
  - A discreet banner appears when GPS is active on iOS, reminding the user to disable Auto-Lock so the screen does not sleep mid-drive (shown once, permanently dismissable)
- **TTS reliability on iOS** — `speechSynthesis` is now guarded against the two most common iOS bugs: `cancel()` is followed by a 50 ms pause before the next `speak()` (iOS drops utterances queued too quickly after a cancel), and a stuck-paused engine is unblocked with `resume()` before speaking

---

## [1.4.2] — 2026-05-16

### Added
- **TTS altitude & population** — voice announcements now include the town's altitude and approximate population (e.g. "Ce village est situé à 320 mètres d'altitude et compte environ 460 habitants"). The sentence is grammatically gendered in French (village/bourg → masculine, ville → feminine) and uses the translated place-type word (village / bourg / ville / town / city).
- Population is rounded for easy listening while driving: nearest 10 below 1 000, nearest 100 below 10 000, nearest 1 000 below 100 000, nearest 10 000 below 1 million, nearest 100 000 above.
- **"Read aloud town description"** setting — when enabled, the Wikipedia extract shown on screen is also spoken after the main announcement. Toggle in Travel Settings (Off by default).

---

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
