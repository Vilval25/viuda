import Hand from './Hand'
import OpponentSeat from './OpponentSeat'
import Card, { CardBack } from './Card'

export default function Table({
  myNick,
  hand = [],
  gameState,
  validActions = [],
  selectedHandCard,
  setSelectedHandCard,
  swapAll,
  swapOne,
  passTurn,
  stand,
  newGame,
  error = '',
}) {
  const opponents    = gameState?.players?.filter(p => p.nickname !== myNick) ?? []
  const myData       = gameState?.players?.find(p => p.nickname === myNick)
  const currentPlayer = gameState?.current_player
  const isMyTurn     = currentPlayer === myNick
  const tableInfo    = gameState?.table
  const tableCards   = tableInfo?.face_up ? (tableInfo.cards ?? []) : []
  const showdown     = gameState?._showdown

  const canSwapAll  = validActions.includes('swap_all')
  const canSwapOne  = validActions.includes('swap_one')
  const canPass     = validActions.includes('pass_turn')
  const canStand    = validActions.includes('stand')

  function handleHandCardClick(card) {
    if (!canSwapOne) return
    setSelectedHandCard(prev => prev?.id === card.id ? null : card)
  }

  function handleTableCardClick(card) {
    if (!canSwapOne || !selectedHandCard) return
    swapOne(selectedHandCard.id, card.id)
  }

  return (
    <div className="table-layout">

      {/* ── Showdown overlay ──────────────────────────────── */}
      {showdown && (
        <div className="showdown-overlay">
          <div className="showdown-box">
            <h2>Showdown</h2>
            <ul className="showdown-list">
              {showdown.evaluations?.map(ev => (
                <li key={ev.nickname} className={showdown.winners?.includes(ev.nickname) ? 'winner' : ''}>
                  <strong>{ev.nickname}</strong> — {ev.rank.replace(/_/g, ' ')}
                  {showdown.winners?.includes(ev.nickname) && ' 🏆'}
                </li>
              ))}
            </ul>
            <p className="showdown-table-label">Cartas de la mesa:</p>
            <div className="showdown-table-cards">
              {showdown.table?.map(c => <Card key={c.id} card={c} />)}
            </div>
            <button className="btn-primary showdown-new-game" onClick={newGame}>
              Nueva partida
            </button>
          </div>
        </div>
      )}

      {/* ── Game error toast ─────────────────────────────── */}
      {error && !showdown && (
        <div className="game-error-toast">{error}</div>
      )}

      {/* ── Opponents ───────────────────────────────────── */}
      <div className="opponents-area">
        {opponents.length === 0 ? (
          <p className="table-hint">Esperando oponentes…</p>
        ) : (
          opponents.map(p => (
            <OpponentSeat
              key={p.nickname}
              nickname={p.nickname}
              cardCount={p.card_count}
              isCurrentTurn={p.nickname === currentPlayer}
              isStanding={p.is_standing}
            />
          ))
        )}
      </div>

      {/* ── Felt / center ───────────────────────────────── */}
      <div className="table-felt">
        <span className="table-felt-label">viuda</span>

        {/* Table cards */}
        <div className="table-cards-row">
          {tableInfo?.face_up ? (
            tableCards.map(c => (
              <div
                key={c.id}
                className={[
                  'table-card-slot',
                  canSwapOne && selectedHandCard ? 'clickable' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleTableCardClick(c)}
              >
                <Card card={c} />
              </div>
            ))
          ) : (
            Array.from({ length: tableInfo?.count ?? 0 }).map((_, i) => (
              <div key={i} className="table-card-slot">
                <CardBack />
              </div>
            ))
          )}
        </div>

        {/* Turn indicator */}
        {gameState?.phase === 'playing' && (
          <p className="turn-indicator">
            {isMyTurn ? '¡Es tu turno!' : `Turno de ${currentPlayer}`}
          </p>
        )}
      </div>

      {/* ── My area ─────────────────────────────────────── */}
      <div className="player-area">
        <div className="player-header">
          <p className={`player-label ${isMyTurn ? 'my-turn' : ''}`}>
            {myNick}
            {myData?.is_standing && <span className="standing-badge"> (plantado)</span>}
            <span className="player-card-count"> · {myData?.card_count ?? hand.length} cartas</span>
          </p>

          {/* Action buttons — only visible on my turn */}
          {isMyTurn && (
            <div className="action-buttons">
              {canSwapAll && (
                <button className="btn btn-primary" onClick={swapAll}>
                  Cambiar mano
                </button>
              )}
              {canSwapOne && (
                <span className="action-hint">
                  {selectedHandCard
                    ? 'Ahora selecciona una carta de la mesa'
                    : 'Selecciona una carta de tu mano'}
                </span>
              )}
              {canPass && (
                <button className="btn btn-secondary" onClick={passTurn}>
                  Pasar
                </button>
              )}
              {canStand && (
                <button className="btn btn-danger" onClick={stand}>
                  Plantarse
                </button>
              )}
            </div>
          )}
        </div>

        <Hand
          cards={hand}
          onCardClick={canSwapOne ? handleHandCardClick : undefined}
          selectedId={selectedHandCard?.id}
        />
      </div>

    </div>
  )
}
