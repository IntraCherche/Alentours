import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')

watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    window.speechSynthesis.speak(utt)
  }

  return { ttsEnabled, speak }
}
