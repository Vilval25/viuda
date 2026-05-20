import { CardBack } from './Card'

const MAX_VISIBLE_BACKS = 5

export default function OpponentSeat({ nickname, cardCount = 0, isCurrentTurn = false, isStanding = false }) {
  const visibleBacks = Math.min(cardCount, MAX_VISIBLE_BACKS)
  const hidden = cardCount - visibleBacks

  return (
    <div className={`opponent-seat ${isCurrentTurn ? 'current-turn' : ''}`}>
      <div className="opponent-backs">
        {Array.from({ length: visibleBacks }).map((_, i) => (
          <div key={i} className="opponent-back-wrapper" style={{ marginLeft: i === 0 ? 0 : -28 }}>
            <CardBack />
          </div>
        ))}
        {hidden > 0 && (
          <span className="hidden-count">+{hidden}</span>
        )}
        {cardCount === 0 && (
          <span className="no-cards">Sin cartas</span>
        )}
      </div>
      <p className="opponent-name">
        {nickname}
        {isCurrentTurn ? ' 🎯' : ''}
        {isStanding ? <span className="standing-badge"> (plantado)</span> : null}
      </p>
      <p className="opponent-card-count">{cardCount} carta{cardCount !== 1 ? 's' : ''}</p>
    </div>
  )
}
