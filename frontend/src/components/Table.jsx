import { useState, useEffect, useRef } from 'react'
import Hand from './Hand'
import Card, { CardBack } from './Card'

// Poker hand ranks in Spanish, keyed by the server's HandRank names.
const RANK_LABELS = {
  HIGH_CARD:       'Carta alta',
  ONE_PAIR:        'Pareja',
  TWO_PAIR:        'Doble pareja',
  THREE_OF_A_KIND: 'Trío',
  STRAIGHT:        'Escalera',
  FLUSH:           'Color',
  FULL_HOUSE:      'Full',
  FOUR_OF_A_KIND:  'Póker',
  STRAIGHT_FLUSH:  'Escalera de color',
  ROYAL_FLUSH:     'Escalera real',
}

// ── Round table layout ─────────────────────────────────────────────────
// The local player is always at the bottom (6 o'clock).
// Other players are distributed clockwise around the table by turn order.

function getSeatAngle(seatIndex, totalSeats) {
  // seatIndex 0 = local player (bottom, 180°)
  // remaining seats spread clockwise starting from bottom
  const step = 360 / totalSeats
  return 180 + seatIndex * step   // degrees, 0° = top
}

function angleToCSSPosition(angleDeg, radiusX, radiusY) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  const x   = 50 + radiusX * Math.cos(rad)
  const y   = 50 + radiusY * Math.sin(rad)
  return { left: `${x}%`, top: `${y}%` }
}

// ── Opponent seat ──────────────────────────────────────────────────────

function OpponentSeat({ player, isCurrentTurn, session }) {
  const lives   = session?.lives?.[player.nickname]  ?? null
  const maxLives = session?.max_lives ?? null

  return (
    <div className={`round-seat opponent-seat-r ${isCurrentTurn ? 'current-turn' : ''} ${lives === 0 ? 'eliminated' : ''}`}>
      <p className="rs-name">{player.nickname}</p>

      {/* Turn label sits right above this player's cards */}
      {isCurrentTurn && <span className="rs-turn-label">Su turno</span>}

      {/* Card backs */}
      <div className="rs-backs">
        {Array.from({ length: player.card_count ?? 0 }).map((_, i) => (
          <div key={i} className="rs-back" style={{ marginLeft: i === 0 ? 0 : -14 }}>
            <CardBack />
          </div>
        ))}
      </div>

      {/* Lives */}
      {maxLives !== null && (
        <div className="rs-lives">
          {Array.from({ length: maxLives }).map((_, i) => (
            <span key={i} className={`rs-life ${i < (lives ?? 0) ? 'alive' : 'dead'}`}>♥</span>
          ))}
        </div>
      )}

      {player.is_standing && <span className="rs-standing">plantado</span>}
    </div>
  )
}

// ── Main Table ─────────────────────────────────────────────────────────

export default function Table({
  myNick,
  hand = [],
  handRank = null,
  gameState,
  validActions = [],
  selectedHandCard,
  setSelectedHandCard,
  selectedTableCard,
  setSelectedTableCard,
  swapAll,
  swapOne,
  passTurn,
  stand,
  newGame,
  error = '',
  session = null,
  // showdown state passed from hook
  showdownData = null,
  showdownTimer = 0,
  showdownTimerMax = 8,
  onRevealHand,
  turnTimer = 0,
  turnTimerMax = 25,
  gameReaction = null,
  sendGameReaction = () => {},
}) {
  const players       = gameState?.players ?? []
  const currentPlayer = gameState?.current_player
  const isMyTurn      = currentPlayer === myNick
  const tableInfo     = gameState?.table
  const tableCards    = tableInfo?.face_up ? (tableInfo.cards ?? []) : []
  const lastSwapped   = new Set(tableInfo?.last_swapped ?? [])
  // Ghost of the card just taken from each slot — { slotIndex: card }.
  const lastTaken     = tableInfo?.last_taken ?? {}
  const showdown      = showdownData

  const myData  = players.find(p => p.nickname === myNick)
  const myLives = session?.lives?.[myNick] ?? null
  // A spectator is not among the round's players.
  const isInGame = myData !== undefined

  const canAct     = validActions.length > 0
  const canSwapAll = validActions.includes('swap_all')
  const canSwapOne = validActions.includes('swap_one')
  const canPass    = validActions.includes('pass_turn')
  const canStand   = validActions.includes('stand')

  const [reactions, setReactions] = useState([])
  const lastReactionRef = useRef(null)

  useEffect(() => {
    if (gameReaction && gameReaction !== lastReactionRef.current) {
      lastReactionRef.current = gameReaction
      const id = `${gameReaction.nickname}-${gameReaction.timestamp}`
      setReactions(prev => [
        ...prev,
        {
          id,
          nickname: gameReaction.nickname,
          emoji: gameReaction.emoji,
        }
      ])
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id))
      }, 2500)
    }
  }, [gameReaction])

  // Get CSS position for a player name (seats layout relative coordinates)
  function getPlayerPosition(nick) {
    const seatIdx = orderedNicks.indexOf(nick)
    if (seatIdx < 0) return { left: '50%', top: '50%' }
    const angle = getSeatAngle(seatIdx, totalSeats)
    return angleToCSSPosition(angle, 38, 34)
  }

  function renderLastActionNotice() {
    const act = gameState?.last_action
    if (!act) return null

    let text = ''
    if (act.action === 'swap_all') {
      text = 'cambió toda su mano 🃏'
    } else if (act.action === 'swap_one') {
      text = 'cambió una carta 🃏'
    } else if (act.action === 'pass') {
      text = act.auto_stood
        ? 'pasó (2da vez) y se plantó obligatoriamente 🛑'
        : 'pasó ⏭️'
    } else if (act.action === 'stand') {
      text = 'se plantó 🛑'
    }

    return (
      <div className="live-action-banner-wrapper" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <div className="live-action-banner">
          <span className="player-name">¡{act.player}</span>
          <span className="action-text">{text}!</span>
        </div>
      </div>
    )
  }

  // Visual seating uses the FIXED session seat order, not the per-round
  // turn order — so opponents never jump from one side to the other
  // between rounds. Only players present in this round are shown.
  const presentNicks = new Set(players.map(p => p.nickname))
  const seatOrder = (session?.seat_order ?? gameState?.order ?? players.map(p => p.nickname))
    .filter(n => presentNicks.has(n))
  const myIndex   = seatOrder.indexOf(myNick)
  const orderedNicks = myIndex >= 0
    ? [...seatOrder.slice(myIndex), ...seatOrder.slice(0, myIndex)]
    : [myNick, ...seatOrder.filter(n => n !== myNick)]

  const totalSeats = orderedNicks.length || 1

  // Single-card swap: a hand card and a table card can be picked in any
  // order. Once both are selected, the swap fires automatically.
  function handleHandCardClick(card) {
    if (!canSwapOne) return
    if (selectedHandCard?.id === card.id) {
      setSelectedHandCard(null)
      return
    }
    if (selectedTableCard) {
      swapOne(card.id, selectedTableCard.id)
    } else {
      setSelectedHandCard(card)
    }
  }

  function handleTableCardClick(card) {
    if (!canSwapOne) return
    // A joker on the table can't be taken with a single-card swap.
    if (card.rank === 'JOKER') return
    if (selectedTableCard?.id === card.id) {
      setSelectedTableCard(null)
      return
    }
    if (selectedHandCard) {
      swapOne(selectedHandCard.id, card.id)
    } else {
      setSelectedTableCard(card)
    }
  }

  return (
    <div className="table-layout">

      {/* ── Session bar ─────────────────────────────────── */}
      {session && (
        <div className="session-bar">
          <span className="session-bar-item">
            <span className="session-bar-label">Ronda</span>
            <span className="session-bar-value">{session.round_number}</span>
          </span>
          <span className="session-bar-item">
            <span className="session-bar-label">Pozo</span>
            <span className="session-bar-value">S/. {session.pot?.toFixed(2)}</span>
          </span>
          <span className="session-bar-item">
            <span className="session-bar-label">Vidas</span>
            <span className="session-bar-value">
              {Array.from({ length: session.max_lives }).map((_, i) => (
                <span key={i} style={{ color: i < (myLives ?? 0) ? '#ef4444' : '#334155' }}>♥</span>
              ))}
            </span>
          </span>
          <span className="session-bar-item">
            <span className="session-bar-label">Balance</span>
            <span className="session-bar-value" style={{ color: (session.balances?.[myNick] ?? 0) >= 0 ? '#4ade80' : '#f87171' }}>
              S/. {(session.balances?.[myNick] ?? 0).toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {/* ── Turn timer bar ──────────────────────────────── */}
      {turnTimer > 0 && !showdown && (
        <div className="turn-timer-bar-wrapper">
          <div
            className="turn-timer-bar-fill"
            style={{ width: `${(turnTimer / turnTimerMax) * 100}%` }}
          />
        </div>
      )}

      {/* ── Game error toast ────────────────────────────── */}
      {error && !showdown && (
        <div className="game-error-toast">{error}</div>
      )}

      {/* ── Showdown overlay ────────────────────────────── */}
      {showdown && (
        <ShowdownOverlay
          showdown={showdown}
          myNick={myNick}
          timer={showdownTimer}
          timerMax={showdownTimerMax}
          onRevealHand={onRevealHand}
          session={session}
        />
      )}

      {renderLastActionNotice()}

      {/* ── Round table ─────────────────────────────────── */}
      <div className="round-table-container">
        {/* Floating Reactions overlay */}
        {reactions.map(r => {
          const pos = getPlayerPosition(r.nickname)
          return (
            <div
              key={r.id}
              className="floating-reaction"
              style={{ left: pos.left, top: pos.top }}
            >
              {r.emoji}
            </div>
          )
        })}

        <div className="round-table-felt">
          <span className="table-felt-label">viuda</span>

          {/* Table cards in center */}
          <div className="table-cards-row">
            {tableInfo?.face_up ? (
              tableCards.map((c, i) => {
                const isJoker = c.rank === 'JOKER'
                const ghost   = lastTaken[i] ?? lastTaken[String(i)]
                return (
                <div
                  key={c.id}
                  className={[
                    'table-card-slot',
                    canSwapOne && !isJoker ? 'clickable' : '',
                    lastSwapped.has(c.id) ? 'recently-swapped' : '',
                    ghost ? 'has-ghost' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleTableCardClick(c)}
                  title={isJoker ? 'Para llevarte un joker debes cambiar toda tu mano' : undefined}
                >
                  {ghost && (
                    <div className="taken-ghost" aria-hidden="true">
                      <Card card={ghost} />
                    </div>
                  )}
                  <Card card={c} selected={selectedTableCard?.id === c.id} />
                </div>
                )
              })
            ) : (
              Array.from({ length: tableInfo?.count ?? 0 }).map((_, i) => (
                <div key={i} className="table-card-slot"><CardBack /></div>
              ))
            )}
          </div>

        </div>

        {/* Opponent seats positioned around the table */}
        {orderedNicks.slice(1).map((nick, i) => {
          const seatIndex = i + 1
          const angle  = getSeatAngle(seatIndex, totalSeats)
          const pos    = angleToCSSPosition(angle, 38, 34)
          const player = players.find(p => p.nickname === nick) ?? { nickname: nick, card_count: 0 }
          return (
            <div
              key={nick}
              className="round-seat-wrapper"
              style={{ left: pos.left, top: pos.top }}
            >
              <OpponentSeat
                player={player}
                isCurrentTurn={nick === currentPlayer}
                session={session}
              />
            </div>
          )
        })}
      </div>

      {/* ── My area (always bottom) ──────────────────────── */}
      <div className={`player-area ${isInGame && canAct ? 'my-turn-area' : ''}`}>
        {isInGame ? (
          <>
            {canAct && <p className="my-turn-banner">Tu turno</p>}

            <div className="player-header">
              <p className="player-label">
                {myNick}
                {myData?.is_standing && <span className="standing-badge"> (plantado)</span>}
              </p>

              {canAct && (
                <div className="action-buttons">
                  {canSwapAll && (
                    <button className="btn btn-primary" onClick={swapAll}>Cambiar mano</button>
                  )}
                  {canSwapOne && (
                    <span className="action-hint">
                      {selectedHandCard
                        ? 'Ahora elige una carta de la mesa'
                        : selectedTableCard
                          ? 'Ahora elige una carta de tu mano'
                          : 'Elige una carta (mano o mesa) para intercambiar'}
                    </span>
                  )}
                  {canPass && (
                    <button className="btn btn-secondary" onClick={passTurn}>Pasar</button>
                  )}
                  {canStand && (
                    <button className="btn btn-danger" onClick={stand}>Plantarse</button>
                  )}
                </div>
              )}
            </div>

            {hand.length > 0 && handRank && (
              <p className="hand-rank">
                Tu mano: <strong>{RANK_LABELS[handRank.name] ?? handRank.name}</strong>
              </p>
            )}

            <Hand
              cards={hand}
              onCardClick={canSwapOne ? handleHandCardClick : undefined}
              selectedId={selectedHandCard?.id}
            />

            {/* Emoji Reaction Selector */}
            <div className="emoji-reaction-bar">
              {['👍', '👎', '😂', '😮', '🔥', '🤔', '😱', '🃏', '👑'].map(emoji => (
                <button
                  key={emoji}
                  className="reaction-emoji-btn"
                  onClick={() => sendGameReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="spectator-area-label">
            👁 Estás como espectador — observando la partida
          </p>
        )}
      </div>

    </div>
  )
}

// ── Showdown overlay ───────────────────────────────────────────────────

function compareTiebreakers(a = [], b = []) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return bv - av
  }
  return 0
}

function ShowdownOverlay({ showdown, myNick, timer, timerMax = 8, onRevealHand, session }) {
  const amLoser    = showdown.losers?.includes(myNick)
  const alreadyRevealed = showdown.revealed?.[myNick] != null

  // Strongest hand first: by rank value, then tiebreakers descending.
  const orderedEvals = [...(showdown.evaluations ?? [])].sort((a, b) => {
    if ((b.rank_value ?? 0) !== (a.rank_value ?? 0))
      return (b.rank_value ?? 0) - (a.rank_value ?? 0)
    return compareTiebreakers(a.tiebreakers, b.tiebreakers)
  })

  return (
    <div className="showdown-overlay">
      <div className="showdown-box">
        <h2>Showdown</h2>

        {timer > 0 && (
          <div className="showdown-timer-bar">
            <div
              className="showdown-timer-fill"
              style={{ width: `${(timer / timerMax) * 100}%` }}
            />
            <span className="showdown-timer-label">{timer}s</span>
          </div>
        )}

        <div className="showdown-players">
          {orderedEvals.map(ev => {
            const isLoser   = showdown.losers?.includes(ev.nickname)
            const isSafe    = !isLoser
            const revealed  = showdown.revealed?.[ev.nickname]
            const isWinner  = showdown.winners?.includes(ev.nickname)

            return (
              <div key={ev.nickname} className={`showdown-player-row ${isSafe ? 'safe' : 'loser'} ${isWinner ? 'winner' : ''}`}>
                <div className="showdown-player-info">
                  <span className="showdown-nick">
                    {ev.nickname}
                    {isWinner && ' 🏆'}
                    {isSafe && <span className="safe-badge">Salvo</span>}
                    {isLoser && <span className="loser-badge">Pierde vida</span>}
                  </span>
                  <span className="showdown-rank">{ev.rank?.replace(/_/g, ' ')}</span>
                </div>
                {revealed ? (
                  <div className="showdown-hand-cards">
                    {revealed.map(c => <Card key={c.id} card={c} />)}
                  </div>
                ) : isLoser ? (
                  <p className="showdown-hidden">Mano oculta</p>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Table cards */}
        <p className="showdown-table-label">Mesa:</p>
        <div className="showdown-table-cards">
          {showdown.table?.map(c => <Card key={c.id} card={c} />)}
        </div>

        {/* Reveal button for losers */}
        {amLoser && !alreadyRevealed && timer > 0 && (
          <button className="btn-primary showdown-new-game" onClick={onRevealHand}>
            Mostrar mi mano
          </button>
        )}
      </div>
    </div>
  )
}
