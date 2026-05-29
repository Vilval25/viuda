import React, { useEffect, useState } from 'react'
import Card, { CardBack } from './Card'

export default function OrderDeterminationAnimation({ data, onFinish, playEffect, apodos = {} }) {
  // data has { type: "order_result", order_cards: { nick: card }, play_order: [nick1, nick2...] }
  const { order_cards, play_order } = data
  const players = Object.keys(order_cards)
  
  // Track animation phases:
  // 'idle' -> 'dealing' -> 'flipping' -> 'winner_highlight' -> 'done'
  const [phase, setPhase] = useState('idle')
  const [dealtList, setDealtList] = useState([])       // players who received a face-down card
  const [revealedMap, setRevealedMap] = useState({})   // player -> boolean (is card flipped?)
  const [highlightedWinner, setHighlightedWinner] = useState(null)

  const dealer = play_order[play_order.length - 1] // last in play_order is the dealer (highest card)
  const winner = play_order[0] // first in play_order is the round starter (left of dealer)

  useEffect(() => {
    // Start dealing animation immediately on mount
    setPhase('dealing')

    // Stagger dealing face-down cards to all players
    players.forEach((nick, idx) => {
      setTimeout(() => {
        setDealtList(prev => [...prev, nick])
        if (playEffect) playEffect('swap_one')
      }, idx * 350)
    });

    // Stagger flipping the cards face-up
    const flipStartDelay = players.length * 350 + 400
    players.forEach((nick, idx) => {
      setTimeout(() => {
        setRevealedMap(prev => ({ ...prev, [nick]: true }))
        if (playEffect) playEffect('swap_one')
      }, flipStartDelay + idx * 450)
    });

    // Highlight the winner and play sound
    const winnerHighlightDelay = flipStartDelay + players.length * 450 + 300
    setTimeout(() => {
      setPhase('winner_highlight')
      setHighlightedWinner(winner)
      if (playEffect) playEffect('new_offer')
    }, winnerHighlightDelay)

    // Complete the animation and transition to board
    const finishDelay = winnerHighlightDelay + 3000
    setTimeout(() => {
      setPhase('done')
      onFinish()
    }, finishDelay)

  }, [data])

  return (
    <div className="order-anim-overlay">
      <div className="order-anim-container">
        <h2 className="order-anim-title">
          <span className="sparkle">✨</span> Determinando Orden de Turnos <span className="sparkle">✨</span>
        </h2>
        <p className="order-anim-subtitle">
          Se reparte una carta alta a cada jugador para definir quién reparte. ¡El jugador a la izquierda de la carta más alta empieza!
        </p>

        <div className="order-anim-players-grid">
          {players.map((nick) => {
            const hasDealt = dealtList.includes(nick)
            const isFlipped = revealedMap[nick]
            const cardData = order_cards[nick]
            const isWinner = highlightedWinner === nick
            const isDealer = phase === 'winner_highlight' && dealer === nick
            const displayName = apodos[nick] || nick

            return (
              <div 
                key={nick} 
                className={`order-anim-player-card ${isWinner ? 'winner-glow' : ''} ${isDealer ? 'dealer-glow' : ''} ${hasDealt ? 'card-entered' : 'card-hidden'}`}
              >
                <div className="order-anim-nick">{displayName}</div>
                
                <div className="order-anim-card-slot">
                  {hasDealt ? (
                    <div className={`order-anim-card-flipper ${isFlipped ? 'flipped' : ''}`}>
                      <div className="card-side card-side-back">
                        <CardBack />
                      </div>
                      <div className="card-side card-side-front">
                        {cardData && <Card card={cardData} />}
                      </div>
                    </div>
                  ) : (
                    <div className="card-slot-placeholder" />
                  )}
                </div>

                {isDealer && (
                  <div className="order-anim-dealer-badge">
                    🔔 REPARTIDOR
                  </div>
                )}

                {isWinner && phase === 'winner_highlight' && (
                  <div className="order-anim-winner-badge">
                    👑 EMPIEZA
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {phase === 'winner_highlight' && winner && dealer && (
          <div className="order-anim-banner">
            👑 <strong className="winner-highlight-text">{apodos[dealer] || dealer}</strong> saca la carta más alta ({order_cards[dealer]?.rank}) y reparte. ¡Empieza <strong>{apodos[winner] || winner}</strong> a su izquierda! 👑
          </div>
        )}
      </div>
    </div>
  )
}
