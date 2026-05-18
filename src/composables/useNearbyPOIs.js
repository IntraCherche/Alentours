/**
 * useNearbyPOIs
 *
 * Foot-mode sightseeing: queries Wikidata via the wikibase:around geographic
 * service for cultural POIs within 500 m of the current position, then
 * enriches results that have a Wikipedia sitelink with their full extract.
 *
 * Throttled to 1 call per 100 m moved OR 60 s elapsed.
 */
import { ref } from 'vue'
import { useLocale } from './useLocale.js'

const { lang } = useLocale()

const SPARQL_URL  = 'https://query.wikidata.org/sparql'
const RADIUS_KM   = 0.5
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
].join(' ')

const WIKI_IMG_HOSTS = ['upload.wikimedia.org', 'commons.wikimedia.org']

export function useNearbyPOIs() {
  const pois    = ref([])
  const loading = ref(false)
  const error   = ref(null)

  let lastQueryLat  = null
  let lastQueryLng  = null
  let lastQueryTime = 0

  async function fetchNearbyPOIs(lat, lng) {
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
    try {
      const langCode = lang.value === 'fr' ? 'fr' : 'en'
      const sparql   = buildSparql(lng, lat, langCode)
      const url      = `${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`
      const res      = await fetch(url, { headers: { Accept: 'application/sparql-results+json' } })
      if (!res.ok) throw new Error(`SPARQL ${res.status}`)
      const data = await res.json()

      const seen    = new Set()
      const results = []
      for (const row of data.results.bindings) {
        const qid = row.item?.value?.split('/').pop()
        if (!qid || seen.has(qid)) continue
        seen.add(qid)

        let poiLat = null, poiLng = null
        const coordStr = row.coord?.value  // WKT: "Point(lng lat)"
        if (coordStr) {
          const m = coordStr.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/)
          if (m) { poiLng = parseFloat(m[1]); poiLat = parseFloat(m[2]) }
        }

        // The article value is the full Wikipedia URL — extract the page title
        const articleUrl = row.article?.value ?? null
        const wikiTitle  = articleUrl
          ? decodeURIComponent(articleUrl.replace(/^.*\/wiki\//, ''))
          : null

        results.push({
          id:          qid,
          name:        row.itemLabel?.value   ?? qid,
          description: row.itemDescription?.value ?? null,
          lat:         poiLat,
          lng:         poiLng,
          distance:    poiLat != null ? haversine(lat, lng, poiLat, poiLng) : null,
          image:       safeWikiUrl(row.image?.value),
          wikiTitle,
          wiki:        null
        })
      }

      results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))

      const withWiki = results.filter(p => p.wikiTitle)
      if (withWiki.length) await fetchPOIExtracts(withWiki, langCode)

      pois.value = results
    } catch {
      error.value = 'Network error'
    } finally {
      loading.value = false
    }
  }

  function resetThrottle() {
    lastQueryLat  = null
    lastQueryLng  = null
    lastQueryTime = 0
    pois.value    = []
  }

  return { pois, loading, error, fetchNearbyPOIs, resetThrottle }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSparql(lng, lat, langCode) {
  return `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?image ?article WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${RADIUS_KM}" .
  }
  ?item wdt:P31 ?type .
  VALUES ?type { ${POI_TYPES} }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL {
    ?article schema:about ?item ;
             schema:isPartOf <https://${langCode}.wikipedia.org/> .
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "${langCode},en" .
  }
}
LIMIT 20
`
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

    // Build a flat title→canonical-title map following normalizations + redirects
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
      // Prefer the Wikipedia thumbnail if the Wikidata P18 image is missing
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
