import { ref } from 'vue'

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

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
  const routePoints = ref([])  // [[lat, lng], …] — populated only in 'osrm' mode
  const routeMode = ref('straight')  // 'osrm' | 'straight'
  const timedOut = ref(false)

  async function loadRoute(from, to, timeoutMs = 15000) {
    loading.value = true
    error.value = null
    timedOut.value = false
    routePoints.value = []
    routeMode.value = 'straight'
    try {
      origin.value = from
      destination.value = to
      routeName.value = `${from.name} → ${to.name}`

      try {
        const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline6`
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok) throw new Error(`OSRM ${res.status}`)
        const data = await res.json()
        if (!data.routes?.length) throw new Error('No route found')
        const pts = decodePolyline6(data.routes[0].geometry)
        routePoints.value = pts
        totalDistance.value = computeLength(pts)
        routeMode.value = 'osrm'
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') timedOut.value = true
        totalDistance.value = haversine(from.lat, from.lng, to.lat, to.lng)
      }

      routeLoaded.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function updatePosition(lat, lng) {
    if (!routeLoaded.value) return
    const done = routeMode.value === 'osrm' && routePoints.value.length > 1
      ? projectOntoPolyline(lat, lng)
      : projectOntoStraightLine(lat, lng)
    distanceDone.value = done
    distanceLeft.value = totalDistance.value - done
    progress.value = totalDistance.value > 0 ? Math.min(100, (done / totalDistance.value) * 100) : 0
  }

  function projectOntoStraightLine(lat, lng) {
    const dLat = destination.value.lat - origin.value.lat
    const dLng = destination.value.lng - origin.value.lng
    const apLat = lat - origin.value.lat
    const apLng = lng - origin.value.lng
    const lenSq = dLat * dLat + dLng * dLng
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (apLat * dLat + apLng * dLng) / lenSq)) : 0
    return t * totalDistance.value
  }

  function projectOntoPolyline(lat, lng) {
    let bestDist = Infinity
    let bestLinearDist = 0
    let cumDist = 0
    const pts = routePoints.value
    for (let i = 1; i < pts.length; i++) {
      const [lat1, lng1] = pts[i - 1]
      const [lat2, lng2] = pts[i]
      const segLen = haversine(lat1, lng1, lat2, lng2)
      const dLat = lat2 - lat1, dLng = lng2 - lng1
      const apLat = lat - lat1, apLng = lng - lng1
      const lenSq = dLat * dLat + dLng * dLng
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (apLat * dLat + apLng * dLng) / lenSq)) : 0
      const projLat = lat1 + t * dLat
      const projLng = lng1 + t * dLng
      const d = haversine(lat, lng, projLat, projLng)
      if (d < bestDist) {
        bestDist = d
        bestLinearDist = cumDist + t * segLen
      }
      cumDist += segLen
    }
    return Math.max(0, Math.min(totalDistance.value, bestLinearDist))
  }

  function sampleRoutePoints(every = 10000) {
    if (!routeLoaded.value) return []
    if (routeMode.value === 'osrm' && routePoints.value.length > 1) {
      return samplePolyline(routePoints.value, every)
    }
    const count = Math.ceil(totalDistance.value / every) + 1
    return Array.from({ length: count }, (_, i) => {
      const t = Math.min(1, (i * every) / totalDistance.value)
      return {
        lat: origin.value.lat + t * (destination.value.lat - origin.value.lat),
        lng: origin.value.lng + t * (destination.value.lng - origin.value.lng)
      }
    })
  }

  function samplePolyline(pts, every) {
    const samples = [{ lat: pts[0][0], lng: pts[0][1] }]
    let cumDist = 0
    let nextTarget = every
    for (let i = 1; i < pts.length; i++) {
      const segLen = haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
      while (nextTarget <= cumDist + segLen && nextTarget <= totalDistance.value) {
        const t = segLen > 0 ? (nextTarget - cumDist) / segLen : 0
        samples.push({
          lat: pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]),
          lng: pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])
        })
        nextTarget += every
      }
      cumDist += segLen
    }
    const last = pts[pts.length - 1]
    const tail = samples[samples.length - 1]
    if (tail.lat !== last[0] || tail.lng !== last[1]) samples.push({ lat: last[0], lng: last[1] })
    return samples
  }

  function restoreRoute({ totalDistance: dist, origin: org, destination: dest, routeName: name }) {
    totalDistance.value = dist
    origin.value = org
    destination.value = dest
    routeName.value = name
    routePoints.value = []
    routeMode.value = 'straight'
    routeLoaded.value = true
  }

  return {
    loadRoute, updatePosition, sampleRoutePoints, restoreRoute,
    totalDistance, progress,
    distanceDone, distanceLeft, routeLoaded,
    routeName, origin, destination, loading, error,
    routePoints, routeMode, timedOut
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function decodePolyline6(encoded) {
  const coords = []
  let lat = 0, lng = 0, i = 0
  while (i < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0; result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    coords.push([lat / 1e6, lng / 1e6])
  }
  return coords
}

function computeLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
  return total
}
