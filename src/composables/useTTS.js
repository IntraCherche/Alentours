import { ref, watch } from 'vue'

const ttsEnabled = ref(localStorage.getItem('tts-enabled') !== 'false')

watch(ttsEnabled, (v) => localStorage.setItem('tts-enabled', String(v)))

// iOS cancel() is asynchronous; speaking immediately after drops the utterance
const isIOSDevice = /iP(hone|ad|od)/i.test(navigator.userAgent)

export function useTTS() {
  function speak(text, lang = 'en') {
    if (!ttsEnabled.value || !window.speechSynthesis) return
    const ss = window.speechSynthesis
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang === 'fr' ? 'fr-FR' : 'en-US'
    ss.cancel()
    if (isIOSDevice) {
      setTimeout(() => ss.speak(utt), 50)
    } else {
      ss.speak(utt)
    }
  }

  return { ttsEnabled, speak }
}
