import { ref, watch, onUnmounted } from 'vue'

export function useDemoMode() {
  const demoEnabled  = ref(localStorage.getItem('demoEnabled') === 'true')
  const demoSpeed    = ref(parseInt(localStorage.getItem('demoSpeed') || '200', 10))  // km/h
  const demoState    = ref('idle')   // 'idle' | 'running' | 'paused'
  const demoPosition = ref(null)
  const demoError    = ref(null)
  const demoLoading  = ref(false)

  watch(demoEnabled, v => localStorage.setItem('demoEnabled', String(v)))
  watch(demoSpeed,   v => localStorage.setItem('demoSpeed',   String(v)))

  let routePoints = []   // [[lat, lng], …] decoded from OSRM polyline6
  let totalLength = 0    // metres
  let cursorDist  = 0    // metres along route
  let intervalId  = null
  let lastTick    = null

  async function loadDemoRoute(from, to) {
    demoLoading.value = true
    demoError.value   = null
    routePoints = []
    totalLength = 0
    cursorDist  = 0
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline6`
      const res  = await fetch(url)
      if (!res.ok) throw new Error(`OSRM ${res.status}`)
      const data = await res.json()
      if (!data.routes?.length) throw new Error('No route found')
      routePoints = decodePolyline6(data.routes[0].geometry)
      totalLength = computeLength(routePoints)
      return true
    } catch (err) {
      demoError.value = err.message
      return false
    } finally {
      demoLoading.value = false
    }
  }

  function tick() {
    const now = Date.now()
    if (lastTick === null) { lastTick = now; return }
    const dt = (now - lastTick) / 1000
    lastTick = now
    cursorDist += (demoSpeed.value / 3.6) * dt
    if (cursorDist >= totalLength) {
      cursorDist = totalLength
      demoPosition.value = positionAt(cursorDist)
      clearInterval(intervalId)
      intervalId = null
      demoState.value = 'idle'
      return
    }
    demoPosition.value = positionAt(cursorDist)
  }

  function startDemo() {
    if (demoState.value === 'running') return
    lastTick = null
    demoState.value = 'running'
    intervalId = setInterval(tick, 200)
  }

  function pauseDemo() {
    if (intervalId) clearInterval(intervalId)
    intervalId = null
    lastTick = null
    demoState.value = 'paused'
  }

  function stopDemo() {
    if (intervalId) clearInterval(intervalId)
    intervalId = null
    lastTick = null
    demoState.value = 'idle'
    cursorDist = 0
    demoPosition.value = null
  }

  function positionAt(dist) {
    let walked = 0
    for (let i = 1; i < routePoints.length; i++) {
      const seg = haversine(routePoints[i - 1], routePoints[i])
      if (walked + seg >= dist) {
        const t   = seg > 0 ? (dist - walked) / seg : 0
        const lat = routePoints[i - 1][0] + t * (routePoints[i][0] - routePoints[i - 1][0])
        const lng = routePoints[i - 1][1] + t * (routePoints[i][1] - routePoints[i - 1][1])
        return {
          lat, lng,
          heading: bearing(routePoints[i - 1], routePoints[i]),
          speed:   demoSpeed.value / 3.6,
          accuracy: 0
        }
      }
      walked += seg
    }
    const last = routePoints[routePoints.length - 1]
    return { lat: last[0], lng: last[1], heading: 0, speed: 0, accuracy: 0 }
  }

  onUnmounted(() => { if (intervalId) clearInterval(intervalId) })

  return {
    demoEnabled, demoSpeed, demoState, demoPosition, demoError, demoLoading,
    loadDemoRoute, startDemo, pauseDemo, stopDemo
  }
}

// ── Geometry helpers ────────────────────────────────────────────────────────

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

function haversine([lat1, lng1], [lat2, lng2]) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function computeLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i])
  return total
}

function bearing([lat1, lng1], [lat2, lng2]) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const y  = Math.sin(Δλ) * Math.cos(φ2)
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
