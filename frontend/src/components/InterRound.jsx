import { useState } from 'react'

export default function InterRound({
  myNick,
  session,
  error = '',
  tradeNotice = '',
  postLifeOffer,
  acceptOffer,
  cancelOffer,
  proposeFinalDeal,
  acceptFinalDeal,
  rejectFinalDeal,
  onInterReady,
  onInterUnready,
}) {
  const [offerType,   setOfferType]   = useState('public_sell')
  const [offerAmount, setOfferAmount] = useState('1')
  const [offerPrice,  setOfferPrice]  = useState('')
  const [offerTarget, setOfferTarget] = useState('')
  const [dealShare,   setDealShare]   = useState('')

  if (!session) return null

  const {
    lives = {}, balances = {}, pot = 0, max_lives = 3, buy_in = 10,
    round_number = 1, life_offers = [], final_deal, inter_ready = [],
  } = session

  const alive      = Object.entries(lives).filter(([, v]) => v > 0).map(([n]) => n)
  const allPlayers = Object.keys(lives)
  const myLives    = lives[myNick] ?? 0
  const isAlive    = myLives > 0
  // A spectator never joined the game, so is not a key in `lives`.
  // Eliminated players (lives === 0) are still participants.
  const isParticipant = allPlayers.includes(myNick)
  const amReady    = inter_ready.includes(myNick)
  const showFinalDeal = alive.length === 2 && isAlive

  // Alive players can sell or buy; eliminated players can only buy.
  const canSell = myLives > 0

  const isDirected = offerType === 'direct_sell' || offerType === 'direct_buy'
  const isSell     = offerType === 'public_sell' || offerType === 'direct_sell'

  function handlePostOffer(e) {
    e.preventDefault()
    const amount = parseInt(offerAmount, 10)
    const price  = parseFloat(parseFloat(offerPrice).toFixed(2))
    const target = isDirected ? offerTarget : null
    postLifeOffer(offerType, amount, price, target)
    setOfferPrice('')
    setOfferTarget('')
    setOfferAmount('1')
  }

  function handleProposeDeal(e) {
    e.preventDefault()
    proposeFinalDeal(parseFloat(parseFloat(dealShare).toFixed(2)))
    setDealShare('')
  }

  const myOffers     = life_offers.filter(o => o.from_nick === myNick)
  // All other offers are visible to everyone (including directed ones);
  // whether the local player can *accept* is decided per-offer below.
  const othersOffers = life_offers.filter(o => o.from_nick !== myNick)

  // Can the local player accept this offer?
  function canAcceptOffer(o) {
    if (!isParticipant) return false
    const directed = o.offer_type === 'direct_sell' || o.offer_type === 'direct_buy'
    // Directed offers are only acceptable by their target.
    if (directed && o.target_nick !== myNick) return false
    const isSellOffer = o.offer_type === 'public_sell' || o.offer_type === 'direct_sell'
    if (isSellOffer) {
      // Offerer sells -> I buy: I must not exceed the life cap.
      return myLives + o.amount <= max_lives
    }
    // Buy offer: offerer buys -> I sell: I must have enough lives.
    return myLives >= o.amount
  }

  return (
    <div className="inter-round-layout">
      <div className="inter-round-header">
        <h2>Entre rondas — Ronda {round_number}</h2>
        <p className="inter-pot">Pozo: <strong>S/. {Number(pot).toFixed(2)}</strong></p>
      </div>

      {error && <div className="game-error-toast">{error}</div>}
      {tradeNotice && <div className="trade-notice-toast">{tradeNotice}</div>}

      {/* ── Player status grid ──────────────────────────── */}
      <div className="ir-section">
        <h3>Jugadores</h3>
        <div className="ir-players-grid">
          {allPlayers.map(nick => {
            const v      = lives[nick] ?? 0
            const bal    = balances[nick] ?? 0
            const ready  = inter_ready.includes(nick)
            return (
              <div key={nick} className={`ir-player-card ${v <= 0 ? 'eliminated' : ''} ${nick === myNick ? 'me' : ''}`}>
                <p className="ir-nick">
                  {nick === myNick ? `${nick} (tú)` : nick}
                  {ready && <span className="ready-dot"> ✓</span>}
                </p>
                <p className="ir-lives">
                  {Array.from({ length: max_lives }).map((_, i) => (
                    <span key={i} className={`life-dot ${i < v ? 'alive' : 'dead'}`}>♥</span>
                  ))}
                </p>
                <p className="ir-balance" style={{ color: bal >= 0 ? '#4ade80' : '#f87171' }}>
                  S/. {Number(bal).toFixed(2)}
                </p>
                {v <= 0 && <p className="ir-eliminated-label">Eliminado</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Final deal ──────────────────────────────────── */}
      {showFinalDeal && (
        <div className="ir-section ir-final-deal">
          <h3>Trato final</h3>
          {final_deal ? (
            <div className="fd-pending">
              <p>
                <strong>{final_deal.proposer}</strong> propone:{' '}
                queda con <strong>S/. {Number(final_deal.my_share).toFixed(2)}</strong>,
                el otro recibe <strong>S/. {(Number(final_deal.pot) - Number(final_deal.my_share)).toFixed(2)}</strong>.
              </p>
              {final_deal.proposer !== myNick ? (
                <div className="fd-buttons">
                  <button className="btn-primary" onClick={acceptFinalDeal}>Aceptar</button>
                  <button className="btn-danger"  onClick={rejectFinalDeal}>Rechazar</button>
                </div>
              ) : (
                <p className="ir-hint">Esperando respuesta de {alive.find(n => n !== myNick)}…</p>
              )}
            </div>
          ) : (
            <form className="fd-form" onSubmit={handleProposeDeal}>
              <p className="ir-hint">Pozo total: S/. {Number(pot).toFixed(2)}. ¿Cuánto quieres tú?</p>
              <input
                className="nick-input config-input"
                type="number" min="0" max={pot} step="0.01" required
                placeholder={`Tu parte (0 – ${Number(pot).toFixed(2)})`}
                value={dealShare}
                onChange={e => setDealShare(e.target.value)}
              />
              <button type="submit" className="btn-primary">Proponer trato</button>
            </form>
          )}
        </div>
      )}

      {/* ── Post offer ──────────────────────────────────── */}
      <div className="ir-section">
        <h3>Intercambio de vidas</h3>

        {isParticipant ? (
          <form className="offer-form" onSubmit={handlePostOffer}>
            <select
              className="nick-input config-input"
              value={offerType}
              onChange={e => setOfferType(e.target.value)}
            >
              <option value="public_sell" disabled={!canSell}>Venta pública</option>
              <option value="public_buy">Compra pública</option>
              <option value="direct_sell" disabled={!canSell}>Venta dirigida</option>
              <option value="direct_buy">Compra dirigida</option>
            </select>

            <input
              className="nick-input config-input"
              type="number" min="1" max={isSell ? myLives || 1 : 99}
              step="1" required
              placeholder="Vidas"
              value={offerAmount}
              onChange={e => setOfferAmount(e.target.value)}
            />

            <input
              className="nick-input config-input"
              type="number" min="0" step="0.01" required
              placeholder="Precio total (S/.)"
              value={offerPrice}
              onChange={e => setOfferPrice(e.target.value)}
            />

            {isDirected && (
              <select
                className="nick-input config-input"
                value={offerTarget}
                onChange={e => setOfferTarget(e.target.value)}
                required
              >
                <option value="">Destinatario</option>
                {allPlayers.filter(n => n !== myNick).map(n => (
                  <option key={n} value={n}>{n} ({lives[n] ?? 0} vidas)</option>
                ))}
              </select>
            )}

            <button type="submit" className="btn-secondary" disabled={isSell && !canSell}>
              Publicar oferta
            </button>
          </form>
        ) : (
          <p className="ir-hint">Eres espectador: no puedes intercambiar vidas.</p>
        )}

        {/* My active offers */}
        {myOffers.length > 0 && (
          <div className="my-offers">
            <p className="ir-hint">Mis ofertas activas:</p>
            {myOffers.map(o => (
              <div key={o.id} className="offer-row my-offer">
                <span className="offer-label">{offerLabel(o, myNick)}</span>
                <button className="btn-danger btn-sm" onClick={() => cancelOffer(o.id)}>Cancelar</button>
              </div>
            ))}
          </div>
        )}

        {/* Others' offers */}
        {othersOffers.length > 0 && (
          <div className="public-offers">
            <p className="ir-hint">Ofertas disponibles:</p>
            {othersOffers.map(o => (
              <div key={o.id} className="offer-row">
                <span className="offer-label">{offerLabel(o, myNick)}</span>
                {canAcceptOffer(o) && (
                  <button className="btn-primary btn-sm" onClick={() => acceptOffer(o.id)}>Aceptar</button>
                )}
              </div>
            ))}
          </div>
        )}

        {life_offers.length === 0 && myOffers.length === 0 && (
          <p className="ir-hint">No hay ofertas activas.</p>
        )}
      </div>

      {/* ── Ready to continue ───────────────────────────── */}
      <div className="ir-section ir-ready-section">
        <h3>Continuar a ronda {round_number + 1}</h3>
        <p className="ir-hint">
          Listos: {inter_ready.filter(n => alive.includes(n)).length} / {alive.length}
        </p>
        {isAlive ? (
          <button
            className={amReady ? 'btn-secondary' : 'btn-primary'}
            onClick={amReady ? onInterUnready : onInterReady}
            style={{ width: '100%', padding: '10px' }}
          >
            {amReady ? '✓ Listo (cancelar)' : 'Listo para continuar'}
          </button>
        ) : (
          <p className="ir-hint">
            {isParticipant
              ? 'Estás eliminado: esperando a los jugadores con vidas.'
              : 'Esperando a que los jugadores estén listos.'}
          </p>
        )}
      </div>
    </div>
  )
}

function offerLabel(o, myNick) {
  const price  = Number(o.price).toFixed(2)
  const amount = o.amount === 1 ? '1 vida' : `${o.amount} vidas`
  const who    = (n) => (n === myNick ? 'tú' : n)
  if (o.offer_type === 'public_sell')
    return `${who(o.from_nick)} vende ${amount} → S/. ${price}`
  if (o.offer_type === 'public_buy')
    return `${who(o.from_nick)} compra ${amount} → S/. ${price}`
  if (o.offer_type === 'direct_sell')
    return `${who(o.from_nick)} vende ${amount} a ${who(o.target_nick)} → S/. ${price}`
  if (o.offer_type === 'direct_buy')
    return `${who(o.from_nick)} compra ${amount} a ${who(o.target_nick)} → S/. ${price}`
  return `${who(o.from_nick)} → ${who(o.target_nick)}: ${amount} por S/. ${price}`
}
