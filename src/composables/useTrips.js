const TRIPS_KEY = 'motorhome-trips'

export function useTrips() {
  function listTrips() {
    try { return JSON.parse(localStorage.getItem(TRIPS_KEY) || '[]') } catch { return [] }
  }

  function saveTrip(trip) {
    const trips = listTrips()
    const idx = trips.findIndex(t => t.id === trip.id)
    if (idx >= 0) trips[idx] = trip
    else trips.push(trip)
    try { localStorage.setItem(TRIPS_KEY, JSON.stringify(trips)) } catch {}
  }

  function deleteTrip(id) {
    const trips = listTrips().filter(t => t.id !== id)
    try { localStorage.setItem(TRIPS_KEY, JSON.stringify(trips)) } catch {}
  }

  function getTrip(id) {
    return listTrips().find(t => t.id === id) ?? null
  }

  return { listTrips, saveTrip, deleteTrip, getTrip }
}
