import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')

watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    const ss = window.speechSynthesis
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    if (ss.speaking || ss.pending) {
      ss.cancel()
      // iOS requires a brief gap after cancel() before the next speak() registers
      setTimeout(() => ss.speak(utt), 50)
    } else {
      if (ss.paused) ss.resume()  // iOS can get stuck in a paused state
      ss.speak(utt)
    }
  }

  return { ttsEnabled, speak }
}
