import { ref, watch } from 'vue'

const isDark = ref(localStorage.getItem('theme') === 'dark')

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark)
}

applyTheme(isDark.value)

watch(isDark, (dark) => {
  applyTheme(dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
})

export function useTheme() {
  return { isDark, toggle: () => { isDark.value = !isDark.value } }
}
