<template>
  <Transition name="pocket-lock">
    <div
      v-if="locked"
      class="pocket-lock"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchCancel"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
      @contextmenu.prevent
    >
      <div class="pocket-lock__icon">🔒</div>

      <template v-if="gesture === 'swipe'">
        <div class="pocket-lock__arrow">↑</div>
        <div class="pocket-lock__hint">{{ t('pocketLockHintSwipe') }}</div>
      </template>

      <template v-else>
        <div class="hold-ring" :class="{ 'hold-ring--active': holding }">
          <svg viewBox="0 0 36 36" class="hold-ring__svg">
            <circle class="hold-ring__bg" cx="18" cy="18" r="15.9" />
            <circle
              class="hold-ring__fill"
              cx="18" cy="18" r="15.9"
              stroke-dasharray="100 100"
              :stroke-dashoffset="100 - holdPct"
            />
          </svg>
        </div>
        <div class="pocket-lock__hint">{{ t('pocketLockHintHold') }}</div>
      </template>
    </div>
  </Transition>
</template>

<script setup>
import { ref } from 'vue'
import { useLocale } from '../composables/useLocale.js'

const props = defineProps({
  locked:  { type: Boolean, required: true },
  gesture: { type: String,  default: 'swipe' },
})
const emit = defineEmits(['unlock'])

const { t } = useLocale()

// ── Swipe up ──────────────────────────────────────────────────────────
let touchStartY = 0

function onTouchStart(e) {
  if (props.gesture !== 'swipe') return
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e) {
  if (props.gesture !== 'swipe') return
  const dy = touchStartY - e.changedTouches[0].clientY
  if (dy > 80) emit('unlock')
}

function onTouchCancel() {
  touchStartY = 0
}

// ── Hold ─────────────────────────────────────────────────────────────
const holding = ref(false)
const holdPct = ref(0)
let holdInterval = null

function onPointerDown(e) {
  if (props.gesture !== 'hold') return
  e.preventDefault()
  holding.value = true
  holdPct.value = 0
  const start = Date.now()
  holdInterval = setInterval(() => {
    holdPct.value = Math.min(100, ((Date.now() - start) / 1500) * 100)
    if (holdPct.value >= 100) {
      clearInterval(holdInterval)
      holdInterval = null
      holding.value = false
      holdPct.value = 0
      emit('unlock')
    }
  }, 30)
}

function onPointerUp() {
  if (!holding.value) return
  clearInterval(holdInterval)
  holdInterval = null
  holding.value = false
  holdPct.value = 0
}
</script>

<style scoped>
.pocket-lock {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(0, 0, 0, 0.88);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.pocket-lock__icon {
  font-size: 52px;
  line-height: 1;
}

.pocket-lock__arrow {
  font-size: 36px;
  color: rgba(255, 255, 255, 0.5);
  animation: bounce-up 1.4s ease-in-out infinite;
}

.pocket-lock__hint {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.04em;
}

/* ── Hold ring ──────────────────────────────────────────────────── */
.hold-ring {
  width: 72px;
  height: 72px;
}

.hold-ring__svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.hold-ring__bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.15);
  stroke-width: 3;
  stroke-dasharray: 100 100;
  stroke-dashoffset: 0;
}

.hold-ring__fill {
  fill: none;
  stroke: #f0a500;
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.03s linear;
}

/* ── Animations ─────────────────────────────────────────────────── */
@keyframes bounce-up {
  0%, 100% { transform: translateY(0);    opacity: 0.4; }
  50%       { transform: translateY(-10px); opacity: 1;   }
}

/* ── Transition ─────────────────────────────────────────────────── */
.pocket-lock-enter-active,
.pocket-lock-leave-active {
  transition: opacity 0.2s ease;
}
.pocket-lock-enter-from,
.pocket-lock-leave-to {
  opacity: 0;
}
</style>
