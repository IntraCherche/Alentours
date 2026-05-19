<template>
  <div class="trip-tabs">
    <div class="tabs-scroll">
      <button
        v-for="trip in trips"
        :key="trip.id"
        class="tab"
        :class="{ 'tab--active': trip.id === activeTripId }"
        @click="$emit('switch', trip.id)"
      >
        <div class="tab__content">
          <span class="tab__dest">{{ trip.destination?.name ?? trip.toPlace?.name ?? '?' }}</span>
          <span class="tab__pct">{{ Math.round(trip.id === activeTripId && props.liveProgress !== null ? props.liveProgress : (trip.progress ?? 0)) }}%</span>
        </div>
        <div class="tab__bar">
          <div class="tab__fill" :style="{ width: (trip.id === activeTripId && props.liveProgress !== null ? props.liveProgress : (trip.progress ?? 0)) + '%' }"></div>
        </div>
        <span class="tab__close" role="button" @click.stop="$emit('delete', trip.id)" title="Delete trip">×</span>
      </button>
    </div>
    <button class="tab-new" @click="$emit('new')" title="New trip">+</button>
  </div>
</template>

<script setup>
const props = defineProps({
  trips:        { type: Array,  default: () => [] },
  activeTripId: { type: String, default: null },
  liveProgress: { type: Number, default: null }
})
defineEmits(['switch', 'new', 'delete'])
</script>

<style scoped>
.trip-tabs {
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  background: var(--bg-deep);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 36px;
  gap: 0;
}

.tabs-scroll {
  display: flex;
  align-items: stretch;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  height: 100%;
  scrollbar-width: none;
}
.tabs-scroll::-webkit-scrollbar { display: none; }

.tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 0 1.4rem 0 0.65rem;
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  cursor: pointer;
  min-width: 80px;
  max-width: 150px;
  height: 100%;
  gap: 2px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.tab:hover { background: var(--bg-card); }
.tab--active {
  background: var(--bg-panel);
  box-shadow: inset 0 -2px 0 var(--accent);
}

.tab__content {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  width: 100%;
  overflow: hidden;
}
.tab__dest {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.tab--active .tab__dest { color: var(--text-primary); }

.tab__pct {
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--text-dim);
  flex-shrink: 0;
}
.tab--active .tab__pct { color: var(--accent); }

.tab__bar {
  width: 100%;
  height: 2px;
  background: var(--bg-deep);
  border-radius: 1px;
  overflow: hidden;
}
.tab__fill {
  height: 100%;
  background: var(--accent);
  border-radius: 1px;
  transition: width 1s ease;
  opacity: 0.5;
}
.tab--active .tab__fill { opacity: 1; }

.tab__close {
  position: absolute;
  top: 50%;
  right: 2px;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.85rem;
  line-height: 1;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
  border-radius: 3px;
  transition: color 0.15s, background 0.15s;
}
.tab__close:hover {
  color: #cc3333;
  background: var(--bg-deep);
}

.tab-new {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  margin-left: 0.5rem;
  transition: border-color 0.15s, color 0.15s;
}
.tab-new:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
