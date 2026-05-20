export default function Lobby({ myNick, myRole, roomState, joinGame, leaveGame, startGame }) {
  const { waiting, playing, spectators, disconnected = [], phase } = roomState

  const canJoin = phase === 'idle' && waiting.length < 9 && myRole === 'spectator'
  const canStart = phase === 'idle' && myRole === 'waiting' && waiting.length >= 2
  const isWaiting = myRole === 'waiting'

  return (
    <div className="screen-center">
      <div className="card lobby-card">
        <h1>Viuda</h1>

        {phase === 'in_game' && (
          <div className="phase-badge in-game">Partida en curso</div>
        )}
        {phase === 'idle' && (
          <div className="phase-badge idle">Esperando jugadores</div>
        )}

        <div className="lobby-lists">
          <PlayerList
            title={`En espera (${waiting.length}/9)`}
            players={waiting}
            myNick={myNick}
            emptyText="Nadie esperando aún"
          />
          {playing.length > 0 && (
            <PlayerList
              title={`Jugando (${playing.length})`}
              players={playing}
              myNick={myNick}
              emptyText=""
            />
          )}
          {spectators.length > 0 && (
            <PlayerList
              title={`Espectadores (${spectators.length})`}
              players={spectators}
              myNick={myNick}
              emptyText=""
            />
          )}
          {disconnected.length > 0 && (
            <PlayerList
              title={`Desconectados (${disconnected.length})`}
              players={disconnected}
              myNick={myNick}
              emptyText=""
              dimmed
            />
          )}
        </div>

        <div className="lobby-actions">
          {myRole === 'spectator' && phase === 'idle' && (
            <button
              className="btn-primary"
              onClick={joinGame}
              disabled={!canJoin}
            >
              {waiting.length >= 9 ? 'Sala llena' : 'Unirme a la partida'}
            </button>
          )}

          {isWaiting && (
            <>
              <button
                className="btn-primary"
                onClick={startGame}
                disabled={!canStart}
                title={waiting.length < 2 ? 'Se necesitan al menos 2 jugadores' : ''}
              >
                {waiting.length < 2
                  ? `Esperando más jugadores (${waiting.length}/2)`
                  : 'Iniciar partida'}
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

        <p className="my-nick-label">Conectado como <strong>{myNick}</strong></p>
      </div>
    </div>
  )
}

function PlayerList({ title, players, myNick, emptyText, dimmed = false }) {
  if (players.length === 0 && !emptyText) return null
  return (
    <div className={`player-list${dimmed ? ' dimmed' : ''}`}>
      <h3>{title}</h3>
      {players.length === 0
        ? <p className="empty-list">{emptyText}</p>
        : (
          <ul>
            {players.map(nick => (
              <li key={nick} className={nick === myNick ? 'me' : ''}>
                {nick === myNick ? `${nick} (tú)` : nick}
                {dimmed && ' ⚠'}
              </li>
            ))}
          </ul>
        )
      }
    </div>
  )
}
