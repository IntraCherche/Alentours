import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')
watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

// Per-session deduplication: id → timestamp of last announcement.
// Applies globally in both car and foot modes — prevents re-announcing the
// same town or POI for 2 hours (e.g. traffic jam, walking back past a monument).
const announcedAt = new Map()
const COOLDOWN_MS = 2 * 60 * 60 * 1000

// Held at module scope so the browser cannot GC the utterance before it speaks.
let _activeUtt = null

// Chrome requires speechSynthesis.speak() to have been called within a user
// gesture before it allows calls from non-gesture contexts (GPS events, timers).
// Register a one-shot capturing listener: on the first tap/click/key, speak a
// zero-volume space to satisfy that requirement for the rest of the page session.
;(function primeSpeechSynthesis() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const prime = () => {
    document.removeEventListener('click',      prime, true)
    document.removeEventListener('touchstart', prime, true)
    document.removeEventListener('keydown',    prime, true)
    const utt = new SpeechSynthesisUtterance(' ')
    utt.volume = 0
    utt.onerror = () => {}
    window.speechSynthesis.speak(utt)
  }
  document.addEventListener('click',      prime, true)
  document.addEventListener('touchstart', prime, true)
  document.addEventListener('keydown',    prime, true)
})()

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    const ss = window.speechSynthesis
    console.log('[TTS] speak() paused=%s speaking=%s pending=%s voices=%d lang=%s length=%d\n%s',
      ss.paused, ss.speaking, ss.pending, ss.getVoices().length,
      lang, text.length, text)
    const utt = new SpeechSynthesisUtterance(text)
    _activeUtt = utt
    utt.lang   = lang === 'fr' ? 'fr-FR' : 'en-US'
    utt.onstart = () => console.log('[TTS] onstart')
    utt.onend   = () => console.log('[TTS] onend')
    utt.onerror = (e) => console.error('[TTS] onerror', e.error, e)
    if (ss.paused) ss.resume()
    if (ss.speaking || ss.pending) {
      ss.cancel()
      setTimeout(() => ss.speak(utt), 50)
    } else {
      ss.speak(utt)
    }
  }

  function shouldAnnounce(id) {
    const last = announcedAt.get(id)
    return last == null || (Date.now() - last) >= COOLDOWN_MS
  }

  function markAnnounced(id) {
    announcedAt.set(id, Date.now())
  }

  function clearAnnounced() {
    announcedAt.clear()
  }

  return { ttsEnabled, speak, shouldAnnounce, markAnnounced, clearAnnounced }
}
