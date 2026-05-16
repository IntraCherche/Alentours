/**
 * useNearbyTowns
 *
 * Two modes:
 * 1. prefetchForRoute(samplePoints) — called once at trip start, queries
 *    Overpass for all towns along the route and caches them with Wikipedia
 *    summaries + Wikidata enrichment. No further network calls during the drive.
 *
 * 2. fetchNearbyTowns(lat, lng, heading) — live fallback if no pre-fetch,
 *    or if user drives off-route. Throttled to 1 call / 60s / 500m.
 */
import { ref } from 'vue'
import { useLocale } from './useLocale.js'
import { wikiCacheGetMany, wikiCachePutMany } from './useWikiCache.js'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const CACHE_KEY    = 'motorhome-towns-cache'

const { lang } = useLocale()

export function useNearbyTowns() {
  const towns       = ref([])
  const loading     = ref(false)
  const prefetching = ref(false)
  const prefetchProgress = ref(0)   // 0–100 for UI feedback
  const prefetchCurrentTown = ref('')
  const error       = ref(null)

  // In-memory cache: OSM id → enriched town object
  let townCache = {}

  // ── 1. PRE-FETCH for entire route ────────────────────────────────
  async function prefetchForRoute(samplePoints, corridorRadiusM = 15000) {
    if (!samplePoints.length) return
    prefetching.value = true
    prefetchProgress.value = 0
    error.value = null

    let fakeInterval = null
    let townCycler = null
    try {
      // Single bounding-box query — far faster than N union circles on Overpass,
      // avoids server-side 25 s timeout that caused progress to stall then jump to 100%.
      const padDeg = corridorRadiusM / 111000
      const lats = samplePoints.map(p => p.lat)
      const lngs = samplePoints.map(p => p.lng)
      const minLat = (Math.min(...lats) - padDeg).toFixed(4)
      const maxLat = (Math.max(...lats) + padDeg).toFixed(4)
      const minLng = (Math.min(...lngs) - padDeg).toFixed(4)
      const maxLng = (Math.max(...lngs) + padDeg).toFixed(4)

      const query = `[out:json][timeout:60];\nnode["place"~"city|town|village"]["name"](${minLat},${minLng},${maxLat},${maxLng});\nout body;`

      // Simulate slow progress while waiting for the Overpass response
      fakeInterval = setInterval(() => {
        if (prefetchProgress.value < 18) prefetchProgress.value++
      }, 900)

      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      })
      const data = await res.json()

      clearInterval(fakeInterval)
      fakeInterval = null
      // Bbox may cover far more than the corridor for curved routes — filter client-side.
      const elements = (data.elements ?? []).filter(el =>
        samplePoints.some(p => haversine(el.lat, el.lon, p.lat, p.lng) <= corridorRadiusM)
      )
      prefetchProgress.value = 20

      // Deduplicate by OSM id, build base town objects
      const unique = {}
      for (const el of elements) {
        if (!unique[el.id]) {
          unique[el.id] = {
            id: el.id,
            name: el.tags.name,
            nameEn: el.tags['name:en'] || el.tags.name,
            nameFr: el.tags['name:fr'] || el.tags.name,
            place: el.tags.place,
            population: el.tags.population ? parseInt(el.tags.population) : null,
            lat: el.lat,
            lng: el.lon,
            wiki: null
          }
        }
      }

      const uniqueList = Object.values(unique)

      // Cycle through town names one by one so the user sees activity
      let cycleIdx = 0
      townCycler = setInterval(() => {
        prefetchCurrentTown.value = uniqueList[cycleIdx % uniqueList.length]?.name ?? ''
        cycleIdx++
      }, 400)

      // Load from persistent IDB cache — towns already known skip all network fetches
      let cachedWiki = {}
      try { cachedWiki = await wikiCacheGetMany(uniqueList.map(t => t.id)) } catch {}
      const needsWiki = []
      for (const t of uniqueList) {
        if (cachedWiki[t.id]) t.wiki = cachedWiki[t.id]
        else needsWiki.push(t)
      }

      // Fetch Wikipedia summaries only for towns not already in the persistent cache
      const wikiBatch = 20
      for (let i = 0; i < needsWiki.length; i += wikiBatch) {
        await fetchWikiSummaryBatch(needsWiki.slice(i, i + wikiBatch), lang.value)
        prefetchProgress.value = 20 + Math.round(((i + wikiBatch) / Math.max(needsWiki.length, 1)) * 55)
      }

      prefetchProgress.value = 75

      // Enrich with Wikidata only for newly fetched towns
      await enrichWithWikidata(needsWiki, lang.value, (pct) => {
        prefetchProgress.value = 75 + Math.round(pct * 25)
      })

      // Persist newly enriched towns to the permanent IDB cache (full data, no truncation)
      try {
        await wikiCachePutMany(needsWiki.filter(t => t.wiki).map(t => ({ id: t.id, wiki: t.wiki })))
      } catch {}

      // Store in memory
      townCache = {}
      for (const t of uniqueList) townCache[t.id] = t

      // Persist to localStorage — strip fields that bloat the payload or don't work offline
      // (thumbnail/image/coat are remote URLs; full extracts can be several KB each).
      // Falls back to extract-less save if the trimmed version still exceeds quota.
      const toSaveable = (t, includeExtract) => ({
        ...t,
        wiki: t.wiki ? {
          title:          t.wiki.title,
          extract:        includeExtract ? (t.wiki.extract?.slice(0, 500) ?? null) : null,
          qid:            t.wiki.qid,
          thumbnail:      t.wiki.thumbnail,
          image:          t.wiki.image,
          coat:           t.wiki.coat,
          population:     t.wiki.population,
          elevation:      t.wiki.elevation,
          demonyms:       t.wiki.demonyms,
          rivers:         t.wiki.rivers,
          department:     t.wiki.department,
          departmentCode: t.wiki.departmentCode,
          region:         t.wiki.region,
          mayor:          t.wiki.mayor,
          mayorGender:    t.wiki.mayorGender,
          nickname:       t.wiki.nickname,
        } : null
      })
      try {
        const payload = {}
        for (const [id, t] of Object.entries(townCache)) payload[id] = toSaveable(t, true)
        localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
      } catch {
        try {
          const payload = {}
          for (const [id, t] of Object.entries(townCache)) payload[id] = toSaveable(t, false)
          localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
        } catch {}
      }

      prefetchProgress.value = 100
      // Let Vue paint the 100% state before the panel disappears
      await new Promise(r => setTimeout(r, 600))
    } catch (err) {
      error.value = err.message
    } finally {
      clearInterval(fakeInterval)
      clearInterval(townCycler)
      prefetchCurrentTown.value = ''
      prefetching.value = false
    }
  }

  // Restore cache from localStorage (e.g. page refresh mid-trip)
  function restoreCache() {
    try {
      const saved = localStorage.getItem(CACHE_KEY)
      if (saved) townCache = JSON.parse(saved)
    } catch {}
  }

  // ── 2. LIVE LOOKUP (from cache or network fallback) ──────────────
  let lastQueryLat  = null
  let lastQueryLng  = null
  let lastQueryTime = 0

  async function fetchNearbyTowns(lat, lng, heading) {
    const now = Date.now()
    const timeSinceLast = now - lastQueryTime
    const distSinceLast = lastQueryLat !== null
      ? haversine(lat, lng, lastQueryLat, lastQueryLng) : Infinity

    if (timeSinceLast < 60000 && distSinceLast < 500) return

    lastQueryLat  = lat
    lastQueryLng  = lng
    lastQueryTime = now

    // When a prefetch cache exists, serve from it — but only if nearby towns are found.
    // If the cache has no towns within range (off-route, cacheMode=none, old session),
    // fall through to the live network path.
    if (Object.keys(townCache).length) {
      const cached = nearestFromCache(lat, lng, heading, 15000)
      if (cached.length) {
        // Enrich cache-hit towns that are missing wiki data: IDB first, then live fetch.
        // Also catches towns loaded from old localStorage that had thumbnail/coat stripped
        // (thumbnail === undefined means the key was absent, vs. null = tried & unavailable).
        const needsWiki = cached.filter(t => !t.wiki || t.wiki.thumbnail === undefined)
        if (needsWiki.length) {
          let idbWiki = {}
          try { idbWiki = await wikiCacheGetMany(needsWiki.map(t => t.id)) } catch {}
          const stillMissing = []
          for (const t of needsWiki) {
            if (idbWiki[t.id]) {
              t.wiki = idbWiki[t.id]
              if (townCache[t.id]) townCache[t.id].wiki = t.wiki
            } else if (!t.wiki) {
              stillMissing.push(t)
            }
            // If wiki is partial (stripped from localStorage) and not in IDB, leave as is
          }
          if (stillMissing.length) {
            await fetchWikiSummaryBatch(stillMissing, lang.value)
            await enrichWithWikidata(stillMissing, lang.value)
            try {
              await wikiCachePutMany(stillMissing.filter(t => t.wiki).map(t => ({ id: t.id, wiki: t.wiki })))
            } catch {}
            for (const t of stillMissing) {
              if (t.wiki && townCache[t.id]) townCache[t.id].wiki = t.wiki
            }
          }
        }
        towns.value = cached
        return
      }
      // No cached towns within range — fall through to live fetch.
    }

    // No cache — live network call
    loading.value = true
    error.value = null
    try {
      const query = `
        [out:json][timeout:10];
        (node["place"~"city|town|village"]["name"](around:15000,${lat},${lng}););
        out body;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      })
      const data = await res.json()
      const elements = data.elements ?? []

      const PLACE_RANK = { village: 1, town: 2, city: 3 }
      const sorted = elements.map(el => ({
        id: el.id, name: el.tags.name,
        nameEn: el.tags['name:en'] || el.tags.name,
        nameFr: el.tags['name:fr'] || el.tags.name,
        place: el.tags.place,
        population: el.tags.population ? parseInt(el.tags.population) : null,
        lat: el.lat, lng: el.lon,
        distance: haversine(lat, lng, el.lat, el.lon),
        side: computeSide(lat, lng, heading, el.lat, el.lon),
        wiki: null
      })).sort((a, b) => a.distance - b.distance)

      // Take the 5 nearest of each place rank so that towns/cities are never
      // crowded out by a wall of villages when a place-type filter is active.
      const byRank = { 1: [], 2: [], 3: [] }
      for (const t of sorted) {
        const r = PLACE_RANK[t.place] ?? 1
        if (byRank[r].length < 5) byRank[r].push(t)
      }
      const list = [...byRank[3], ...byRank[2], ...byRank[1]]
        .sort((a, b) => a.distance - b.distance)

      let cachedWiki = {}
      try { cachedWiki = await wikiCacheGetMany(list.map(t => t.id)) } catch {}
      const needsEnrich = []
      for (const t of list) {
        if (cachedWiki[t.id]) t.wiki = cachedWiki[t.id]
        else needsEnrich.push(t)
      }

      if (needsEnrich.length) {
        await fetchWikiSummaryBatch(needsEnrich, lang.value)
        await enrichWithWikidata(needsEnrich, lang.value)
        try {
          await wikiCachePutMany(needsEnrich.filter(t => t.wiki).map(t => ({ id: t.id, wiki: t.wiki })))
        } catch {}
      }

      towns.value = list
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  // Pick nearest towns from cache, add distance + side.
  // Returns all places within radius without slicing so that a place-type
  // filter applied upstream (App.vue filteredTowns) always has candidates —
  // even in rural areas where many villages are closer than the nearest town.
  function nearestFromCache(lat, lng, heading, radiusM) {
    return Object.values(townCache)
      .map(t => ({
        ...t,
        distance: haversine(lat, lng, t.lat, t.lng),
        side: computeSide(lat, lng, heading, t.lat, t.lng)
      }))
      .filter(t => t.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
  }

  function clearCache() {
    townCache = {}
    try { localStorage.removeItem(CACHE_KEY) } catch {}
  }

  function exportTownCache() {
    return localStorage.getItem(CACHE_KEY) ?? null
  }

  function importTownCache(raw) {
    if (raw) {
      try { localStorage.setItem(CACHE_KEY, raw) } catch {}
    } else {
      localStorage.removeItem(CACHE_KEY)
    }
    restoreCache()
  }

  function resetThrottle() {
    lastQueryLat  = null
    lastQueryLng  = null
    lastQueryTime = 0
  }

  // ── 3. CITY-ONLY LOOKUP (wide radius, explicit trigger) ──────────────
  // Used when the place-type filter is set to "city". Cities are rare and
  // visible from tens of kilometres, so we search 80 km and bypass the
  // normal throttle (this is triggered explicitly on filter change / GPS fix).
  async function fetchNearestCity(lat, lng, heading) {
    // Cache path: find the nearest city anywhere in the prefetch cache.
    if (Object.keys(townCache).length) {
      const cities = Object.values(townCache)
        .filter(t => t.place === 'city')
        .map(t => ({
          ...t,
          distance: haversine(lat, lng, t.lat, t.lng),
          side: computeSide(lat, lng, heading, t.lat, t.lng)
        }))
        .sort((a, b) => a.distance - b.distance)

      if (cities.length) {
        const needsWiki = cities.filter(t => !t.wiki || t.wiki.thumbnail === undefined)
        if (needsWiki.length) {
          let idbWiki = {}
          try { idbWiki = await wikiCacheGetMany(needsWiki.map(t => t.id)) } catch {}
          const stillMissing = []
          for (const t of needsWiki) {
            if (idbWiki[t.id]) { t.wiki = idbWiki[t.id]; if (townCache[t.id]) townCache[t.id].wiki = t.wiki }
            else if (!t.wiki) stillMissing.push(t)
          }
          if (stillMissing.length) {
            await fetchWikiSummaryBatch(stillMissing, lang.value)
            await enrichWithWikidata(stillMissing, lang.value)
            try { await wikiCachePutMany(stillMissing.filter(t => t.wiki).map(t => ({ id: t.id, wiki: t.wiki }))) } catch {}
            for (const t of stillMissing) { if (t.wiki && townCache[t.id]) townCache[t.id].wiki = t.wiki }
          }
        }
        towns.value = cities
        return
      }
      // Cache exists but has no cities — fall through to live query.
    }

    // Live query: cities only, 80 km radius.
    loading.value = true
    error.value = null
    try {
      const query = `
        [out:json][timeout:15];
        (node["place"="city"]["name"](around:80000,${lat},${lng}););
        out body;
      `
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      })
      const data = await res.json()
      const list = (data.elements ?? []).map(el => ({
        id: el.id, name: el.tags.name,
        nameEn: el.tags['name:en'] || el.tags.name,
        nameFr: el.tags['name:fr'] || el.tags.name,
        place: el.tags.place,
        population: el.tags.population ? parseInt(el.tags.population) : null,
        lat: el.lat, lng: el.lon,
        distance: haversine(lat, lng, el.lat, el.lon),
        side: computeSide(lat, lng, heading, el.lat, el.lon),
        wiki: null
      })).sort((a, b) => a.distance - b.distance)

      let cachedWiki = {}
      try { cachedWiki = await wikiCacheGetMany(list.map(t => t.id)) } catch {}
      const needsEnrich = []
      for (const t of list) {
        if (cachedWiki[t.id]) t.wiki = cachedWiki[t.id]
        else needsEnrich.push(t)
      }
      if (needsEnrich.length) {
        await fetchWikiSummaryBatch(needsEnrich, lang.value)
        await enrichWithWikidata(needsEnrich, lang.value)
        try { await wikiCachePutMany(needsEnrich.filter(t => t.wiki).map(t => ({ id: t.id, wiki: t.wiki }))) } catch {}
      }

      towns.value = list
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  return {
    towns, loading, prefetching, prefetchProgress, prefetchCurrentTown, error,
    prefetchForRoute, fetchNearbyTowns, fetchNearestCity, resetThrottle,
    restoreCache, clearCache, exportTownCache, importTownCache
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

// Fetch Wikipedia summaries for a batch of towns using the MediaWiki Action API.
// Mutates town.wiki in place. Max 20 towns per call (API limit for prop=extracts).
// Falls back to coordinate-based geosearch for towns that return a disambiguation page
// or no match (e.g. "Fenouillet" → disambiguation → geosearch finds "Fenouillet, Haute-Garonne").
async function fetchWikiSummaryBatch(towns, language) {
  if (!towns.length) return
  const lang = language === 'fr' ? 'fr' : 'en'

  // Map query name → town so we can match API results back
  const nameToTown = new Map()
  for (const town of towns) {
    const name = lang === 'fr' ? (town.nameFr || town.name) : (town.nameEn || town.name)
    nameToTown.set(name, town)
  }

  const params = new URLSearchParams({
    action:      'query',
    prop:        'extracts|pageimages|pageprops',
    exintro:     '1',
    exsentences: '2',
    explaintext: '1',
    piprop:      'thumbnail',
    pithumbsize: '400',
    titles:      [...nameToTown.keys()].join('|'),
    format:      'json',
    redirects:   '1',
    origin:      '*'
  })

  let data
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`)
    if (!res.ok) return
    data = await res.json()
  } catch { return }

  // Build: final API title → original query name (following normalization + redirects)
  const titleToQuery = new Map()
  for (const { from, to } of (data.query?.normalized ?? [])) titleToQuery.set(to, from)
  for (const { from, to } of (data.query?.redirects  ?? [])) {
    titleToQuery.set(to, titleToQuery.get(from) ?? from)
  }

  for (const page of Object.values(data.query?.pages ?? {})) {
    if (page.missing !== undefined || page.pageprops?.disambiguation !== undefined) continue
    const queryName = titleToQuery.get(page.title) ?? page.title
    const town = nameToTown.get(queryName)
    if (!town) continue
    town.wiki = {
      title:     page.title,
      extract:   page.extract || null,
      thumbnail: page.thumbnail?.source ?? null,
      qid:       page.pageprops?.wikibase_item ?? null
    }
  }

  // Geo fallback: towns still without wiki data hit a disambiguation or had no name match
  for (const town of towns) {
    if (town.wiki !== null || town.lat == null || town.lng == null) continue
    await fetchWikiByCoords(town, lang)
  }
}

// Resolve a town's Wikipedia article via coordinate proximity when the name lookup fails.
// Uses generator=geosearch to find articles near the town's OSM coordinates, then picks
// the closest result whose title contains the town name (or the first valid result).
async function fetchWikiByCoords(town, lang) {
  const params = new URLSearchParams({
    action:      'query',
    prop:        'extracts|pageimages|pageprops',
    exintro:     '1',
    exsentences: '2',
    explaintext: '1',
    piprop:      'thumbnail',
    pithumbsize: '400',
    generator:   'geosearch',
    ggscoord:    `${town.lat}|${town.lng}`,
    ggsradius:   '5000',
    ggslimit:    '5',
    format:      'json',
    origin:      '*'
  })

  let data
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`)
    if (!res.ok) return
    data = await res.json()
  } catch { return }

  const townName = (lang === 'fr' ? (town.nameFr || town.name) : (town.nameEn || town.name)).toLowerCase()
  const pages = Object.values(data.query?.pages ?? {})
    .filter(p => p.missing === undefined && p.pageprops?.disambiguation === undefined)

  const match = pages.find(p => p.title.toLowerCase().includes(townName)) ?? pages[0]
  if (!match) return

  town.wiki = {
    title:     match.title,
    extract:   match.extract || null,
    thumbnail: match.thumbnail?.source ?? null,
    qid:       match.pageprops?.wikibase_item ?? null
  }
}

// Batch Wikidata SPARQL enrichment for a list of towns (mutates town.wiki in place)
async function enrichWithWikidata(townList, language, onProgress) {
  const withQid = townList.filter(t => t.wiki?.qid)
  if (!withQid.length) return

  const batchSize = 15
  for (let i = 0; i < withQid.length; i += batchSize) {
    const batch = withQid.slice(i, i + batchSize)
    try {
      const wdData = await fetchWikidataBatch(batch.map(t => t.wiki.qid), language)
      for (const town of batch) {
        const wd = wdData[town.wiki.qid]
        if (wd) Object.assign(town.wiki, wd)
      }
    } catch { /* non-fatal: Wikidata enrichment is best-effort */ }
    if (onProgress) onProgress((i + batchSize) / withQid.length)
  }
}

// Single SPARQL call for up to ~15 QIDs, returns map of qid → enrichment object
async function fetchWikidataBatch(qids, language) {
  if (!qids.length) return {}
  const lang = language === 'fr' ? 'fr' : 'en'
  const values = qids.map(q => `wd:${q}`).join(' ')

  const sparql = `
SELECT DISTINCT ?city ?pop ?elevation ?alias ?demonym ?riverLabel ?depLabel ?depCode ?regLabel ?mayorLabel ?mayorSex ?image ?coat WHERE {
  VALUES ?city { ${values} }
  OPTIONAL { ?city wdt:P1082 ?pop }
  OPTIONAL { ?city wdt:P2044 ?elevation }
  OPTIONAL { ?city skos:altLabel ?alias . FILTER(LANG(?alias) = "fr") }
  OPTIONAL { ?city wdt:P1549 ?demonym . FILTER(LANG(?demonym) = "${lang}" || LANG(?demonym) = "fr") }
  OPTIONAL {
    ?city wdt:P206 ?river .
    ?river rdfs:label ?riverLabel . FILTER(LANG(?riverLabel) = "${lang}")
  }
  OPTIONAL {
    ?city wdt:P131+ ?dep .
    ?dep wdt:P2586 ?depCode .
    ?dep rdfs:label ?depLabel . FILTER(LANG(?depLabel) = "${lang}")
  }
  OPTIONAL {
    ?city wdt:P131+ ?reg .
    { ?reg wdt:P31 wd:Q36784 } UNION { ?reg wdt:P31 wd:Q202216 } UNION { ?reg wdt:P31 wd:Q22690 }
    ?reg rdfs:label ?regLabel . FILTER(LANG(?regLabel) = "${lang}")
  }
  OPTIONAL {
    ?city wdt:P6 ?mayor .
    ?mayor rdfs:label ?mayorLabel . FILTER(LANG(?mayorLabel) = "${lang}")
    OPTIONAL {
      ?mayor wdt:P21 ?sexItem .
      BIND(IF(?sexItem = wd:Q6581072, "female", IF(?sexItem = wd:Q6581097, "male", "other")) AS ?mayorSex)
    }
  }
  OPTIONAL { ?city wdt:P18 ?image }
  OPTIONAL { ?city wdt:P94 ?coat }
}
`

  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
  if (!res.ok) return {}
  const data = await res.json()

  const results = {}
  for (const row of data.results.bindings) {
    const qid = row.city?.value?.split('/').pop()
    if (!qid) continue
    if (!results[qid]) results[qid] = {
      population: null, elevation: null, demonyms: [], aliases: [], rivers: [],
      department: null, departmentCode: null, region: null,
      mayor: null, mayorGender: null, image: null, coat: null
    }
    const r = results[qid]
    if (row.pop) r.population = Math.round(parseFloat(row.pop.value))
    if (row.elevation && !r.elevation) r.elevation = Math.round(parseFloat(row.elevation.value))
    if (row.alias) { const a = row.alias.value; if (!r.aliases.includes(a)) r.aliases.push(a) }
    if (row.demonym) { const d = row.demonym.value; if (!r.demonyms.includes(d)) r.demonyms.push(d) }
    if (row.riverLabel) { const rv = row.riverLabel.value; if (!r.rivers.includes(rv)) r.rivers.push(rv) }
    if (row.depLabel && !r.department) r.department = row.depLabel.value
    if (row.depCode && !r.departmentCode) r.departmentCode = row.depCode.value
    if (row.regLabel && !r.region) r.region = row.regLabel.value
    if (row.mayorLabel && !r.mayor) r.mayor = row.mayorLabel.value
    if (row.mayorSex && !r.mayorGender) r.mayorGender = row.mayorSex.value
    if (row.image && !r.image) r.image = row.image.value
    if (row.coat && !r.coat) r.coat = row.coat.value
  }
  for (const r of Object.values(results)) {
    r.nickname = pickNickname(r.aliases)
    delete r.aliases
  }
  return results
}

function pickNickname(aliases) {
  const articleRe = /^(la |le |les |l')/i
  return aliases.find(a => articleRe.test(a) && a.includes(' '))
    ?? aliases.find(a => a.includes(' '))
    ?? null
}

function computeSide(fromLat, fromLng, heading, toLat, toLng) {
  if (heading == null) return 'unknown'
  const bearing = getBearing(fromLat, fromLng, toLat, toLng)
  let diff = bearing - heading
  while (diff > 180)  diff -= 360
  while (diff < -180) diff += 360
  if (Math.abs(diff) < 30)  return 'ahead'
  if (Math.abs(diff) > 150) return 'behind'
  return diff > 0 ? 'right' : 'left'
}

function getBearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
