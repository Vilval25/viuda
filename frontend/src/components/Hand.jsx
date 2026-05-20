import Card from './Card'

export default function Hand({ cards, onCardClick, selectedId, disabledIds = [] }) {
  if (!cards || cards.length === 0) {
    return <p className="empty-hand">Sin cartas</p>
  }

  return (
    <div className="hand">
      {cards.map(card => (
        <Card
          key={card.id}
          card={card}
          selected={card.id === selectedId}
          disabled={disabledIds.includes(card.id)}
          onClick={onCardClick ? () => onCardClick(card) : undefined}
        />
      ))}
    </div>
  )
}
