/**
 * useRouteProgress — builds a route from two coordinates via OSRM,
 * then tracks progress along it using haversine nearest-point logic.
 *
 * Replaces the GPX-based version entirely. No file upload needed.
 */
import { ref } from 'vue'

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

export function useRouteProgress() {
  const routePoints = ref([])   // [{ lat, lng, distFromStart }]
  const totalDistance = ref(0)  // metres
  const progress = ref(0)       // 0–100
  const distanceDone = ref(0)
  const distanceLeft = ref(0)
  const routeLoaded = ref(false)
  const routeName = ref('')
  const loading = ref(false)
  const error = ref(null)
  const origin = ref(null)
  const destination = ref(null)

  async function loadRoute(from, to) {
    loading.value = true
    error.value = null
    try {
      const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}` +
                  `?overview=full&geometries=geojson`

      const res = await fetch(url)
      if (!res.ok) throw new Error('OSRM request failed')
      const data = await res.json()

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No route found between these two points.')
      }

      const coords = data.routes[0].geometry.coordinates
      // OSRM returns [lng, lat] pairs
      const points = []
      let cumDist = 0

      coords.forEach(([lng, lat], i) => {
        if (i === 0) {
          points.push({ lat, lng, distFromStart: 0 })
        } else {
          const prev = coords[i - 1]
          cumDist += haversine(prev[1], prev[0], lat, lng)
          points.push({ lat, lng, distFromStart: cumDist })
        }
      })

      routePoints.value = points
      totalDistance.value = cumDist
      origin.value = from
      destination.value = to
      routeName.value = `${from.name} → ${to.name}`
      routeLoaded.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function updatePosition(lat, lng) {
    if (!routePoints.value.length) return

    let minDist = Infinity
    let closestIdx = 0

    routePoints.value.forEach((pt, i) => {
      const d = haversine(lat, lng, pt.lat, pt.lng)
      if (d < minDist) {
        minDist = d
        closestIdx = i
      }
    })

    const nearest = routePoints.value[closestIdx]
    distanceDone.value = nearest.distFromStart
    distanceLeft.value = totalDistance.value - distanceDone.value
    progress.value = totalDistance.value > 0
      ? Math.min(100, (distanceDone.value / totalDistance.value) * 100)
      : 0
  }

  // Sample evenly-spaced points for town pre-fetching
  function sampleRoutePoints(every = 10000) {
    if (!routePoints.value.length) return []
    const samples = []
    let nextTarget = 0
    for (const pt of routePoints.value) {
      if (pt.distFromStart >= nextTarget) {
        samples.push({ lat: pt.lat, lng: pt.lng })
        nextTarget += every
      }
    }
    const last = routePoints.value.at(-1)
    if (last) samples.push({ lat: last.lat, lng: last.lng })
    return samples
  }

  // Restores a previously-saved route without a network call
  function restoreRoute({ routePoints: pts, totalDistance: dist, origin: org, destination: dest, routeName: name }) {
    routePoints.value  = pts
    totalDistance.value = dist
    origin.value       = org
    destination.value  = dest
    routeName.value    = name
    routeLoaded.value  = true
  }

  return {
    loadRoute, updatePosition, sampleRoutePoints, restoreRoute,
    routePoints, totalDistance, progress,
    distanceDone, distanceLeft, routeLoaded,
    routeName, origin, destination, loading, error
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
