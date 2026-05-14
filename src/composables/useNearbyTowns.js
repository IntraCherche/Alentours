/**
 * useNearbyTowns
 *
 * Two modes:
 * 1. prefetchForRoute(samplePoints) — called once at trip start, queries
 *    Overpass for all towns along the route and caches them with Wikipedia
 *    summaries. No further network calls during the drive.
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
      prefetchProgress.value = 30

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
        prefetchProgress.value = 30 + Math.round(((i + batchSize) / uniqueList.length) * 70)
      }

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
    thumbnail: data.thumbnail?.source ?? null
  }
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
