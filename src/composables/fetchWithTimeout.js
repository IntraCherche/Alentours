/**
 * fetch() that always gives up after `timeoutMs` (a stalled mobile connection
 * otherwise never resolves nor rejects, leaving "loading" flags stuck forever).
 * An optional external `signal` (e.g. a Cancel button) aborts it too.
 * Uses a plain AbortController: AbortSignal.any/timeout are missing on older tablets.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000, signal = null) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  const onExternalAbort = () => ctrl.abort(signal.reason)
  if (signal) {
    if (signal.aborted) onExternalAbort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    // On success the timer stays armed on purpose: it also covers the caller's res.json(),
    // and aborting an already-finished request is a no-op.
    return await fetch(url, { ...options, signal: ctrl.signal })
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}
