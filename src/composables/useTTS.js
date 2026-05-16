import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')

watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    const ss = window.speechSynthesis
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    // cancel() is asynchronous on mobile browsers — a brief gap is required before speak()
    ss.cancel()
    setTimeout(() => ss.speak(utt), 50)
  }

  return { ttsEnabled, speak }
}
