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

  // Music sync state.
  let musicEpoch = null      // server-wide reference instant (Unix s)
  let clockOffset = 0        // serverNow - clientNow, to correct skew
  let syncedOnce = false     // true after the first seekTo

  function ytPlayerReady() {
    return ytPlayer && ytReady && typeof ytPlayer.playVideo === 'function'
  }

  function applyMusicState() {
    if (!ytPlayerReady()) return
    try {
      // Audible only when: music on, a user gesture happened, AND the
      // track has been synced to the shared position — otherwise we'd
      // briefly play the un-synced 0:00 segment out loud.
      const wantSound = prefs.musicEnabled && gestureSeen && syncedOnce
      if (wantSound) {
        ytPlayer.unMute()
        ytPlayer.setVolume(Math.round(prefs.musicVolume * 100))
      } else {
        ytPlayer.mute()
      }
      if (prefs.musicEnabled) ytPlayer.playVideo()
      else                    ytPlayer.pauseVideo()
    } catch {
      /* player not fully ready — ignored */
    }
  }

  // Align playback so every player hears roughly the same part of the
  // track: position = (sharedNow - musicEpoch) mod trackDuration.
  function syncMusic() {
    if (!ytPlayerReady() || musicEpoch == null) return
    try {
      const duration = ytPlayer.getDuration?.() || 0
      if (duration <= 0) {
        // Metadata not loaded yet — retry shortly so the first sync happens.
        setTimeout(syncMusic, 500)
        return
      }
      const sharedNow = Date.now() / 1000 + clockOffset
      const target = ((sharedNow - musicEpoch) % duration + duration) % duration
      const current = ytPlayer.getCurrentTime?.() ?? 0
      // Only correct when drift is noticeable, to avoid constant jumps.
      if (!syncedOnce || Math.abs(current - target) > 2.5) {
        ytPlayer.seekTo(target, true)
        const firstSync = !syncedOnce
        syncedOnce = true
        // After the first sync the track is aligned — now it may be heard.
        if (firstSync) applyMusicState()
      }
    } catch {
      /* ignored */
    }
  }

  // Feed the server's music clock (from room_state) into the manager.
  // Only the FIRST reading is used — server_time changes on every message
  // and re-reading it would make clockOffset jitter and the music re-seek.
  let musicClockSet = false
  function updateMusicClock(epoch, serverTime) {
    if (musicClockSet) return
    if (typeof epoch !== 'number' || typeof serverTime !== 'number') return
    musicEpoch  = epoch
    clockOffset = serverTime - Date.now() / 1000
    musicClockSet = true
    syncMusic()
  }

  // Called on the first user gesture — now we may produce audible sound.
  function notifyGesture() {
    if (gestureSeen) return
    gestureSeen = true
    applyMusicState()
    syncMusic()
  }

  let _musicInitStarted = false   // sync guard against double init

  async function initMusic() {
    // Set the guard BEFORE the await — two StrictMode mounts call this
    // concurrently and both would otherwise pass an `if (ytPlayer)` check.
    if (!YT_MUSIC_ID || _musicInitStarted) return
    _musicInitStarted = true

    // Create the player's host element OUTSIDE the React tree, appended
    // straight to <body>. YouTube replaces this node with an iframe; if it
    // were a React-rendered node, React's reconciliation would later try
    // to update/remove a node that no longer exists and crash the app.
    const host = document.createElement('div')
    host.id = 'viuda-music-player'
    host.style.cssText =
      'position:fixed;bottom:0;left:0;width:2px;height:2px;' +
      'opacity:0.01;pointer-events:none;z-index:0;'
    document.body.appendChild(host)

    const YT = await loadYouTubeApi()
    // eslint-disable-next-line no-new
    new YT.Player(host, {
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
          ytPlayer = event.target
          ytReady = true
          // Start muted (allowed to autoplay); unmutes on first gesture.
          try { ytPlayer.mute(); ytPlayer.playVideo() } catch { /* */ }
          applyMusicState()
          syncMusic()
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
    updateMusicClock,
    syncMusic,
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
    audioManager.initMusic()

    function kick() {
      if (startedRef.current) return
      startedRef.current = true
      audioManager.notifyGesture()
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
    }
    window.addEventListener('pointerdown', kick)
    window.addEventListener('keydown', kick)

    // Re-sync the music every 30 s to correct playback drift.
    const resyncId = setInterval(() => audioManager.syncMusic(), 30000)

    return () => {
      window.removeEventListener('pointerdown', kick)
      window.removeEventListener('keydown', kick)
      clearInterval(resyncId)
    }
  }, [])

  const update = useCallback((patch) => {
    audioManager.setPrefs(patch)
    setPrefsState(audioManager.getPrefs())
  }, [])

  const playEffect = useCallback((key) => {
    audioManager.playEffect(key)
  }, [])

  const updateMusicClock = useCallback((epoch, serverTime) => {
    audioManager.updateMusicClock(epoch, serverTime)
  }, [])

  return {
    prefs,
    playEffect,
    updateMusicClock,
    musicAvailable: audioManager.musicAvailable(),
    setEffectsEnabled: (v) => update({ effectsEnabled: v }),
    setMusicEnabled:   (v) => update({ musicEnabled: v }),
    setEffectsVolume:  (v) => update({ effectsVolume: v }),
    setMusicVolume:    (v) => update({ musicVolume: v }),
  }
}
