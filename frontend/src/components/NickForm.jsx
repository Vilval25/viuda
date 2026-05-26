import { useState } from 'react'

export default function NickForm({ onConnect, error }) {
  const [nick, setNick] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (nick.trim()) onConnect(nick.trim())
  }

  return (
    <div className="screen-center">
      <div className="card">
        <h1>Viuda</h1>
        <p className="subtitle">Juego de cartas multijugador</p>
        <form onSubmit={handleSubmit} className="nick-form">
          <input
            type="text"
            placeholder="Tu nombre"
            value={nick}
            onChange={e => setNick(e.target.value)}
            maxLength={20}
            autoFocus
            className="nick-input"
          />
          <button type="submit" disabled={!nick.trim()} className="btn-primary">
            Entrar
          </button>
        </form>
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  )
}
