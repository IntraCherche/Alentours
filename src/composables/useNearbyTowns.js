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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const CACHE_KEY    = 'motorhome-towns-cache'

const { lang } = useLocale()

export function useNearbyTowns() {
  const towns       = ref([])
  const loading     = ref(false)
  const prefetching = ref(false)
  const prefetchProgress = ref(0)   // 0–100 for UI feedback
  const error       = ref(null)

  // In-memory cache: OSM id → enriched town object
  let townCache = {}

  // ── 1. PRE-FETCH for entire route ────────────────────────────────
  async function prefetchForRoute(samplePoints) {
    if (!samplePoints.length) return
    prefetching.value = true
    prefetchProgress.value = 0
    error.value = null

    try {
      // Build one big Overpass query covering all sample points
      // Each point gets a 12km radius node search
      const unions = samplePoints.map(
        ({ lat, lng }) =>
          `node["place"~"city|town|village"]["name"](around:12000,${lat},${lng});`
      ).join('\n')

      const query = `[out:json][timeout:25];\n(\n${unions}\n);\nout body;`

      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query)
      })
      const data = await res.json()

      const elements = data.elements ?? []
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

      // Fetch Wikipedia summaries in parallel (batches of 8 to be polite)
      const batchSize = 8
      for (let i = 0; i < uniqueList.length; i += batchSize) {
        const batch = uniqueList.slice(i, i + batchSize)
        await Promise.allSettled(batch.map(async (town) => {
          try {
            const wikiName = lang.value === 'fr' ? town.nameFr : town.nameEn
            town.wiki = await fetchWikiSummary(wikiName, lang.value)
          } catch { town.wiki = null }
        }))
        prefetchProgress.value = 20 + Math.round(((i + batchSize) / uniqueList.length) * 55)
      }

      prefetchProgress.value = 75

      // Enrich with Wikidata (population, demonym, rivers, department, region, mayor)
      await enrichWithWikidata(uniqueList, lang.value, (pct) => {
        prefetchProgress.value = 75 + Math.round(pct * 0.25)
      })

      // Store in memory + localStorage
      townCache = {}
      for (const t of uniqueList) townCache[t.id] = t

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(townCache))
      } catch {}

      prefetchProgress.value = 100
    } catch (err) {
      error.value = err.message
    } finally {
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

    // Try cache first
    if (Object.keys(townCache).length) {
      towns.value = nearestFromCache(lat, lng, heading, 15000)
      return
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

      const list = elements.map(el => ({
        id: el.id, name: el.tags.name,
        nameEn: el.tags['name:en'] || el.tags.name,
        nameFr: el.tags['name:fr'] || el.tags.name,
        place: el.tags.place,
        population: el.tags.population ? parseInt(el.tags.population) : null,
        lat: el.lat, lng: el.lon,
        distance: haversine(lat, lng, el.lat, el.lon),
        side: computeSide(lat, lng, heading, el.lat, el.lon),
        wiki: null
      })).sort((a, b) => a.distance - b.distance).slice(0, 5)

      await Promise.allSettled(list.map(async t => {
        try {
          const wikiName = lang.value === 'fr' ? t.nameFr : t.nameEn
          t.wiki = await fetchWikiSummary(wikiName, lang.value)
        } catch {}
      }))

      await enrichWithWikidata(list, lang.value)

      towns.value = list
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  // Pick nearest towns from cache, add distance + side
  function nearestFromCache(lat, lng, heading, radiusM) {
    return Object.values(townCache)
      .map(t => ({
        ...t,
        distance: haversine(lat, lng, t.lat, t.lng),
        side: computeSide(lat, lng, heading, t.lat, t.lng)
      }))
      .filter(t => t.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
  }

  return {
    towns, loading, prefetching, prefetchProgress, error,
    prefetchForRoute, fetchNearbyTowns, restoreCache
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchWikiSummary(name, language = 'en') {
  const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  if (data.type === 'disambiguation') return null
  return {
    title: data.title,
    extract: data.extract,
    thumbnail: data.thumbnail?.source ?? null,
    qid: data.wikibase_item ?? null
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
