const SESSION_KEY   = 'motorhome-session'
const LOCATIONS_KEY = 'motorhome-locations'

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

  return { loadSession, saveSession, clearSession, saveLocations, loadLocations }
}
