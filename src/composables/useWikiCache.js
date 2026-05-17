// Permanent cross-trip Wikipedia/Wikidata cache backed by IndexedDB.
// Keyed by OSM node ID (number). No size limit, survives app restarts.

const DB_NAME    = 'alentours-wiki'
const STORE_NAME = 'towns'
const DB_VERSION = 2

let _dbPromise = null

function openDB() {
  if (!_dbPromise) {
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      req.onsuccess = e => resolve(e.target.result)
      req.onerror  = e => { _dbPromise = null; reject(e.target.error) }
    })
  }
  return _dbPromise
}

// Returns { [osmId]: wikiObj } for every id found in the cache.
export async function wikiCacheGetMany(ids, lang) {
  if (!ids.length) return {}
  const db = await openDB()
  return new Promise(resolve => {
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const result = {}
    let remaining = ids.length
    for (const id of ids) {
      const key = `${id}_${lang}`
      const req = store.get(key)
      req.onsuccess = () => {
        if (req.result) result[id] = req.result.wiki
        if (--remaining === 0) resolve(result)
      }
      req.onerror = () => { if (--remaining === 0) resolve(result) }
    }
  })
}

// Persists an array of { id, wiki } entries. Overwrites existing entries.
export async function wikiCachePutMany(entries, lang) {
  if (!entries.length) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const entry of entries) store.put({ id: `${entry.id}_${lang}`, wiki: entry.wiki })
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}
