/**
 * useGeocoding — city name → coordinates via Nominatim (OSM, free, no key)
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function geocode(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=3`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'motorhome-dashboard/1.0' }
  })
  if (!res.ok) throw new Error('Geocoding failed')
  const results = await res.json()
  if (!results.length) throw new Error(`No results found for "${query}"`)
  // Return top result
  return {
    name: results[0].display_name.split(',').slice(0, 2).join(',').trim(),
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon)
  }
}

function buildLabel(r) {
  const a = r.address || {}
  const city     = a.city || a.town || a.village || a.hamlet || ''
  const postcode = a.postcode || ''
  const cityLine = [city, postcode].filter(Boolean).join(' ')

  let primary = ''
  if (a.house_number && a.road) primary = `${a.house_number} ${a.road}`
  else if (a.road)              primary = a.road
  else if (r.name)              primary = r.name

  if (primary && primary !== city) return [primary, cityLine].filter(Boolean).join(', ')
  return cityLine || r.display_name.split(',')[0]
}

export async function geocodeSuggestions(query) {
  if (query.length < 2) return []
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'motorhome-dashboard/1.0' }
  })
  if (!res.ok) return []
  const results = await res.json()
  return results.map(r => ({
    name: buildLabel(r),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon)
  }))
}
