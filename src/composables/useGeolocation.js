import { ref, onUnmounted } from 'vue'

export function useGeolocation() {
  const position = ref(null)   // { lat, lng, heading, speed, accuracy }
  const error = ref(null)
  const watching = ref(false)

  let watchId  = null
  let wakeLock = null
  let lastFixAt = 0
  let watchdog  = null

  // Android can silently stop delivering fixes after sleep/background without any error.
  // If nothing arrives for a while, drop the watch and register a fresh one.
  const STALE_MS = 30_000

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => { wakeLock = null })
    } catch (e) {}
  }

  function releaseWakeLock() {
    wakeLock?.release()
    wakeLock = null
  }

  // The OS releases the wake lock when the page is hidden; re-acquire on return.
  function onVisibilityChange() {
    if (document.visibilityState !== 'visible' || !watching.value) return
    if (!wakeLock) requestWakeLock()
    restartWatch()   // the watch is often dead after the tablet slept
  }

  function registerWatch() {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        lastFixAt = Date.now()
        position.value = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,   // degrees from north, null if unavailable
          speed: pos.coords.speed,       // m/s, null if unavailable
          accuracy: pos.coords.accuracy  // metres
        }
        error.value = null
      },
      (err) => {
        error.value = err.message
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,   // accept cached position up to 2s old
        timeout: 10000
      }
    )
  }

  function restartWatch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    lastFixAt = Date.now()
    registerWatch()
  }

  function start() {
    if (watchId !== null) return
    if (!navigator.geolocation) {
      error.value = 'Geolocation not supported by this browser.'
      return
    }
    watching.value = true
    lastFixAt = Date.now()
    registerWatch()
    watchdog = setInterval(() => {
      if (Date.now() - lastFixAt > STALE_MS) restartWatch()
    }, 10_000)
    requestWakeLock()
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stop() {
    clearInterval(watchdog)
    watchdog = null
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
      watching.value = false
    }
    releaseWakeLock()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  onUnmounted(stop)

  return { position, error, watching, start, stop }
}
