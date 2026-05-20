const SUIT_SYMBOL = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣', joker_black: '★', joker_red: '★' }
const SUIT_COLOR  = { spades: 'black', clubs: 'black', hearts: 'red', diamonds: 'red', joker_black: 'joker', joker_red: 'joker' }

export default function Card({ card, onClick, selected = false, disabled = false }) {
  const symbol = SUIT_SYMBOL[card.suit] ?? '?'
  const color  = SUIT_COLOR[card.suit]  ?? 'black'

  return (
    <div
      className={[
        'card-tile',
        `suit-${color}`,
        selected  ? 'selected'  : '',
        disabled  ? 'disabled'  : '',
        onClick && !disabled ? 'clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick && !disabled ? onClick : undefined}
    >
      <span className="card-corner top-left">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{symbol}</span>
      </span>
      <span className="card-center-suit">{symbol}</span>
      <span className="card-corner bottom-right">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit-small">{symbol}</span>
      </span>
    </div>
  )
}

export function CardBack() {
  return <div className="card-tile card-back" />
}
