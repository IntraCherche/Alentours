import { ref, onUnmounted } from 'vue'

export function useGeolocation() {
  const position = ref(null)   // { lat, lng, heading, speed, accuracy }
  const error = ref(null)
  const watching = ref(false)

  let watchId  = null
  let wakeLock = null

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
    if (document.visibilityState === 'visible' && watching.value && !wakeLock) {
      requestWakeLock()
    }
  }

  function start() {
    if (watchId !== null) return
    if (!navigator.geolocation) {
      error.value = 'Geolocation not supported by this browser.'
      return
    }
    watching.value = true
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
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
    requestWakeLock()
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stop() {
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
