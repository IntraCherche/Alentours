const SESSION_KEY   = 'motorhome-session'
const LOCATIONS_KEY = 'motorhome-locations'
const RECENT_KEY    = 'motorhome-recent-locations'
const MAX_RECENT    = 8

export function useSession() {
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function saveSession(data) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
    } catch {}
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY)
  }

  // Persists just the start/end locations so they survive when there is no active trip
  function saveLocations(fromPlace, toPlace) {
    if (!fromPlace && !toPlace) return
    try {
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify({ fromPlace, toPlace }))
    } catch {}
  }

  function loadLocations() {
    try {
      const raw = localStorage.getItem(LOCATIONS_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function loadRecentLocations() {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function saveRecentLocation(place) {
    if (!place?.name) return
    try {
      const list = loadRecentLocations()
      const deduped = list.filter(p =>
        !(Math.abs(p.lat - place.lat) < 0.001 && Math.abs(p.lng - place.lng) < 0.001)
      )
      deduped.unshift({ name: place.name, lat: place.lat, lng: place.lng })
      localStorage.setItem(RECENT_KEY, JSON.stringify(deduped.slice(0, MAX_RECENT)))
    } catch {}
  }

  return { loadSession, saveSession, clearSession, saveLocations, loadLocations, saveRecentLocation, loadRecentLocations }
}
