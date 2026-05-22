import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Audio system: short sound effects (local MP3s) + background music
 * streamed from a YouTube video via the IFrame Player API.
 *
 * Effects live in  frontend/public/sounds/  and play through short-lived
 * <audio> elements. The music is a hidden YouTube player, so a multi-hour
 * track costs nothing in bandwidth/hosting on our side.
 *
 * User preferences (mute + volume for each) persist in localStorage.
 * Browsers block autoplay until the first user gesture, so the music
 * starts on the first click/keypress anywhere in the page.
 */

// ── Sound catalogue ────────────────────────────────────────────────────
// Logical event name -> file under /sounds/.
const EFFECT_FILES = {
  swap_all:  'swap-all.mp3',
  swap_one:  'swap-one.mp3',
  pass:      'pass.mp3',
  stand:     'stand.mp3',
  showdown:  'showdown.mp3',
  new_offer: 'new-offer.mp3',
}

const SOUNDS_BASE = '/sounds/'
const STORAGE_KEY = 'viuda_sound_prefs'

// Background-music YouTube video id. Configure via VITE_YOUTUBE_MUSIC_ID;
// if empty, the music feature is simply disabled.
const YT_MUSIC_ID = import.meta.env.VITE_YOUTUBE_MUSIC_ID || ''

// ── Preferences (localStorage) ─────────────────────────────────────────
const DEFAULT_PREFS = {
  effectsEnabled: true,
  musicEnabled:   true,
  effectsVolume:  0.7,
  musicVolume:    0.4,
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — preferences just won't persist */
  }
}

// ── YouTube IFrame API loader ──────────────────────────────────────────
let _ytApiPromise = null

function loadYouTubeApi() {
  if (_ytApiPromise) return _ytApiPromise
  _ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
    // YouTube calls this global hook once the API is ready.
    const prevHook = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevHook === 'function') prevHook()
      resolve(window.YT)
    }
  })
  return _ytApiPromise
}

// ── Audio manager (module singleton) ───────────────────────────────────
const audioManager = (() => {
  let prefs = loadPrefs()
  const effectCache = {}        // preloaded effect <audio> elements
  let ytPlayer = null           // YouTube player instance
  let ytReady = false           // player finished initialising
  let gestureSeen = false       // a user gesture has occurred (autoplay ok)

  function playEffect(key) {
    if (!prefs.effectsEnabled) return
    const file = EFFECT_FILES[key]
    if (!file) return
    let base = effectCache[key]
    if (!base) {
      base = new Audio(SOUNDS_BASE + file)
      effectCache[key] = base
    }
    // Clone so overlapping effects can play at once.
    const instance = base.cloneNode()
    instance.volume = prefs.effectsVolume
    instance.play().catch(() => {})
  }

  function applyMusicState() {
    // Guard against the YT object before its control methods exist.
    if (!ytPlayer || !ytReady || typeof ytPlayer.playVideo !== 'function') {
      return
    }
    try {
      const wantSound = prefs.musicEnabled && gestureSeen
      // Browsers allow MUTED autoplay; we unmute only after a gesture.
      if (wantSound) {
        ytPlayer.unMute()
        ytPlayer.setVolume(Math.round(prefs.musicVolume * 100))
      } else {
        ytPlayer.mute()
      }
      if (prefs.musicEnabled) ytPlayer.playVideo()
      else                    ytPlayer.pauseVideo()
      console.log('[sound] applyMusicState:',
        'enabled=', prefs.musicEnabled,
        'gesture=', gestureSeen,
        'muted=', ytPlayer.isMuted?.(),
        'volume=', ytPlayer.getVolume?.(),
        'state=', ytPlayer.getPlayerState?.())
    } catch (e) {
      console.warn('[sound] applyMusicState falló:', e)
    }
  }

  // Called on the first user gesture — now we may produce audible sound.
  function notifyGesture() {
    if (gestureSeen) return
    gestureSeen = true
    applyMusicState()
  }

  let _musicInitStarted = false   // sync guard against double init

  async function initMusic(containerId) {
    // Set the guard BEFORE the await — two StrictMode mounts call this
    // concurrently and both would otherwise pass an `if (ytPlayer)` check.
    if (!YT_MUSIC_ID || _musicInitStarted) return
    _musicInitStarted = true
    console.log('[sound] iniciando reproductor YouTube, id =', YT_MUSIC_ID)
    const YT = await loadYouTubeApi()
    // eslint-disable-next-line no-new
    new YT.Player(containerId, {
      videoId: YT_MUSIC_ID,
      // Privacy-enhanced domain (matches YouTube's "Insertar" snippet) and
      // an explicit origin — without it the API can return error 5 on
      // localhost / cross-origin setups.
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        controls: 0,
        loop: 1,
        playlist: YT_MUSIC_ID,   // required so a single video can loop
        modestbranding: 1,
        origin: window.location.origin,
        playsinline: 1,
      },
      events: {
        // event.target is the fully-built player — use it, not the
        // half-initialised value the constructor returns.
        onReady: (event) => {
          console.log('[sound] reproductor YouTube listo')
          ytPlayer = event.target
          ytReady = true
          // Start muted (allowed to autoplay); unmutes on first gesture.
          try { ytPlayer.mute(); ytPlayer.playVideo() } catch { /* */ }
          applyMusicState()
        },
        onError: (e) => {
          console.warn('[sound] error de YouTube:', e?.data)
        },
      },
    })
  }

  function setPrefs(next) {
    prefs = { ...prefs, ...next }
    savePrefs(prefs)
    applyMusicState()
  }

  return {
    playEffect,
    setPrefs,
    getPrefs: () => ({ ...prefs }),
    applyMusicState,
    notifyGesture,
    initMusic,
    musicAvailable: () => Boolean(YT_MUSIC_ID),
  }
})()

// ── Hook ───────────────────────────────────────────────────────────────
export function useSound() {
  const [prefs, setPrefsState] = useState(() => audioManager.getPrefs())
  const startedRef = useRef(false)

  // Create the hidden YouTube player once, and start music on the first
  // user gesture (browsers block autoplay until then).
  useEffect(() => {
    audioManager.initMusic('viuda-music-player')

    function kick() {
      if (startedRef.current) return
      startedRef.current = true
      audioManager.notifyGesture()
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)
    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
  }, [])

  const update = useCallback((patch) => {
    audioManager.setPrefs(patch)
    setPrefsState(audioManager.getPrefs())
  }, [])

  const playEffect = useCallback((key) => {
    audioManager.playEffect(key)
  }, [])

  return {
    prefs,
    playEffect,
    musicAvailable: audioManager.musicAvailable(),
    setEffectsEnabled: (v) => update({ effectsEnabled: v }),
    setMusicEnabled:   (v) => update({ musicEnabled: v }),
    setEffectsVolume:  (v) => update({ effectsVolume: v }),
    setMusicVolume:    (v) => update({ musicVolume: v }),
  }
}
