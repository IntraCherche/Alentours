import { ref } from 'vue'

export function useRouteProgress() {
  const totalDistance = ref(0)
  const progress = ref(0)
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
      origin.value = from
      destination.value = to
      totalDistance.value = haversine(from.lat, from.lng, to.lat, to.lng)
      routeName.value = `${from.name} → ${to.name}`
      routeLoaded.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function updatePosition(lat, lng) {
    if (!routeLoaded.value) return
    const t = projectOntoRoute(lat, lng)
    distanceDone.value = t * totalDistance.value
    distanceLeft.value = totalDistance.value - distanceDone.value
    progress.value = t * 100
  }

  function projectOntoRoute(lat, lng) {
    const dLat = destination.value.lat - origin.value.lat
    const dLng = destination.value.lng - origin.value.lng
    const apLat = lat - origin.value.lat
    const apLng = lng - origin.value.lng
    const t = (apLat * dLat + apLng * dLng) / (dLat * dLat + dLng * dLng)
    return Math.max(0, Math.min(1, t))
  }

  // Sample evenly-spaced points along the straight line for town pre-fetching
  function sampleRoutePoints(every = 10000) {
    if (!routeLoaded.value) return []
    const count = Math.ceil(totalDistance.value / every) + 1
    return Array.from({ length: count }, (_, i) => {
      const t = Math.min(1, (i * every) / totalDistance.value)
      return {
        lat: origin.value.lat + t * (destination.value.lat - origin.value.lat),
        lng: origin.value.lng + t * (destination.value.lng - origin.value.lng)
      }
    })
  }

  function restoreRoute({ totalDistance: dist, origin: org, destination: dest, routeName: name }) {
    totalDistance.value = dist
    origin.value = org
    destination.value = dest
    routeName.value = name
    routeLoaded.value = true
  }

  return {
    loadRoute, updatePosition, sampleRoutePoints, restoreRoute,
    totalDistance, progress,
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
