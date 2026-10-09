// Permanent cross-trip Wikipedia/Wikidata cache backed by IndexedDB.
// Keyed by OSM node ID (number). No size limit, survives app restarts.
import { openDB, withTimeout } from './idb.js'

const STORE_NAME = 'towns'

// Returns { [osmId]: wikiObj } for every id found in the cache.
export async function wikiCacheGetMany(ids, lang) {
  if (!ids.length) return {}
  const db = await openDB()
  return withTimeout(new Promise(resolve => {
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
  }))
}

// Persists an array of { id, wiki } entries. Overwrites existing entries.
export async function wikiCachePutMany(entries, lang) {
  if (!entries.length) return
  const db = await openDB()
  return withTimeout(new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    for (const entry of entries) store.put({ id: `${entry.id}_${lang}`, wiki: entry.wiki })
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
    tx.onabort    = e => reject(e.target.error)
  }))
}
