import { ref, watch } from 'vue'

const GESTURE_KEY = 'pocketLockGesture'

const locked  = ref(false)
const gesture = ref(localStorage.getItem(GESTURE_KEY) || 'swipe')

watch(gesture, v => localStorage.setItem(GESTURE_KEY, v))

export function usePocketLock() {
  function lock()   { locked.value = true  }
  function unlock() { locked.value = false }
  return { locked, gesture, lock, unlock }
}
