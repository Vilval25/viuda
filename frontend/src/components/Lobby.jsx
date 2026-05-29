import { useState } from 'react'

export default function Lobby({
  myNick, myRole, roomState,
  joinGame, leaveGame, startGame,
  setReady, setUnready, setConfig,
  amReady, changeApodo,
}) {
  const {
    waiting = [], playing = [], spectators = [], disconnected = [],
    phase, ready = [], config = { buy_in: 10, max_lives: 3 },
    sheets_url = null,
    apodos = {},
  } = roomState

  const [editBuyIn,    setEditBuyIn]    = useState('')
  const [editMaxLives, setEditMaxLives] = useState('')
  const [showChangeApodo, setShowChangeApodo] = useState(false)
  const [newApodoVal, setNewApodoVal] = useState('')

  const canJoin    = phase === 'idle' && waiting.length < 9 && myRole === 'spectator'
  const canStart   = phase === 'idle' && myRole === 'waiting' && roomState.all_ready !== false && waiting.length >= 2 && waiting.every(n => ready.includes(n))
  const isWaiting  = myRole === 'waiting'
  const allReady   = waiting.length >= 2 && waiting.every(n => ready.includes(n))

  function handleSetConfig(e) {
    e.preventDefault()
    const bi = editBuyIn    !== '' ? parseFloat(parseFloat(editBuyIn).toFixed(2))    : null
    const ml = editMaxLives !== '' ? parseInt(editMaxLives, 10) : null
    setConfig(bi, ml)
    setEditBuyIn('')
    setEditMaxLives('')
  }

  function handleUpdateApodo(e) {
    e.preventDefault()
    if (newApodoVal.trim()) {
      changeApodo(newApodoVal.trim())
      setShowChangeApodo(false)
      setNewApodoVal('')
    }
  }

  const myDisplayName = apodos[myNick] || myNick

  return (
    <div className="screen-center">
      <div className="card lobby-card">
        <h1>Viuda</h1>

        {phase === 'in_game' && <div className="phase-badge in-game">Partida en curso</div>}
        {phase === 'inter_round' && <div className="phase-badge inter-round">Entre rondas</div>}
        {phase === 'idle'    && <div className="phase-badge idle">Esperando jugadores</div>}

        {/* ── Config panel (idle only) ───────────────────── */}
        {phase === 'idle' && (
          <div className="config-panel">
            <div className="config-values">
              <span className="config-item">
                <span className="config-label">Buy-in</span>
                <span className="config-value">S/. {config.buy_in}</span>
              </span>
              <span className="config-item">
                <span className="config-label">Vidas</span>
                <span className="config-value">{config.max_lives}</span>
              </span>
            </div>
            {isWaiting && (
              <form className="config-form" onSubmit={handleSetConfig}>
                <input
                  className="nick-input config-input"
                  type="number" min="0.01" max="1000" step="0.01"
                  placeholder={`Buy-in (máx S/. 1000)`}
                  value={editBuyIn}
                  onChange={e => setEditBuyIn(e.target.value)}
                />
                <select
                  className="nick-input config-input"
                  value={editMaxLives}
                  onChange={e => setEditMaxLives(e.target.value)}
                >
                  <option value="">Vidas (actual: {config.max_lives})</option>
                  <option value="1">1 vida</option>
                  <option value="2">2 vidas</option>
                  <option value="3">3 vidas</option>
                  <option value="4">4 vidas</option>
                  <option value="5">5 vidas</option>
                </select>
                <button type="submit" className="btn-secondary config-btn">
                  Actualizar
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Player lists ───────────────────────────────── */}
        <div className="lobby-lists">
          <PlayerList
            title={`En espera (${waiting.length}/9)`}
            players={waiting}
            myNick={myNick}
            emptyText="Nadie esperando aún"
            readySet={new Set(ready)}
            apodos={apodos}
          />
          {playing.length > 0 && (
            <PlayerList
              title={`Jugando (${playing.length})`}
              players={playing}
              myNick={myNick}
              apodos={apodos}
            />
          )}
          {spectators.length > 0 && (
            <PlayerList
              title={`Espectadores (${spectators.length})`}
              players={spectators}
              myNick={myNick}
              apodos={apodos}
            />
          )}
          {disconnected.length > 0 && (
            <PlayerList
              title={`Desconectados (${disconnected.length})`}
              players={disconnected}
              myNick={myNick}
              dimmed
              apodos={apodos}
            />
          )}
        </div>

        {/* ── Actions ────────────────────────────────────── */}
        <div className="lobby-actions">
          {myRole === 'spectator' && phase === 'idle' && (
            <button className="btn-primary" onClick={joinGame} disabled={!canJoin}>
              {waiting.length >= 9 ? 'Sala llena' : 'Unirme a la partida'}
            </button>
          )}

          {isWaiting && (
            <>
              {/* Ready toggle */}
              <button
                className={amReady ? 'btn-secondary' : 'btn-primary'}
                onClick={amReady ? setUnready : setReady}
              >
                {amReady ? '✓ Listo (cancelar)' : 'Listo'}
              </button>

              {/* Start — only enabled when everyone is ready */}
              <button
                className="btn-primary"
                onClick={startGame}
                disabled={!allReady}
                title={!allReady ? 'Todos los jugadores deben estar listos' : ''}
              >
                {allReady
                  ? 'Iniciar partida'
                  : waiting.length < 2
                    ? `Esperando más jugadores (${waiting.length}/2)`
                    : `Esperando que todos estén listos (${ready.filter(n => waiting.includes(n)).length}/${waiting.length})`}
              </button>

              <button className="btn-secondary" onClick={leaveGame}>
                Salir de la espera
              </button>
            </>
          )}

          {myRole === 'spectator' && phase === 'in_game' && (
            <p className="spectator-note">Eres espectador. Podrás unirte en la siguiente partida.</p>
          )}
        </div>

        {/* ── Game history (Google Sheets) ──────────────── */}
        {sheets_url && (
          <a
            className="sheets-link"
            href={sheets_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver historial de partidas en Google Sheets"
          >
            <SheetsIcon />
            <span>Historial de partidas</span>
          </a>
        )}

        <div className="my-nick-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '15px' }}>
          <p className="my-nick-label" style={{ margin: 0 }}>
            Conectado como <strong>{myDisplayName}</strong> <span style={{ opacity: 0.6, fontSize: '12px' }}>({myNick})</span>
          </p>
          {phase === 'idle' && (
            <button 
              className="btn-change-apodo" 
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '13px',
                textDecoration: 'underline',
                marginTop: '5px'
              }}
              onClick={() => {
                setNewApodoVal(apodos[myNick] || myNick)
                setShowChangeApodo(true)
              }}
            >
              ✏️ Editar Apodo
            </button>
          )}
        </div>

        {showChangeApodo && (
          <div className="change-apodo-modal-backdrop" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}>
            <div className="card change-apodo-card" style={{ maxWidth: '350px', width: '90%', padding: '20px' }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Editar Apodo</h3>
              <p style={{ fontSize: '13px', color: 'var(--text)', opacity: 0.8, margin: '0 0 15px 0' }}>
                Este nombre será visible para todos en la mesa de juego.
              </p>
              <form onSubmit={handleUpdateApodo}>
                <input
                  type="text"
                  className="nick-input"
                  placeholder="Tu nuevo apodo"
                  value={newApodoVal}
                  onChange={e => setNewApodoVal(e.target.value)}
                  maxLength={15}
                  required
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <div className="modal-buttons" style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowChangeApodo(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary">
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function SheetsIcon() {
  // Google Sheets icon
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#43A047" d="M37 45H11a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h19l10 10v29a3 3 0 0 1-3 3z" />
      <path fill="#C8E6C9" d="M40 13H30V3z" />
      <path fill="#2E7D32" d="M30 13l10 10V13z" />
      <path fill="#E8F5E9" d="M31 23H17v14h14V23zm-8 12h-4v-3h4v3zm0-5h-4v-3h4v3zm6 5h-4v-3h4v3zm0-5h-4v-3h4v3z" />
    </svg>
  )
}

function PlayerList({ title, players, myNick, emptyText, readySet, apodos = {}, dimmed = false }) {
  if (players.length === 0 && !emptyText) return null
  return (
    <div className={`player-list${dimmed ? ' dimmed' : ''}`}>
      <h3>{title}</h3>
      {players.length === 0
        ? <p className="empty-list">{emptyText}</p>
        : (
          <ul>
            {players.map(nick => {
              const displayName = apodos[nick] || nick
              return (
                <li key={nick} className={nick === myNick ? 'me' : ''}>
                  {readySet?.has(nick) && <span className="ready-dot">✓ </span>}
                  {nick === myNick ? `${displayName} (tú)` : displayName}
                  {dimmed && ' ⚠'}
                </li>
              )
            })}
          </ul>
        )
      }
    </div>
  )
}
