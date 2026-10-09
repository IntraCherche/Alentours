// Single IndexedDB opener shared by the town and POI caches.
// Both used to open the same DB with different versions, so whichever opened
// first could leave the other store missing. A pending open (blocked by another
// connection, or stuck after the tablet slept) now times out and is retried.

const DB_NAME     = 'alentours-wiki'
const DB_VERSION  = 3
const OPEN_TIMEOUT_MS = 5000

let _dbPromise = null

export function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const fail = (err) => { _dbPromise = null; reject(err) }
    const timer = setTimeout(() => fail(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS)

    let req
    try { req = indexedDB.open(DB_NAME, DB_VERSION) } catch (e) { clearTimeout(timer); return fail(e) }

    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('towns')) db.createObjectStore('towns', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pois'))  db.createObjectStore('pois',  { keyPath: 'id' })
    }
    req.onsuccess = e => {
      clearTimeout(timer)
      const db = e.target.result
      // Let a newer connection upgrade/close us, and drop the handle if the browser closes it.
      db.onversionchange = () => { db.close(); _dbPromise = null }
      db.onclose         = () => { _dbPromise = null }
      resolve(db)
    }
    req.onerror   = e => { clearTimeout(timer); fail(e.target.error) }
    req.onblocked = () => { /* the timeout above rejects if it stays blocked */ }
  })
  return _dbPromise
}

// Rejects instead of hanging if a transaction never settles.
export function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB timed out')), ms))
  ])
}
