<template>
  <div class="app" :style="{ '--town-scale': townFontScale }">

    <!-- ── TOP BAR ──────────────────────────────────────────────── -->
    <header class="topbar">
      <div class="topbar__row">
        <div class="topbar__route">{{ routeName || t('noRoute') }}</div>
        <div class="menu-wrap">
          <button class="icon-btn menu-btn" :class="{ active: menuOpen }" @click="menuOpen = !menuOpen" title="Menu">☰</button>
          <Transition name="menu">
            <div v-if="menuOpen" class="menu-dropdown">
              <button class="menu-item" @click="settingsOpen = true; menuOpen = false">
                <span class="menu-item__icon">⚙</span>
                <span>{{ t('settings') }}</span>
              </button>
              <button class="menu-item" @click="aboutOpen = true; menuOpen = false">
                <span class="menu-item__icon">ⓘ</span>
                <span>{{ t('about') }}</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
      <template v-if="routeLoaded">
        <div class="progress-track">
          <div class="progress-fill" :style="progressFillStyle"></div>
          <div class="progress-thumb" :style="{ left: (progress ?? 0) + '%' }">{{ vehicleIcon }}</div>
        </div>
        <div class="progress-stats">
          <span>{{ formatKm(distanceDone) }}</span>
          <span class="progress-pct">{{ progress?.toFixed(0) ?? 0 }}%</span>
          <span>{{ formatKm(distanceLeft) }}</span>
        </div>
        <div class="speed-row">
          <div class="speed-cell">
            <span class="speed-label">{{ t('currentSpeed') }}</span>
            <span class="speed-val">{{ position?.speed != null ? formatSpeed(position.speed) : '—' }}</span>
          </div>
          <div class="speed-cell">
            <span class="speed-label">{{ t('avgSpeed') }}</span>
            <span class="speed-val">{{ avgSpeedMs ? formatSpeed(avgSpeedMs) : '—' }}</span>
          </div>
          <div class="speed-cell">
            <span class="speed-label">{{ t('remaining') }}</span>
            <span class="speed-val">{{ remainingDuration ? formatDuration(remainingDuration) : '—' }}</span>
          </div>
          <div class="speed-cell">
            <span class="speed-label">{{ t('drivenDistance') }}</span>
            <span class="speed-val">{{ drivenDistance > 0 ? formatKm(drivenDistance) : '—' }}</span>
          </div>
        </div>
      </template>
    </header>
    <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false"></div>

    <!-- ── iOS AUTO-LOCK HINT ─────────────────────────────────────── -->
    <Transition name="ios-hint">
      <div v-if="showIosHint" class="ios-hint">
        {{ t('iosAutoLockHint') }}
        <button class="ios-hint__close" @click="dismissIosHint">✕</button>
      </div>
    </Transition>

    <!-- ── TRIP TABS ─────────────────────────────────────────────── -->
    <TripTabs
      v-if="savedTrips.length > 0"
      :trips="savedTrips"
      :active-trip-id="activeTripId"
      :live-progress="progress"
      @switch="switchToTrip"
      @new="createNewTrip"
      @delete="deleteTripById"
    />

    <!-- ── MAIN GRID ────────────────────────────────────────────── -->
    <main class="main">
      <div class="map-wrap" ref="mapContainer"></div>

      <aside class="aside" ref="asideRef">
      <div
        class="aside-inner"
        ref="asideInnerRef"
        :class="{ 'aside-inner--scroll': asideScrollDist > 0 }"
        :style="asideScrollDist > 0 ? { '--aside-dist': `-${asideScrollDist}px`, '--aside-dur': `${asideScrollDur}s` } : {}"
      >

        <!-- Nearest town -->
        <div class="panel panel--town" v-if="displayedNearest">
          <div class="panel__label">{{ t('nearestTown') }}</div>
          <div class="town-header">
            <div class="town-name-row">
              <span v-if="displayedNearest.side !== 'unknown'" class="town-arrow" :class="displayedNearest.side">{{ sideArrow(displayedNearest.side) }}</span>
              <div class="town-name">{{ displayedNearest.name }}</div>
              <span v-if="displayedNearest.side !== 'unknown'" class="town-arrow" :class="displayedNearest.side">{{ sideArrow(displayedNearest.side) }}</span>
            </div>
            <img v-if="displayedNearest.wiki?.coat" :src="displayedNearest.wiki.coat" :alt="displayedNearest.name" class="town-coat" />
            <div v-else class="town-side" :class="displayedNearest.side">{{ sideLabel(displayedNearest.side) }}</div>
          </div>
          <div class="town-dist">{{ t('awayDist').replace('{dist}', formatKm(displayedNearest.distance)) }} · {{ t('place_' + displayedNearest.place) }}</div>

          <!-- Landmark image -->
          <img
            v-if="displayedNearest.wiki?.thumbnail"
            :src="displayedNearest.wiki.thumbnail"
            :alt="displayedNearest.name"
            class="town-thumbnail"
          />

          <!-- Enriched fact rows -->
          <div v-if="displayedNearest.wiki" class="town-facts">
            <div v-if="displayedNearest.wiki.nickname" class="fact-row">
              <span class="fact-key">{{ t('nickname') }}</span>
              <span class="fact-val"><em>{{ displayedNearest.wiki.nickname }}</em></span>
            </div>
            <div v-if="displayedNearest.wiki.population" class="fact-row">
              <span class="fact-key">{{ t('population') }}</span>
              <span class="fact-val">{{ formatPopulation(displayedNearest.wiki.population) }}</span>
            </div>
            <div v-if="displayedNearest.wiki.elevation != null" class="fact-row">
              <span class="fact-key">{{ t('elevation') }}</span>
              <span class="fact-val">{{ displayedNearest.wiki.elevation }} m</span>
            </div>
            <div v-if="displayedNearest.wiki.demonyms?.length" class="fact-row">
              <span class="fact-key">{{ t('inhabitants') }}</span>
              <span class="fact-val">{{ displayedNearest.wiki.demonyms.join(' / ') }}</span>
            </div>
            <div v-if="displayedNearest.wiki.rivers?.length" class="fact-row">
              <span class="fact-key">{{ t('rivers') }}</span>
              <span class="fact-val">{{ displayedNearest.wiki.rivers.join(', ') }}</span>
            </div>
            <div v-if="displayedNearest.wiki.department" class="fact-row">
              <span class="fact-key">{{ t('department') }}</span>
              <span class="fact-val">
                {{ displayedNearest.wiki.department }}<span v-if="displayedNearest.wiki.departmentCode" class="fact-sub"> ({{ displayedNearest.wiki.departmentCode }})</span><span v-if="displayedNearest.wiki.region" class="fact-sub"> · {{ displayedNearest.wiki.region }}</span>
              </span>
            </div>
            <div v-if="displayedNearest.wiki.mayor" class="fact-row">
              <span class="fact-key">{{ t('mayor') }}</span>
              <span class="fact-val">
                <span class="gender-sign" :class="displayedNearest.wiki.mayorGender">{{ displayedNearest.wiki.mayorGender === 'female' ? '♀' : displayedNearest.wiki.mayorGender === 'male' ? '♂' : '' }}</span>{{ displayedNearest.wiki.mayor }}
              </span>
            </div>
          </div>

          <div v-if="displayedNearest.wiki" class="town-extract">{{ displayedNearest.wiki.extract }}</div>
          <div v-else class="town-extract town-extract--dim">{{ t('noDescription') }}</div>
        </div>

        <!-- No city in range (city filter active, GPS running, query done) -->
        <div v-else-if="minPlaceType === 'city' && position && !townsLoading" class="panel panel--waiting">
          <div class="waiting-icon">🏙</div>
          <div class="waiting-text">{{ t('noCityInSight') }}</div>
        </div>

        <!-- Waiting -->
        <div v-if="!position" class="panel panel--waiting">
          <div class="waiting-icon">⌛</div>
          <div class="waiting-text">
            <template v-if="routeLoaded">{{ t('startGpsHint') }}</template>
            <template v-else>
              {{ t('planTripHintPre') }}
              <button class="inline-gear-btn" @click="settingsOpen = true">⚙</button>
              {{ t('planTripHintPost') }}
              <br><small>{{ t('planTripSub') }}</small>
            </template>
          </div>
        </div>

      </div><!-- /aside-inner -->
      </aside>
    </main>

    <!-- ── SETTINGS DRAWER ──────────────────────────────────────── -->
    <div v-if="settingsOpen" class="backdrop" @click="settingsOpen = false"></div>

    <Transition name="drawer">
      <div class="settings-drawer" v-if="settingsOpen">

        <div class="drawer-header">
          <span class="drawer-title">{{ t('settings') }}</span>
          <button class="icon-btn" @click="settingsOpen = false">✕</button>
        </div>

        <!-- Tab bar -->
        <div class="drawer-tabs">
          <button class="drawer-tab" :class="{ active: activeTab === 'trip' }" @click="activeTab = 'trip'">{{ t('tabTrip') }}</button>
          <button class="drawer-tab" :class="{ active: activeTab === 'display' }" @click="activeTab = 'display'">{{ t('tabDisplay') }}</button>
          <button class="drawer-tab" :class="{ active: activeTab === 'audio' }" @click="activeTab = 'audio'">{{ t('tabAudio') }}</button>
        </div>

        <!-- ── TAB: TRIP ──────────────────────────────────────────── -->
        <template v-if="activeTab === 'trip'">

          <!-- Trip setup -->
          <section class="drawer-section" v-if="!routeLoaded">
            <div class="section-label">{{ t('planTrip') }}</div>

            <div class="input-group">
              <label class="input-label">{{ t('fromLabel') }}</label>
              <div class="autocomplete">
                <input class="text-input" v-model="fromQuery" :placeholder="t('fromPlaceholder')"
                  @input="onFromInput" @keydown.enter="selectFirstFrom" />
                <ul v-if="fromSuggestions.length" class="suggestions">
                  <li v-for="s in fromSuggestions" :key="s.lat + s.lng" class="suggestion" @click="selectFrom(s)">{{ s.name }}</li>
                </ul>
              </div>
              <span v-if="fromPlace" class="resolved">✓ {{ fromPlace.name }}</span>
            </div>

            <div class="input-group">
              <label class="input-label">{{ t('toLabel') }}</label>
              <div class="autocomplete">
                <input class="text-input" v-model="toQuery" :placeholder="t('toPlaceholder')"
                  @input="onToInput" @keydown.enter="selectFirstTo" />
                <ul v-if="toSuggestions.length" class="suggestions">
                  <li v-for="s in toSuggestions" :key="s.lat + s.lng" class="suggestion" @click="selectTo(s)">{{ s.name }}</li>
                </ul>
              </div>
              <span v-if="toPlace" class="resolved">✓ {{ toPlace.name }}</span>
            </div>

            <button class="btn btn--primary" :disabled="!fromPlace || !toPlace || routeLoading" @click="startTrip">
              {{ routeLoading ? t('buildingRoute') : t('startTrip') }}
            </button>
            <p v-if="routeError" class="error-text">{{ routeError }}</p>
          </section>

          <!-- Pre-fetching towns -->
          <section class="drawer-section" v-if="routeLoaded && prefetching">
            <div class="section-label">{{ t('preloadingTowns') }}</div>
            <div class="mini-progress">
              <div class="mini-progress__bar" :style="{ width: prefetchProgress + '%' }"></div>
            </div>
            <p class="meta-text">{{ prefetchProgress }}% · {{ prefetchElapsed }} s — <template v-if="prefetchCurrentTown">{{ t('preloadingWikiFor') }} {{ prefetchCurrentTown }}</template><template v-else>{{ t('queryingMapData') }}</template></p>
          </section>

          <!-- Active trip -->
          <section class="drawer-section" v-if="routeLoaded && !prefetching">
            <div class="section-label">{{ t('activeTrip') }}</div>
            <div class="route-banner">
              <span>{{ origin?.name }}</span>
              <span class="route-arrow">→</span>
              <span>{{ destination?.name }}</span>
            </div>
            <p class="meta-text">{{ formatKm(totalDistance) }} {{ t('total') }}</p>
            <button class="btn btn--small" @click="createNewTrip">{{ t('newTrip') }}</button>
          </section>

          <!-- GPS -->
          <section class="drawer-section" v-if="routeLoaded && !prefetching">
            <div class="section-label">{{ t('gps') }}</div>
            <button class="btn" :class="{ active: watching }" @click="toggleGps">
              {{ watching ? t('stopGps') : t('startGps') }}
            </button>
            <p v-if="position" class="meta-text">
              {{ position.lat.toFixed(5) }}, {{ position.lng.toFixed(5) }}
              <span v-if="position.speed != null"> · {{ formatSpeed(position.speed) }}</span>
            </p>
            <p v-if="geoError" class="error-text">{{ geoError }}</p>
          </section>

          <!-- Cache mode -->
          <section class="drawer-section">
            <div class="section-label">{{ t('cacheMode') }}</div>
            <select class="text-input lang-select" v-model="cacheMode">
              <option value="none">{{ t('cacheModeNone') }}</option>
              <option value="balanced">{{ t('cacheModeBalanced') }}</option>
              <option value="offline">{{ t('cacheModeOffline') }}</option>
            </select>
          </section>

        </template>

        <!-- ── TAB: DISPLAY ───────────────────────────────────────── -->
        <template v-if="activeTab === 'display'">

          <!-- Language -->
          <section class="drawer-section">
            <div class="section-label">{{ t('language') }}</div>
            <select class="text-input lang-select" v-model="lang">
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </section>

          <!-- Theme -->
          <section class="drawer-section">
            <div class="section-label">{{ t('theme') }}</div>
            <select class="text-input lang-select" v-model="themeValue">
              <option value="light">{{ t('themeLight') }}</option>
              <option value="dark">{{ t('themeDark') }}</option>
            </select>
          </section>

          <!-- Distance units -->
          <section class="drawer-section">
            <div class="section-label">{{ t('distanceUnits') }}</div>
            <select class="text-input lang-select" v-model="distanceUnit">
              <option value="metric">{{ t('distanceMetric') }}</option>
              <option value="imperial">{{ t('distanceImperial') }}</option>
            </select>
          </section>

          <!-- Town info text size -->
          <section class="drawer-section">
            <div class="section-label">{{ t('textSize') }}</div>
            <div class="size-control">
              <span class="size-a">A</span>
              <div class="size-track">
                <div class="size-bar" :style="{ width: ((townFontScale - 0.8) / 1.2 * 100) + '%' }"></div>
                <input type="range" class="size-range" v-model.number="townFontScale" min="0.8" max="2.0" step="0.1" />
              </div>
              <span class="size-a size-a--lg">A</span>
            </div>
            <div class="size-preview">{{ displayedNearest?.name ?? 'Lyon' }}</div>
          </section>

          <!-- Vehicle icon -->
          <section class="drawer-section">
            <div class="section-label">{{ t('vehicleIcon') }}</div>
            <div class="icon-picker">
              <button
                v-for="ic in vehicleIcons"
                :key="ic.value"
                class="icon-pick-btn"
                :class="{ active: vehicleIcon === ic.value }"
                @click="vehicleIcon = ic.value"
                :title="ic.label"
              >{{ ic.value }}</button>
            </div>
          </section>

          <!-- Nearby place-type filter -->
          <section class="drawer-section">
            <div class="section-label">{{ t('minPlaceSize') }}</div>
            <select class="text-input lang-select" v-model="minPlaceType">
              <option value="all">{{ t('placeFilterAll') }}</option>
              <option value="town">{{ t('placeFilterTown') }}</option>
              <option value="city">{{ t('placeFilterCity') }}</option>
            </select>
          </section>

          <!-- Nearby city min. display time -->
          <section class="drawer-section">
            <div class="section-label">{{ t('nearbyMinTime') }}</div>
            <select class="text-input lang-select" v-model.number="nearbyMinDuration">
              <option :value="0">{{ t('displayRefreshOff') }}</option>
              <option :value="30">{{ t('displayRefreshQuick') }}</option>
              <option :value="60">{{ t('displayRefreshNormal') }}</option>
              <option :value="120">{{ t('displayRefreshRelaxed') }}</option>
              <option :value="300">{{ t('displayRefreshSlow') }}</option>
            </select>
          </section>

        </template>

        <!-- ── TAB: AUDIO ─────────────────────────────────────────── -->
        <template v-if="activeTab === 'audio'">

          <!-- Voice on/off -->
          <section class="drawer-section">
            <div class="section-label">{{ t('ttsVoice') }}</div>
            <select class="text-input lang-select" v-model="ttsEnabled">
              <option :value="false">{{ t('ttsOff') }}</option>
              <option :value="true">{{ t('ttsOn') }}</option>
            </select>
          </section>

          <!-- Read description aloud -->
          <section class="drawer-section">
            <div class="section-label">{{ t('ttsReadDescription') }}</div>
            <select class="text-input lang-select" v-model="ttsReadDescription">
              <option :value="false">{{ t('ttsOff') }}</option>
              <option :value="true">{{ t('ttsOn') }}</option>
            </select>
          </section>

        </template>

      </div>
    </Transition>

    <!-- ── ABOUT MODAL ────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="aboutOpen" class="about-overlay" @click.self="aboutOpen = false">
        <div class="about-card">
          <div class="about-logo">
            <img class="about-icon" src="/icons/icon-192.png" alt="Alentours" />
            Alentours
          </div>
          <div class="about-sub">{{ t('aboutSub') }}</div>
          <div class="about-version">v{{ appVersion }}</div>
          <div class="about-author">{{ t('madeBy') }}</div>
          <button class="icon-btn" @click="aboutOpen = false">✕</button>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useTheme } from './composables/useTheme.js'
import { useLocale } from './composables/useLocale.js'
import { useGeolocation } from './composables/useGeolocation.js'
import { useRouteProgress } from './composables/useRouteProgress.js'
import { useNearbyTowns } from './composables/useNearbyTowns.js'
import { useTTS } from './composables/useTTS.js'
import { useSession } from './composables/useSession.js'
import { useTrips } from './composables/useTrips.js'
import { geocodeSuggestions } from './composables/useGeocoding.js'
import TripTabs from './components/TripTabs.vue'

// ── App version (injected by Vite from package.json) ──────────────────
const appVersion = __APP_VERSION__

// ── Theme ──────────────────────────────────────────────────────────────
const { isDark, toggle: toggleTheme } = useTheme()
const themeValue = computed({
  get: () => isDark.value ? 'dark' : 'light',
  set: (v) => { if ((v === 'dark') !== isDark.value) toggleTheme() }
})

// ── Locale ─────────────────────────────────────────────────────────────
const { lang, t } = useLocale()

// ── Menu + Settings drawer ─────────────────────────────────────────────
const menuOpen     = ref(false)
const settingsOpen = ref(false)
const aboutOpen    = ref(false)
const activeTab    = ref('trip')

// ── Geolocation ────────────────────────────────────────────────────────
const { position, error: geoError, watching, start: startGps, stop: stopGps } = useGeolocation()

// ── iOS auto-lock hint ─────────────────────────────────────────────────
const isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent)
const iosHintDismissed = ref(localStorage.getItem('ios-sleep-hint-dismissed') === 'true')
const showIosHint = computed(() => isIOS && watching.value && !iosHintDismissed.value)
function dismissIosHint() {
  iosHintDismissed.value = true
  localStorage.setItem('ios-sleep-hint-dismissed', 'true')
}

// ── Session ────────────────────────────────────────────────────────────
const { loadSession, saveSession, clearSession, saveLocations, loadLocations } = useSession()

// ── Trips ──────────────────────────────────────────────────────────────
const { listTrips, saveTrip, deleteTrip: deleteSavedTrip, getTrip } = useTrips()
const activeTripId = ref(localStorage.getItem('motorhome-active-trip-id') || null)
const savedTrips   = ref([])

// ── Route ──────────────────────────────────────────────────────────────
const {
  loadRoute, updatePosition, sampleRoutePoints, restoreRoute,
  totalDistance, progress, distanceDone, distanceLeft,
  routeLoaded, routeName, origin, destination,
  loading: routeLoading, error: routeError
} = useRouteProgress()

// ── Nearby towns ───────────────────────────────────────────────────────
const { towns, loading: townsLoading, prefetching, prefetchProgress, prefetchCurrentTown, prefetchForRoute, fetchNearbyTowns, fetchNearestCity, resetThrottle, restoreCache, clearCache, exportTownCache, importTownCache } = useNearbyTowns()

const prefetchElapsed = ref(0)
let prefetchTimer = null
watch(prefetching, (active) => {
  if (active) {
    prefetchElapsed.value = 0
    prefetchTimer = setInterval(() => { prefetchElapsed.value++ }, 1000)
  } else {
    clearInterval(prefetchTimer)
    prefetchTimer = null
  }
})

// ── TTS ────────────────────────────────────────────────────────────────
const { ttsEnabled, speak } = useTTS()
const ttsReadDescription = ref(localStorage.getItem('tts-read-description') === 'true')
watch(ttsReadDescription, (v) => localStorage.setItem('tts-read-description', String(v)))

// ── Speed tracking ─────────────────────────────────────────────────────
const tripStartTime     = ref(null)
const tripStartDistance = ref(null)
const avgSpeedMs        = ref(null)

const remainingDuration = computed(() => {
  if (!avgSpeedMs.value || !distanceLeft.value) return null
  return distanceLeft.value / avgSpeedMs.value   // seconds
})

const drivenDistance = computed(() => {
  const path = actualPath.value
  let total = 0
  for (let i = 1; i < path.length; i++) {
    const [lat1, lng1] = path[i - 1]
    const [lat2, lng2] = path[i]
    const R = 6371000
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return total
})

// ── Place-type filter ──────────────────────────────────────────────────
const PLACE_RANK = { village: 1, town: 2, city: 3 }

const VALID_PLACE_TYPES = new Set(['all', 'town', 'city'])
const minPlaceType = ref(VALID_PLACE_TYPES.has(localStorage.getItem('minPlaceType')) ? localStorage.getItem('minPlaceType') : 'all')
watch(minPlaceType, async (type) => {
  localStorage.setItem('minPlaceType', type)
  if (!position.value) return
  const { lat, lng, heading } = position.value
  if (type === 'city') {
    await fetchNearestCity(lat, lng, heading)
  } else {
    resetThrottle()
    await fetchNearbyTowns(lat, lng, heading)
  }
})

const filteredTowns = computed(() => {
  if (minPlaceType.value === 'all') return towns.value ?? []
  const minRank = PLACE_RANK[minPlaceType.value] ?? 0
  return (towns.value ?? []).filter(t => (PLACE_RANK[t.place] ?? 0) >= minRank)
})

// ── Computed ───────────────────────────────────────────────────────────
const nearest = computed(() => filteredTowns.value[0] ?? null)

const progressFillStyle = computed(() => {
  const pct = progress.value ?? 0
  const hue = pct * 1.2   // 0° red → 120° green
  const color = `hsl(${hue}deg, 80%, 45%)`
  const colorLight = `hsl(${hue}deg, 60%, 80%)`
  return {
    width: pct + '%',
    background: `linear-gradient(90deg, ${colorLight}, ${color})`,
  }
})


const gpsStatusClass = computed(() => {
  if (watching.value && position.value)   return 'live'
  if (!watching.value && !position.value) return 'off'
  return 'stale'
})

// ── Town font scale ────────────────────────────────────────────────────
const townFontScale = ref(parseFloat(localStorage.getItem('townFontScale') || '1.2'))
watch(townFontScale, (v) => localStorage.setItem('townFontScale', String(v)))

// ── Distance units ─────────────────────────────────────────────────────
const distanceUnit = ref(localStorage.getItem('distanceUnit') || 'metric')
watch(distanceUnit, v => localStorage.setItem('distanceUnit', v))

// ── Cache mode ──────────────────────────────────────────────────────────
const CORRIDOR_RADII = { balanced: 6000, offline: 25000 }
const cacheMode = ref(localStorage.getItem('cacheMode') || 'balanced')
watch(cacheMode, v => localStorage.setItem('cacheMode', v))

// ── Nearby city display lock ───────────────────────────────────────────
const nearbyMinDuration = ref(parseInt(localStorage.getItem('nearbyMinDuration') || '120', 10))
watch(nearbyMinDuration, v => {
  localStorage.setItem('nearbyMinDuration', String(v))
  tryUpdateDisplayedNearest()
})

const displayedNearest = ref(null)
let lastDisplayChange = 0
let pendingDisplayTimer = null

function tryUpdateDisplayedNearest() {
  const minMs = nearbyMinDuration.value * 1000
  const elapsed = Date.now() - lastDisplayChange
  if (minMs === 0 || elapsed >= minMs || !nearest.value) {
    clearTimeout(pendingDisplayTimer)
    pendingDisplayTimer = null
    displayedNearest.value = nearest.value
    if (nearest.value) lastDisplayChange = Date.now()
  } else if (!pendingDisplayTimer) {
    pendingDisplayTimer = setTimeout(() => {
      pendingDisplayTimer = null
      displayedNearest.value = nearest.value
      if (nearest.value) lastDisplayChange = Date.now()
    }, minMs - elapsed)
  }
}

// ── Aside auto-scroll ─────────────────────────────────────────────────
const asideRef       = ref(null)
const asideInnerRef  = ref(null)
const asideScrollDist = ref(0)
const asideScrollDur  = ref(20)

let lastAnnouncedTownId = null

function announceTown(town) {
  const dept       = town.wiki?.department
  const deptCode   = town.wiki?.departmentCode
  const region     = town.wiki?.region
  const nickname   = town.wiki?.nickname
  const elevation  = town.wiki?.elevation
  const population = town.wiki?.population

  const parts = [town.name]
  if (dept && deptCode) parts.push(`${t('ttsInDept')} ${dept} (${deptCode})`)
  else if (dept)        parts.push(`${t('ttsInDept')} ${dept}`)
  if (region) parts.push(`${t('ttsInRegion')} ${region}${t('ttsRegionSuffix')}`)

  const sideKey = { left: 'ttsSideLeft', right: 'ttsSideRight', ahead: 'ttsSideAhead', behind: 'ttsSideBehind' }[town.side]
  let sentence = parts.join(', ')
  if (sideKey) sentence += `, ${t('ttsIsLocated')} ${t(sideKey)}`
  sentence += '.'
  if (nickname) sentence += ` ${t('ttsAlsoKnownAs')} ${nickname}.`

  const PLACE_GENDER = { city: 'f' }
  const gender = PLACE_GENDER[town.place] ?? 'm'
  const word = t(`place_${town.place}`) || town.place || ''
  if (elevation != null && population) {
    sentence += ' ' + t(`ttsAltAndPop_${gender}`).replace('{word}', word).replace('{alt}', elevation).replace('{pop}', approximatePopulation(population))
  } else if (elevation != null) {
    sentence += ' ' + t(`ttsAltOnly_${gender}`).replace('{word}', word).replace('{alt}', elevation)
  } else if (population) {
    sentence += ' ' + t(`ttsPopOnly_${gender}`).replace('{word}', word).replace('{pop}', approximatePopulation(population))
  }

  if (ttsReadDescription.value && town.wiki?.extract) {
    sentence += ' ' + town.wiki.extract
  }

  speak(sentence, lang.value)
}

watch(nearest, tryUpdateDisplayedNearest, { immediate: true })

watch(displayedNearest, async (town) => {
  await nextTick()
  measureAside()
  if (town && town.id !== lastAnnouncedTownId) {
    lastAnnouncedTownId = town.id
    announceTown(town)
  }
})
watch(townFontScale, async () => {
  await nextTick()
  measureAside()
})

function measureAside() {
  const aside = asideRef.value
  const inner = asideInnerRef.value
  if (!aside || !inner) return
  const dist = Math.max(0, inner.scrollHeight - aside.clientHeight)
  asideScrollDist.value = dist
  asideScrollDur.value = Math.round(dist / 20 + 8)
}

// ── Vehicle icon ───────────────────────────────────────────────────────
const vehicleIcon = ref(localStorage.getItem('vehicleIcon') || '🚐')
watch(vehicleIcon, (v) => {
  localStorage.setItem('vehicleIcon', v)
  if (vehicleMarker && L) vehicleMarker.setIcon(makeVehicleIcon(v))
})

const vehicleIcons = [
  { value: '🚐', label: 'Motorhome' },
  { value: '🚗', label: 'Car' },
  { value: '🚲', label: 'Bicycle' },
  { value: '🏍', label: 'Motorbike' },
  { value: '🚚', label: 'Truck' },
]

// ── Map ────────────────────────────────────────────────────────────────
let L = null, map = null
let vehicleMarker = null, routePolyline = null, actualPolyline = null
let startMarker = null, endMarker = null
let mapResizeObserver = null, asideResizeObserver = null
const mapContainer = ref(null)

function makeVehicleIcon(icon) {
  return L.divIcon({
    className: '',
    html: `<div class="vehicle-marker-emoji">${icon}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  })
}

// ── Actual-path tracking (persisted for session resume) ────────────────
const actualPath = ref([])   // [[lat, lng], …] — grows with each GPS fix
let lastSavedPosition       = null   // { lat, lng } from restored session
let isFirstPositionAfterRestore = false

async function initMap() {
  L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')
  map = L.map(mapContainer.value, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    keyboard: false
  }).setView([46.5, 2.3], 6)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 15 }).addTo(map)

  mapResizeObserver = new ResizeObserver(() => fitBoundsToRoute())
  mapResizeObserver.observe(mapContainer.value)
}

function fitBoundsToRoute() {
  if (!map || !L || !routePolyline) return
  map.invalidateSize()
  map.fitBounds(routePolyline.getBounds(), { padding: [48, 48] })
}

function drawPlannedRoute() {
  if (!map || !L || !origin.value || !destination.value) return

  const latlngs = [
    [origin.value.lat, origin.value.lng],
    [destination.value.lat, destination.value.lng]
  ]

  routePolyline = L.polyline(latlngs, {
    color: '#7090b0',
    weight: 3,
    opacity: 0.55,
    dashArray: '10, 8'
  }).addTo(map)

  startMarker = L.marker([origin.value.lat, origin.value.lng], {
    icon: L.divIcon({
      className: '',
      html: '<div class="route-pin route-pin--start">A</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    })
  }).addTo(map)

  endMarker = L.marker([destination.value.lat, destination.value.lng], {
    icon: L.divIcon({
      className: '',
      html: '<div class="route-pin route-pin--end">B</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    })
  }).addTo(map)

  fitBoundsToRoute()
}

function clearMapLayers() {
  for (const layer of [routePolyline, actualPolyline, startMarker, endMarker, vehicleMarker]) {
    if (layer) map?.removeLayer(layer)
  }
  routePolyline = null; actualPolyline = null
  startMarker = null; endMarker = null; vehicleMarker = null
}

function drawActualPath() {
  if (!map || !L || !actualPath.value.length) return
  if (actualPolyline) map.removeLayer(actualPolyline)
  actualPolyline = L.polyline(actualPath.value, {
    color: '#c97800',
    weight: 5,
    opacity: 0.85
  }).addTo(map)
}

function updateMap(lat, lng) {
  if (!map || !L) return

  // Track every GPS fix for session persistence
  actualPath.value.push([lat, lng])

  // Grow the actual path polyline
  if (!actualPolyline) {
    actualPolyline = L.polyline([[lat, lng]], {
      color: '#c97800',
      weight: 5,
      opacity: 0.85
    }).addTo(map)
  } else {
    actualPolyline.addLatLng([lat, lng])
  }

  // Update vehicle marker
  if (!vehicleMarker) {
    vehicleMarker = L.marker([lat, lng], {
      icon: makeVehicleIcon(vehicleIcon.value)
    }).addTo(map)
  } else {
    vehicleMarker.setLatLng([lat, lng])
  }

  // If no route is shown, just follow the vehicle
  if (!routePolyline) {
    map.setView([lat, lng], 12, { animate: true, duration: 1 })
  }
}

// ── Session persistence helpers ────────────────────────────────────────
let saveTimer = null

function buildTripSnapshot() {
  const path = actualPath.value
  return {
    id:                activeTripId.value,
    fromPlace:         fromPlace.value,
    toPlace:           toPlace.value,
    origin:            origin.value,
    destination:       destination.value,
    routeName:         routeName.value,
    totalDistance:     totalDistance.value,
    lastPosition:      position.value ? { lat: position.value.lat, lng: position.value.lng } : null,
    actualPath:        path.length > 500 ? path.slice(-500) : path,
    townsCache:        exportTownCache(),
    progress:          progress.value ?? 0,
    tripStartTime:     tripStartTime.value,
    tripStartDistance: tripStartDistance.value,
    savedAt:           Date.now()
  }
}

function persistSession() {
  if (!routeLoaded.value) return
  saveSession({
    fromPlace:    fromPlace.value,
    toPlace:      toPlace.value,
    totalDistance: totalDistance.value,
    origin:       origin.value,
    destination:  destination.value,
    routeName:    routeName.value,
    lastPosition: position.value ? { lat: position.value.lat, lng: position.value.lng } : null,
    actualPath:   actualPath.value
  })
  if (activeTripId.value) {
    saveTrip(buildTripSnapshot())
    savedTrips.value = listTrips()
  }
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistSession, 30_000)
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') persistSession()
}

// ── Restore a previously-saved session on startup ──────────────────────
function restoreFromSession() {
  const session = loadSession()
  if (!session) return false

  restoreRoute(session)

  fromPlace.value  = session.fromPlace
  toPlace.value    = session.toPlace
  fromQuery.value  = session.fromPlace?.name ?? ''
  toQuery.value    = session.toPlace?.name   ?? ''
  actualPath.value = session.actualPath ?? []
  lastSavedPosition        = session.lastPosition
  isFirstPositionAfterRestore = true

  // Draw planned route first (blue dashed, bottom layer), then actual path on top
  drawPlannedRoute()
  drawActualPath()

  fitBoundsToRoute()

  restoreCache()
  startGps()
  return true
}

onMounted(async () => {
  await initMap()
  savedTrips.value = listTrips()
  const resumed = restoreFromSession()
  if (resumed && !activeTripId.value) {
    // Migrate a pre-existing session into the trips system
    const newId = crypto.randomUUID()
    activeTripId.value = newId
    localStorage.setItem('motorhome-active-trip-id', newId)
    persistSession()
  }
  if (!resumed) {
    restoreCache()
    const locs = loadLocations()
    if (locs) {
      if (locs.fromPlace) { fromPlace.value = locs.fromPlace; fromQuery.value = locs.fromPlace.name }
      if (locs.toPlace)   { toPlace.value   = locs.toPlace;   toQuery.value   = locs.toPlace.name }
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  const orientationMq = window.matchMedia('(orientation: portrait)')
  orientationMq.addEventListener('change', async () => { await nextTick(); measureAside() })
  asideResizeObserver = new ResizeObserver(() => measureAside())
  if (asideRef.value) asideResizeObserver.observe(asideRef.value)
})

onUnmounted(() => {
  if (map) map.remove()
  if (mapResizeObserver) mapResizeObserver.disconnect()
  if (asideResizeObserver) asideResizeObserver.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clearTimeout(pendingDisplayTimer)
  clearInterval(prefetchTimer)
})

// ── Draw route on map when route loads ────────────────────────────────
watch(routeLoaded, (loaded) => {
  // Guard against double-draw when restoring (drawPlannedRoute is called directly above)
  if (loaded && !routePolyline) drawPlannedRoute()
})

// ── GPS → update everything ────────────────────────────────────────────
watch(position, async (pos) => {
  if (!pos) return

  // On first fix after a session restore: draw a straight line from the last
  // saved position to the current one, bridging the gap while the app was closed.
  if (isFirstPositionAfterRestore) {
    if (lastSavedPosition && actualPolyline) {
      actualPolyline.addLatLng([lastSavedPosition.lat, lastSavedPosition.lng])
      actualPath.value.push([lastSavedPosition.lat, lastSavedPosition.lng])
    }
    isFirstPositionAfterRestore = false
  }

  updateMap(pos.lat, pos.lng)
  if (routeLoaded.value) {
    updatePosition(pos.lat, pos.lng)
    if (minPlaceType.value === 'city') {
      await fetchNearestCity(pos.lat, pos.lng, pos.heading)
    } else {
      await fetchNearbyTowns(pos.lat, pos.lng, pos.heading)
    }
  }

  // Average speed: initialise on first fix, then update each fix
  if (!tripStartTime.value) {
    tripStartTime.value     = Date.now()
    tripStartDistance.value = distanceDone.value ?? 0
  } else {
    const elapsedSec = (Date.now() - tripStartTime.value) / 1000
    const traveled   = (distanceDone.value ?? 0) - tripStartDistance.value
    if (elapsedSec >= 10 && traveled > 0) {
      avgSpeedMs.value = traveled / elapsedSec
    }
  }

  scheduleSave()
})

// ── Geocoding / autocomplete ───────────────────────────────────────────
const fromQuery = ref(''), toQuery = ref('')
const fromPlace = ref(null), toPlace = ref(null)
const fromSuggestions = ref([]), toSuggestions = ref([])
let fromTimer = null, toTimer = null

function onFromInput() {
  fromPlace.value = null
  clearTimeout(fromTimer)
  fromTimer = setTimeout(async () => { fromSuggestions.value = await geocodeSuggestions(fromQuery.value) }, 350)
}
function onToInput() {
  toPlace.value = null
  clearTimeout(toTimer)
  toTimer = setTimeout(async () => { toSuggestions.value = await geocodeSuggestions(toQuery.value) }, 350)
}
function selectFrom(s) { fromPlace.value = s; fromQuery.value = s.name; fromSuggestions.value = []; saveLocations(s, toPlace.value) }
function selectTo(s)   { toPlace.value = s;   toQuery.value = s.name;   toSuggestions.value = []; saveLocations(fromPlace.value, s) }
function selectFirstFrom() { if (fromSuggestions.value[0]) selectFrom(fromSuggestions.value[0]) }
function selectFirstTo()   { if (toSuggestions.value[0])   selectTo(toSuggestions.value[0]) }

// ── Trip lifecycle ─────────────────────────────────────────────────────
async function startTrip() {
  await loadRoute(fromPlace.value, toPlace.value)
  if (routeLoaded.value) {
    const newId = crypto.randomUUID()
    activeTripId.value = newId
    localStorage.setItem('motorhome-active-trip-id', newId)
    if (cacheMode.value !== 'none') {
      const samples = sampleRoutePoints(10000)
      await prefetchForRoute(samples, CORRIDOR_RADII[cacheMode.value])
    }
    startGps()
    settingsOpen.value = false
    persistSession()
  }
}

function resetTrip() {
  stopGps()
  clearMapLayers()
  if (activeTripId.value) {
    deleteSavedTrip(activeTripId.value)
    activeTripId.value = null
    localStorage.removeItem('motorhome-active-trip-id')
    savedTrips.value = listTrips()
  }
  clearSession()
  clearCache()
  clearTimeout(saveTimer)
  map?.setView([46.5, 2.3], 6)
  routeLoaded.value = false
  routeName.value = ''
  towns.value = []
  actualPath.value = []
  lastSavedPosition = null
  isFirstPositionAfterRestore = false
  fromQuery.value = ''
  toQuery.value = ''
  fromPlace.value = null
  toPlace.value = null
  tripStartTime.value     = null
  tripStartDistance.value = null
  avgSpeedMs.value        = null
}

function createNewTrip() {
  if (routeLoaded.value && activeTripId.value) persistSession()
  stopGps()
  clearMapLayers()
  clearSession()
  clearCache()
  clearTimeout(saveTimer)
  map?.setView([46.5, 2.3], 6)
  routeLoaded.value = false
  routeName.value = ''
  towns.value = []
  actualPath.value = []
  lastSavedPosition = null
  isFirstPositionAfterRestore = false
  fromQuery.value = ''
  toQuery.value = ''
  fromPlace.value = null
  toPlace.value = null
  tripStartTime.value     = null
  tripStartDistance.value = null
  avgSpeedMs.value        = null
  activeTripId.value = null
  localStorage.removeItem('motorhome-active-trip-id')
  settingsOpen.value = true
}

async function switchToTrip(id) {
  if (id === activeTripId.value) return
  const trip = getTrip(id)
  if (!trip) return

  if (routeLoaded.value && activeTripId.value) persistSession()

  stopGps()
  clearMapLayers()
  clearTimeout(saveTimer)

  restoreRoute(trip)
  fromPlace.value  = trip.fromPlace
  toPlace.value    = trip.toPlace
  fromQuery.value  = trip.fromPlace?.name ?? ''
  toQuery.value    = trip.toPlace?.name   ?? ''
  actualPath.value = trip.actualPath ?? []
  lastSavedPosition        = trip.lastPosition
  isFirstPositionAfterRestore = !!trip.lastPosition
  tripStartTime.value     = trip.tripStartTime ?? null
  tripStartDistance.value = trip.tripStartDistance ?? null
  avgSpeedMs.value        = null

  importTownCache(trip.townsCache)

  activeTripId.value = id
  localStorage.setItem('motorhome-active-trip-id', id)
  saveSession({
    fromPlace:     trip.fromPlace,
    toPlace:       trip.toPlace,
    totalDistance: trip.totalDistance,
    origin:        trip.origin,
    destination:   trip.destination,
    routeName:     trip.routeName,
    lastPosition:  trip.lastPosition,
    actualPath:    trip.actualPath ?? []
  })

  drawPlannedRoute()
  drawActualPath()
  fitBoundsToRoute()
  startGps()
}

function deleteTripById(id) {
  if (id === activeTripId.value) {
    resetTrip()
  } else {
    deleteSavedTrip(id)
    savedTrips.value = listTrips()
  }
}

function toggleGps() {
  if (watching.value) {
    stopGps()
  } else {
    tripStartTime.value     = null
    tripStartDistance.value = null
    avgSpeedMs.value        = null
    startGps()
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
function formatKm(m) {
  if (!m) return '—'
  if (distanceUnit.value === 'imperial') {
    const mi = m / 1609.344
    return (mi >= 10 ? mi.toFixed(0) : mi.toFixed(1)) + ' mi'
  }
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'
}
function formatPopulation(n) {
  if (!n) return '—'
  return n.toLocaleString(lang.value === 'fr' ? 'fr-FR' : 'en-US')
}
function approximatePopulation(n) {
  if (n < 1000)    return Math.round(n / 10) * 10
  if (n < 10000)   return Math.round(n / 100) * 100
  if (n < 100000)  return Math.round(n / 1000) * 1000
  if (n < 1000000) return Math.round(n / 10000) * 10000
  return Math.round(n / 100000) * 100000
}
function formatSpeed(ms) {
  return distanceUnit.value === 'imperial'
    ? Math.round(ms * 2.23694) + ' mph'
    : Math.round(ms * 3.6) + ' km/h'
}
function formatDuration(sec) {
  if (sec < 60) return '< 1 min'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`
}
function truncate(str, n) { return str?.length > n ? str.slice(0, n) + '…' : str }
function sideLabel(s) {
  return { left: t('sideLeft'), right: t('sideRight'), ahead: t('sideAhead'), behind: t('sideBehind'), unknown: '' }[s] ?? ''
}
function sideArrow(s) {
  return { left: '⬅', right: '➡', ahead: '⬆', behind: '⬇' }[s] ?? ''
}
</script>

<style scoped>
/* ── Layout ───────────────────────────────────────────────────────── */
.app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
  overflow: hidden;
  font-family: var(--font-body);
}

.topbar {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 1.5rem;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar__row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.topbar__route {
  font-family: var(--font-display);
  font-size: 0.9rem;
  color: var(--text-muted);
  flex: 1;
  letter-spacing: 0.04em;
}

.icon-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 20px;
  padding: 0.15rem 0.55rem;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1.4;
  flex-shrink: 0;
  transition: border-color 0.2s, color 0.2s;
}
.icon-btn:hover, .icon-btn.active { border-color: var(--accent); color: var(--accent); }

.main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 380px;
  overflow: hidden;
}
.map-wrap { width: 100%; height: 100%; }
.aside {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  overflow: hidden;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
}

/* ── Panels ───────────────────────────────────────────────────────── */
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
/* Town panel scales with the text-size setting */
.panel--town {
  font-size: calc(1rem * var(--town-scale, 1));
}

.panel__label {
  font-family: var(--font-display);
  font-size: 0.65em;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  text-transform: uppercase;
}

.progress-track {
  position: relative;
  height: 8px;
  background: var(--bg-panel);
  border-radius: 4px;
}
.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 1s ease;
}
.progress-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.1em;
  line-height: 1;
  transition: left 1s ease;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45));
  user-select: none;
  pointer-events: none;
}
.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 0.78em;
  color: var(--text-muted);
  font-family: var(--font-display);
}
.progress-pct {
  font-family: var(--font-display);
  font-size: 1em;
  font-weight: 700;
  color: var(--accent);
}

.speed-row {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding-top: 0.5em;
}
.speed-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15em;
  flex: 1;
}
.speed-label {
  font-family: var(--font-display);
  font-size: 0.55em;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  text-transform: uppercase;
}
.speed-val {
  font-family: var(--font-display);
  font-size: 0.95em;
  font-weight: 700;
  color: var(--accent);
}

.town-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.town-name-row {
  display: flex;
  align-items: center;
  gap: 0.2em;
  min-width: 0;
}
.town-arrow {
  font-size: 1.8em;
  line-height: 1;
  flex-shrink: 0;
}
.town-arrow.left   { color: var(--blue); }
.town-arrow.right  { color: var(--accent); }
.town-arrow.ahead  { color: var(--green); }
.town-arrow.behind { color: var(--text-primary); }
.town-name {
  font-family: var(--font-display);
  font-size: 1.6em;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  letter-spacing: 0.03em;
}
.town-native {
  font-style: italic;
  font-size: 0.82em;
  color: var(--text-muted);
  text-align: center;
  margin-top: -0.1em;
  letter-spacing: 0.04em;
}
.town-side {
  font-family: var(--font-display);
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.2em 0.5em;
  border-radius: 4px;
  background: var(--bg-panel);
  white-space: nowrap;
}
.town-side.left  { color: var(--blue);   border: 1px solid var(--blue); }
.town-side.right { color: var(--accent); border: 1px solid var(--accent); }
.town-side.ahead { color: var(--green);  border: 1px solid var(--green); }
.town-coat {
  height: 48px;
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
}
.town-dist { font-size: 0.8em; color: var(--text-primary); font-weight: 500; }

.town-thumbnail {
  width: 100%;
  height: 8em;
  object-fit: cover;
  border-radius: var(--radius);
  display: block;
}

.town-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.75em;
  row-gap: 0.3em;
  background: var(--bg-panel);
  border-radius: var(--radius);
  padding: 0.5em 0.65em;
  font-size: 0.82em;
  line-height: 1.4;
}
.fact-row {
  display: contents;
}
.fact-key {
  font-family: var(--font-display);
  font-size: 0.72em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  white-space: nowrap;
  align-self: baseline;
}
.fact-val { color: var(--text-primary); font-weight: 500; align-self: baseline; }
.fact-sub { color: var(--text-muted); font-weight: 400; }

.gender-sign { margin-right: 0.2em; }
.gender-sign.female { color: var(--accent); }
.gender-sign.male   { color: var(--blue); }

/* ── Extract ──────────────────────────────────────────────────────── */
.town-extract {
  font-size: 0.88em;
  color: var(--text-primary);
  line-height: 1.6;
  font-weight: 400;
}
.town-extract--dim { color: var(--text-muted); font-style: italic; }

/* ── Aside auto-scroll ────────────────────────────────────────────── */
.aside-inner {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.aside-inner--scroll {
  animation: aside-vscroll var(--aside-dur, 20s) ease-in-out infinite;
}
@keyframes aside-vscroll {
  0%, 15%   { transform: translateY(0); }
  85%, 100% { transform: translateY(var(--aside-dist, 0px)); }
}

.panel--waiting {
  flex: 1;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-style: dashed;
  min-height: 120px;
}
.waiting-icon { font-size: 2rem; }
.inline-gear-btn {
  background: none;
  border: none;
  padding: 0 0.1em;
  font-size: 1.1em;
  color: var(--accent);
  cursor: pointer;
  vertical-align: middle;
}
.waiting-text { font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; }

/* ── Hamburger menu ───────────────────────────────────────────────── */
.menu-wrap {
  position: relative;
  flex-shrink: 0;
}
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 799;
}
.menu-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: 800;
  min-width: 160px;
  overflow: hidden;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  background: none;
  border: none;
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  text-align: left;
  letter-spacing: 0.04em;
  transition: background 0.15s, color 0.15s;
}
.menu-item:hover { background: var(--bg-card); color: var(--accent); }
.menu-item__icon { font-size: 1rem; width: 1.2em; text-align: center; }
.menu-enter-active,
.menu-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.menu-enter-from,
.menu-leave-to     { opacity: 0; transform: translateY(-6px); }

/* ── Settings drawer ──────────────────────────────────────────────── */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 1000;
}
.settings-drawer {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 380px;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  padding: 1rem;
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.25rem;
}
.drawer-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-primary);
}
.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--border);
}
.drawer-section:last-child { border-bottom: none; }
.section-label {
  font-family: var(--font-display);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: var(--text-dim);
  text-transform: uppercase;
}

.input-group { display: flex; flex-direction: column; gap: 0.3rem; }
.input-label { font-size: 0.75rem; color: var(--text-muted); }
.autocomplete { position: relative; }
.text-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 1rem;
  padding: 0.55rem 0.8rem;
  outline: none;
  transition: border-color 0.2s;
}
.text-input:focus { border-color: var(--accent); }
.suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  list-style: none;
  z-index: 10;
  overflow: hidden;
}
.suggestion {
  padding: 0.55rem 0.8rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s;
}
.suggestion:hover { background: var(--bg-panel); color: var(--text-primary); }
.resolved { font-size: 0.8rem; color: var(--green); }

.route-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}
.route-arrow { color: var(--accent); }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 0.6rem 1.2rem;
  border-radius: var(--radius);
  cursor: pointer;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;
}
.btn:hover, .btn.active { border-color: var(--accent); color: var(--accent); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary { border-color: var(--accent); color: var(--accent); }
.btn--small   { padding: 0.3rem 0.7rem; font-size: 0.8rem; }

.mini-progress {
  height: 6px;
  background: var(--bg-card);
  border-radius: 3px;
  overflow: hidden;
}
.mini-progress__bar {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.meta-text  { font-size: 0.85rem; color: var(--text-muted); }
.error-text { font-size: 0.85rem; color: var(--red); }

.lang-select { cursor: pointer; }

/* ── Town size slider ─────────────────────────────────────────────── */
.size-control {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.size-a {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dim);
  user-select: none;
}
.size-a--lg { font-size: 1.5rem; }
.size-track {
  flex: 1;
  height: 8px;
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}
.size-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  pointer-events: none;
  transition: width 0.1s;
}
.size-range {
  position: absolute;
  inset: -4px 0;
  width: 100%;
  height: calc(100% + 8px);
  opacity: 0;
  cursor: pointer;
  margin: 0;
}
.size-preview {
  font-family: var(--font-display);
  font-size: calc(1rem * var(--town-scale, 1));
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-top: 0.4rem;
  letter-spacing: 0.03em;
  transition: font-size 0.1s;
}

.icon-picker {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.icon-pick-btn {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0.55rem;
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
  transition: border-color 0.2s, background 0.2s;
}
.icon-pick-btn:hover { border-color: var(--accent); }
.icon-pick-btn.active { border-color: var(--accent); background: var(--bg-panel); }

/* ── Settings tabs ────────────────────────────────────────────────── */
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  margin: 0 -1rem 0.25rem;
  padding: 0 1rem;
  flex-shrink: 0;
}
.drawer-tab {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.55rem 0.5rem;
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.drawer-tab:hover { color: var(--text-muted); }
.drawer-tab.active { color: var(--accent); border-bottom-color: var(--accent); }

/* ── Drawer slide transition ──────────────────────────────────────── */
.drawer-enter-active,
.drawer-leave-active { transition: transform 0.25s ease; }
.drawer-enter-from,
.drawer-leave-to     { transform: translateX(100%); }

/* ── About modal ──────────────────────────────────────────────────── */
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: center;
}
.about-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2rem 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  min-width: 220px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
.about-logo {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.about-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}
.about-sub {
  font-size: 0.85rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.about-version {
  font-size: 0.8rem;
  color: var(--accent);
  letter-spacing: 0.06em;
  font-weight: 600;
}
.about-author {
  font-size: 0.75rem;
  color: var(--text-dim);
  letter-spacing: 0.06em;
  margin-top: 0.2rem;
}

/* ── Fade transition (About modal) ───────────────────────────────── */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }

/* ── iOS auto-lock hint ───────────────────────────────────────────── */
.ios-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3rem 1rem;
  background: rgba(201, 120, 0, 0.1);
  border-bottom: 1px solid rgba(201, 120, 0, 0.25);
  font-size: 0.72rem;
  color: var(--accent);
  flex-shrink: 0;
  overflow: hidden;
}
.ios-hint__close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.1rem 0.3rem;
  flex-shrink: 0;
  line-height: 1;
}
.ios-hint-enter-active,
.ios-hint-leave-active { transition: max-height 0.3s ease, opacity 0.3s ease; max-height: 48px; }
.ios-hint-enter-from,
.ios-hint-leave-to     { max-height: 0; opacity: 0; }

/* ── Portrait layout ──────────────────────────────────────────────── */
@media (orientation: portrait) {
  .main {
    display: flex;
    flex-direction: column;
  }
  .aside {
    order: 1;
    border-left: none;
    border-bottom: 1px solid var(--border);
    max-height: 50vh;
    overflow: hidden; /* animation drives scrolling, no scrollbar */
    gap: 0;           /* aside-inner owns the gap */
  }
  .map-wrap {
    order: 2;
    flex: 1;
    min-height: 200px;
  }
}
</style>

<style>
/* Vehicle marker emoji — not scoped, injected by Leaflet */
.vehicle-marker-emoji {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.55));
  user-select: none;
  pointer-events: none;
}

/* Route start / end pins */
.route-pin {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  font-family: sans-serif;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}
.route-pin--start { background: #2a9d5c; }
.route-pin--end   { background: #cc3333; }
</style>
