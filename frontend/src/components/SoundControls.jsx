import { useState } from 'react'

/**
 * Floating sound-settings widget: a speaker button that opens a panel
 * with a toggle + volume slider for effects and (if a music video is
 * configured) for the background music.
 *
 * Also renders the hidden container the YouTube music player mounts into.
 */
export default function SoundControls({ sound }) {
  const [open, setOpen] = useState(false)
  const {
    prefs, musicAvailable,
    setEffectsEnabled, setMusicEnabled,
    setEffectsVolume, setMusicVolume,
  } = sound

  const allMuted =
    !prefs.effectsEnabled && (!musicAvailable || !prefs.musicEnabled)

  return (
    <>
      {/* Hidden YouTube background-music player mounts here. */}
      <div id="viuda-music-player" className="music-player-hidden" />

      <div className="sound-controls">
        <button
          className="sound-toggle-btn"
          onClick={() => setOpen(o => !o)}
          title="Ajustes de sonido"
          aria-label="Ajustes de sonido"
        >
          {allMuted ? '🔇' : '🔊'}
        </button>

        {open && (
          <div className="sound-panel">
            <div className="sound-row">
              <label className="sound-label">
                <input
                  type="checkbox"
                  checked={prefs.effectsEnabled}
                  onChange={e => setEffectsEnabled(e.target.checked)}
                />
                Efectos
              </label>
              <input
                type="range" min="0" max="1" step="0.05"
                value={prefs.effectsVolume}
                disabled={!prefs.effectsEnabled}
                onChange={e => setEffectsVolume(parseFloat(e.target.value))}
              />
            </div>

            {musicAvailable && (
              <div className="sound-row">
                <label className="sound-label">
                  <input
                    type="checkbox"
                    checked={prefs.musicEnabled}
                    onChange={e => setMusicEnabled(e.target.checked)}
                  />
                  Música
                </label>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={prefs.musicVolume}
                  disabled={!prefs.musicEnabled}
                  onChange={e => setMusicVolume(parseFloat(e.target.value))}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
