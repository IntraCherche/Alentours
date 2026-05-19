import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')
watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

const announcedAt = new Map()
const COOLDOWN_MS = 2 * 60 * 60 * 1000

let _activeUtt = null
let _primed    = false
let _pending   = null  // { text, lang }

function _makeUtt(text, lang) {
  const utt  = new SpeechSynthesisUtterance(text)
  _activeUtt = utt
  utt.lang   = lang === 'fr' ? 'fr-FR' : 'en-US'
  utt.onstart = () => console.log('[TTS] onstart')
  utt.onend   = () => console.log('[TTS] onend')
  utt.onerror = (e) => {
    console.error('[TTS] onerror', e.error, e)
    window.speechSynthesis.cancel()  // reset engine state after any error
    if (e.error === 'not-allowed') {
      // Sticky activation was lost — wait for next gesture.
      _primed = false
      _addUnlockListeners()
    }
  }
  return utt
}

// Called SYNCHRONOUSLY within a click/key event — establishes sticky activation.
function _speakFromGesture(text, lang) {
  const ss = window.speechSynthesis
  console.log('[TTS] speakFromGesture voices=%d lang=%s len=%d', ss.getVoices().length, lang, text.length)
  ss.cancel()        // no-op when idle; clears any stale engine state
  ss.speak(_makeUtt(text, lang))
}

// Called from GPS/timer context — relies on sticky activation already granted.
function _speakFromBackground(text, lang) {
  const ss = window.speechSynthesis
  console.log('[TTS] speakFromBackground voices=%d lang=%s len=%d', ss.getVoices().length, lang, text.length)
  if (ss.paused) ss.resume()
  ss.cancel()
  setTimeout(() => ss.speak(_makeUtt(text, lang)), 100)
}

function _onGesture() {
  if (_primed) return
  _primed = true
  _removeUnlockListeners()
  console.log('[TTS] gesture unlock — pending=%s', _pending ? 'yes' : 'no')
  if (_pending) {
    const { text, lang } = _pending
    _pending = null
    _speakFromGesture(text, lang)
  }
}

function _addUnlockListeners() {
  // bubble phase for click: button handlers queue their text first, then we flush
  // touchstart is NOT a user-activation trigger per HTML spec; click and keydown are
  document.addEventListener('click',   _onGesture)
  document.addEventListener('keydown', _onGesture, true)
}

function _removeUnlockListeners() {
  document.removeEventListener('click',   _onGesture)
  document.removeEventListener('keydown', _onGesture, true)
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  // Reset any engine state left over from previous HMR reloads or failed speaks.
  window.speechSynthesis.cancel()
  _addUnlockListeners()
}

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    if (!_primed) {
      console.log('[TTS] not yet unlocked — queuing (len=%d)', text.length)
      _pending = { text, lang }
      return
    }
    _speakFromBackground(text, lang)
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
