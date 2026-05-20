/**
 * useNearbyPOIs
 *
 * Foot-mode sightseeing: queries Wikidata via the wikibase:around geographic
 * service for cultural POIs within a configurable radius of the current position, then
 * enriches results that have a Wikipedia sitelink with their full extract.
 *
 * Throttled to 1 call per 100 m moved OR 60 s elapsed.
 *
 * When footCacheMode === 'offline', live network calls are skipped and
 * results are served from the IndexedDB POI cache instead.
 */
import { ref } from 'vue'
import { useLocale } from './useLocale.js'
import { poiCachePutMany, poiCacheGetAll, poiCacheCount } from './usePOICache.js'

const { lang } = useLocale()

const SPARQL_URL  = 'https://query.wikidata.org/sparql'
const MIN_MOVE_M  = 100
const MIN_TIME_MS = 60_000

// Wikidata P31 (instance of) values considered culturally interesting for walkers.
// Using a flat VALUES list (not P279* subclass traversal) for speed.
const POI_TYPES = [
  'wd:Q570116',   // monument
  'wd:Q14092743', // monument historique (FR classified)
  'wd:Q22811685', // inscrit monument historique (FR listed)
  'wd:Q33506',    // museum
  'wd:Q207694',   // art museum
  'wd:Q16970',    // church building
  'wd:Q44613',    // monastery
  'wd:Q839954',   // archaeological site
  'wd:Q747074',   // public square
  'wd:Q12280',    // bridge
  'wd:Q23413',    // castle
  'wd:Q16560',    // palace
  'wd:Q82117',    // fortification
  'wd:Q39614',    // cemetery
  'wd:Q21027555', // cultural heritage site
  'wd:Q848899',   // town hall (hôtel de ville / mairie)
  'wd:Q3284499',  // capitole (FR specific: Capitole de Toulouse etc.)
  'wd:Q24354',    // theatre building
  'wd:Q153562',   // opera (institution/company type)
  'wd:Q1060829',  // opera house (building)
  'wd:Q271669',   // market hall / covered market
  'wd:Q55488',    // railway station
  'wd:Q4989906',  // fortified gate
].join(' ')

const WIKI_IMG_HOSTS = ['upload.wikimedia.org', 'commons.wikimedia.org']

export function useNearbyPOIs() {
  const pois             = ref([])
  const loading          = ref(false)
  const error            = ref(null)
  const prefetching      = ref(false)
  const prefetchProgress = ref(0)
  const prefetchTotal    = ref(0)
  const prefetchDone     = ref(false)

  let lastQueryLat  = null
  let lastQueryLng  = null
  let lastQueryTime = 0

  // footCacheMode: 'none' | 'offline'  (passed in from App.vue as a plain getter)
  let getCacheMode = () => 'none'
  function setCacheModeGetter(fn) { getCacheMode = fn }

  // Announcement radius in km (passed in from App.vue as a plain getter)
  let getAnnouncementRadiusKm = () => 0.5
  function setAnnouncementRadiusGetter(fn) { getAnnouncementRadiusKm = fn }

  async function fetchNearbyPOIs(lat, lng, heading) {
    const now = Date.now()
    if (lastQueryLat !== null) {
      const moved = haversine(lat, lng, lastQueryLat, lastQueryLng)
      if (moved < MIN_MOVE_M && now - lastQueryTime < MIN_TIME_MS) return
    }
    lastQueryLat  = lat
    lastQueryLng  = lng
    lastQueryTime = now

    loading.value = true
    error.value   = null

    if (getCacheMode() === 'offline') {
      await fetchFromCache(lat, lng, heading)
    } else {
      await fetchLive(lat, lng, heading)
    }

    loading.value = false
  }

  async function fetchLive(lat, lng, heading) {
    try {
      const langCode = lang.value === 'fr' ? 'fr' : 'en'
      const sparql   = buildSparql(lng, lat, langCode, getAnnouncementRadiusKm(), 20)
      const url      = `${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`
      const res      = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
      if (!res.ok) throw new Error(`SPARQL ${res.status}`)
      const data = await res.json()
      pois.value = parseResults(data, lat, lng, heading)
      const withWiki = pois.value.filter(p => p.wikiTitle)
      if (withWiki.length) await fetchPOIExtracts(withWiki, langCode)
    } catch {
      error.value = 'Network error'
    }
  }

  async function fetchFromCache(lat, lng, heading) {
    try {
      const langCode = lang.value === 'fr' ? 'fr' : 'en'
      const all      = await poiCacheGetAll(langCode)
      if (!all.length) {
        error.value = 'no_cache'
        pois.value  = []
        return
      }
      const nearby = all
        .map(p => ({ ...p, distance: haversine(lat, lng, p.lat, p.lng), side: computeSide(lat, lng, heading, p.lat, p.lng) }))
        .filter(p => p.distance <= getAnnouncementRadiusKm() * 1000)
        .sort((a, b) => a.distance - b.distance)
      pois.value = nearby
    } catch {
      error.value = 'Network error'
    }
  }

  const cancelRequested    = ref(false)
  const prefetchCancelling = ref(false)

  function cancelPrefetch() {
    if (prefetching.value) {
      cancelRequested.value    = true
      prefetchCancelling.value = true
    }
  }

  // Prefetch all POIs within radiusKm of (lat, lng) and store in IndexedDB.
  async function prefetchPOIs(lat, lng, radiusKm) {
    prefetching.value        = true
    prefetchProgress.value   = 0
    prefetchTotal.value      = 0
    prefetchDone.value       = false
    cancelRequested.value    = false
    prefetchCancelling.value = false
    error.value              = null

    try {
      const langCode = lang.value === 'fr' ? 'fr' : 'en'
      const sparql   = buildSparql(lng, lat, langCode, radiusKm, 200)
      const url      = `${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`
      const res      = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
      if (!res.ok) throw new Error(`SPARQL ${res.status}`)
      const data = await res.json()

      const results = parseResults(data, lat, lng)
      prefetchTotal.value = results.length

      // Fetch Wikipedia extracts in batches of 20 (API limit)
      const withWiki = results.filter(p => p.wikiTitle)
      const BATCH    = 20
      let done       = results.length - withWiki.length
      prefetchProgress.value = prefetchTotal.value ? Math.round(done / prefetchTotal.value * 100) : 100

      for (let i = 0; i < withWiki.length; i += BATCH) {
        if (cancelRequested.value) return
        const batch = withWiki.slice(i, i + BATCH)
        await fetchPOIExtracts(batch, langCode)
        done += batch.length
        prefetchProgress.value = prefetchTotal.value
          ? Math.round(done / prefetchTotal.value * 100)
          : 100
      }

      if (cancelRequested.value) return

      await poiCachePutMany(results, langCode)
      prefetchDone.value     = true
      prefetchProgress.value = 100
    } catch {
      error.value = 'prefetch_error'
    } finally {
      prefetching.value        = false
      cancelRequested.value    = false
      prefetchCancelling.value = false
    }
  }

  async function getCachedCount() {
    const langCode = lang.value === 'fr' ? 'fr' : 'en'
    return poiCacheCount(langCode)
  }

  function resetThrottle() {
    lastQueryLat  = null
    lastQueryLng  = null
    lastQueryTime = 0
    pois.value    = []
  }

  return {
    pois, loading, error,
    prefetching, prefetchProgress, prefetchTotal, prefetchDone,
    prefetchCancelling,
    fetchNearbyPOIs, resetThrottle, prefetchPOIs, cancelPrefetch, getCachedCount,
    setCacheModeGetter, setAnnouncementRadiusGetter,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSparql(lng, lat, langCode, radiusKm, limit) {
  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?image ?article WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?item wdt:P31 ?type .
  VALUES ?type { ${POI_TYPES} }
  OPTIONAL {
    ?item wdt:P31 ?adminType .
    VALUES ?adminType {
      wd:Q515 wd:Q1549591 wd:Q5119 wd:Q532 wd:Q3957
      wd:Q484170 wd:Q2616791 wd:Q36102 wd:Q208511 wd:Q1187811
    }
  }
  FILTER(!BOUND(?adminType))
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://${langCode}.wikipedia.org/> .
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "${langCode},en" .
  }
}
LIMIT ${limit}
`
}

function parseResults(data, refLat, refLng, heading) {
  const seen    = new Set()
  const results = []
  for (const row of data.results.bindings) {
    const qid = row.item?.value?.split('/').pop()
    if (!qid || seen.has(qid)) continue
    seen.add(qid)

    let poiLat = null, poiLng = null
    const coordStr = row.coord?.value
    if (coordStr) {
      const m = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/)
      if (m) { poiLng = parseFloat(m[1]); poiLat = parseFloat(m[2]) }
    }

    const articleUrl = row.article?.value ?? null
    const wikiTitle  = articleUrl
      ? decodeURIComponent(articleUrl.replace(/^.*\/wiki\//, ''))
      : null

    results.push({
      id:          qid,
      name:        row.itemLabel?.value        ?? qid,
      description: row.itemDescription?.value  ?? null,
      lat:         poiLat,
      lng:         poiLng,
      distance:    poiLat != null ? haversine(refLat, refLng, poiLat, poiLng) : null,
      side:        poiLat != null ? computeSide(refLat, refLng, heading, poiLat, poiLng) : 'unknown',
      image:       safeWikiUrl(row.image?.value),
      wikiTitle,
      wiki:        null,
    })
  }
  results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  return results
}

async function fetchPOIExtracts(poiList, langCode) {
  const titles = poiList.map(p => p.wikiTitle).join('|')
  const params = new URLSearchParams({
    action:      'query',
    prop:        'extracts|pageimages',
    exintro:     '1',
    explaintext: '1',
    piprop:      'thumbnail',
    pithumbsize: '400',
    titles,
    format:    'json',
    redirects: '1',
    origin:    '*'
  })
  try {
    const res = await fetch(`https://${langCode}.wikipedia.org/w/api.php?${params}`)
    if (!res.ok) return
    const data = await res.json()

    const norm = {}
    for (const { from, to } of (data.query?.normalized ?? [])) norm[from] = to
    for (const { from, to } of (data.query?.redirects  ?? [])) norm[norm[from] ?? from] = to

    const byTitle = {}
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (page.missing !== undefined) continue
      byTitle[page.title] = {
        extract:   page.extract ?? null,
        thumbnail: safeWikiUrl(page.thumbnail?.source)
      }
    }

    for (const poi of poiList) {
      const resolved = norm[poi.wikiTitle] ?? poi.wikiTitle
      const wiki     = byTitle[resolved]
      if (!wiki) continue
      poi.wiki = wiki
      if (!poi.image && wiki.thumbnail) poi.image = wiki.thumbnail
    }
  } catch {}
}

function safeWikiUrl(val) {
  if (typeof val !== 'string') return null
  try {
    const normalized = val.startsWith('http:') ? 'https:' + val.slice(5) : val
    const url = new URL(normalized)
    if (url.protocol !== 'https:') return null
    if (!WIKI_IMG_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) return null
    return url.href
  } catch { return null }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getBearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
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
