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

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    console.log('[TTS] speak() lang=%s length=%d\n%s', lang, text.length, text)
    const ss  = window.speechSynthesis
    const utt = new SpeechSynthesisUtterance(text)
    _activeUtt = utt  // prevent GC before the utterance is spoken
    utt.lang  = lang === 'fr' ? 'fr-FR' : 'en-US'
    if (ss.speaking || ss.pending) {
      // cancel() is asynchronous on mobile — a brief gap is required before speak()
      ss.cancel()
      setTimeout(() => ss.speak(utt), 50)
    } else {
      // Nothing was queued: calling cancel() on an idle synthesis breaks it on
      // Chrome/Android, silently swallowing the next speak() call.
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
