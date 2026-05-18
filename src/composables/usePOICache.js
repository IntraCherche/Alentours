// Permanent foot-mode POI cache backed by IndexedDB.
// Keyed by `${qid}_${lang}`. Stores full POI objects including Wikipedia extracts.
// A separate 'poi-anchors' store records the (lat, lng, radiusKm) of each prefetch
// so the UI can show what was downloaded.

const DB_NAME    = 'alentours-wiki'
const STORE_POIS = 'pois'
const DB_VERSION = 3

let _dbPromise = null

function openDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = e => {
        const db = e.target.result
        // v2 store (towns) may already exist — do not touch it
        if (!db.objectStoreNames.contains('towns')) {
          db.createObjectStore('towns', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_POIS)) {
          db.createObjectStore(STORE_POIS, { keyPath: 'id' })
        }
      }
      req.onsuccess = e => resolve(e.target.result)
      req.onerror   = e => { _dbPromise = null; reject(e.target.error) }
    })
  }
  return _dbPromise
}

// Store an array of POI objects for a given language.
// Each entry: { id: qid, name, description, lat, lng, image, wikiTitle, wiki }
export async function poiCachePutMany(pois, lang) {
  if (!pois.length) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_POIS, 'readwrite')
    const store = tx.objectStore(STORE_POIS)
    for (const poi of pois) {
      store.put({ id: `${poi.id}_${lang}`, lang, ...poi })
    }
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

// Return all cached POIs for a language as an array.
export async function poiCacheGetAll(lang) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_POIS, 'readonly')
    const store = tx.objectStore(STORE_POIS)
    const req   = store.getAll()
    req.onsuccess = () => {
      resolve(req.result.filter(r => r.lang === lang))
    }
    req.onerror = e => reject(e.target.error)
  })
}

// Return the count of cached POIs for a language.
export async function poiCacheCount(lang) {
  const all = await poiCacheGetAll(lang)
  return all.length
}

// Remove all cached POIs.
export async function poiCacheClear() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_POIS, 'readwrite')
    const store = tx.objectStore(STORE_POIS)
    const req   = store.clear()
    req.onsuccess = () => resolve()
    req.onerror   = e => reject(e.target.error)
  })
}
