import { useState } from 'react'

/**
 * Floating sound-settings widget: a speaker button that opens a panel
 * with a toggle + volume slider for effects and (if a music video is
 * configured) for the background music.
 *
 * The YouTube music player container is NOT rendered here — it lives
 * outside the React tree (see useSound.js) so YouTube replacing it with
 * an iframe never clashes with React's DOM reconciliation.
 */
export default function SoundControls({ sound }) {
  const [open, setOpen] = useState(false)
  const {
    prefs, musicAvailable,
    setEffectsEnabled, setMusicEnabled,
    setEffectsVolume, setMusicVolume,
    setSecretEnabled, setStandAlt,
  } = sound

  const allMuted =
    !prefs.effectsEnabled && (!musicAvailable || !prefs.musicEnabled)

  return (
    <>
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

            <div className="sound-row">
              <label className="sound-label">
                <input
                  type="checkbox"
                  checked={prefs.secretEnabled}
                  onChange={e => setSecretEnabled(e.target.checked)}
                />
                Secret
              </label>
            </div>

            <div className="sound-row">
              <label className="sound-label">
                <input
                  type="checkbox"
                  checked={prefs.standAlt}
                  onChange={e => setStandAlt(e.target.checked)}
                />
                Stand alterno
              </label>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
