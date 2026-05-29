import { useState } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
const API_URL = WS_URL.replace('ws://', 'http://').replace('wss://', 'https://').replace('/ws', '')

export default function NickForm({ onConnect, error }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'change_password' | 'pick_apodo'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apodo, setApodo] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Usuario y contraseña son requeridos.')
      return
    }
    setErrorMsg('')
    setInfoMsg('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setInfoMsg('¡Registro exitoso! Por favor inicia sesión.')
        setMode('login')
        setPassword('')
      } else {
        setErrorMsg(data.message || 'Error al registrarse.')
      }
    } catch (err) {
      setErrorMsg('Error de conexión con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Usuario y contraseña son requeridos.')
      return
    }
    setErrorMsg('')
    setInfoMsg('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setApodo(data.apodo || username.trim()) // default apodo to username
        setMode('pick_apodo')
      } else {
        setErrorMsg(data.message || 'Error al iniciar sesión.')
      }
    } catch (err) {
      setErrorMsg('Error de conexión con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Usuario y nueva contraseña son requeridos.')
      return
    }
    setErrorMsg('')
    setInfoMsg('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setInfoMsg('Contraseña actualizada con éxito. Inicia sesión con tu nueva clave.')
        setMode('login')
        setPassword('')
      } else {
        setErrorMsg(data.message || 'Error al cambiar contraseña.')
      }
    } catch (err) {
      setErrorMsg('Error de conexión con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectGame(e) {
    e.preventDefault()
    if (!apodo.trim()) {
      setErrorMsg('El apodo no puede estar vacío.')
      return
    }
    setLoading(true)
    try {
      // Save their chosen apodo to the sheet
      await fetch(`${API_URL}/api/update-apodo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), apodo: apodo.trim() })
      })
      // Connect to the WebSocket lobby using both username and apodo
      onConnect(username.trim(), apodo.trim())
    } catch (err) {
      // Even if saving apodo fails, proceed to connect to game
      onConnect(username.trim(), apodo.trim())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen-center">
      <div className="card auth-card">
        <h1>Viuda</h1>
        <p className="subtitle">Juego de cartas multijugador</p>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="nick-form">
            <h3 className="auth-title">Iniciar Sesión</h3>
            <input
              type="text"
              placeholder="Usuario (Tu Nombre real)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={25}
              required
              autoFocus
              className="nick-input"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="nick-input"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Cargando...' : 'Iniciar Sesión'}
            </button>
            
            <div className="auth-links">
              <span className="auth-link" onClick={() => { setMode('register'); setErrorMsg(''); setInfoMsg(''); }}>
                ¿No tienes cuenta? Regístrate
              </span>
              <span className="auth-link" onClick={() => { setMode('change_password'); setErrorMsg(''); setInfoMsg(''); }}>
                Cambiar Contraseña
              </span>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="nick-form">
            <h3 className="auth-title">Crear Cuenta</h3>
            <div className="auth-instruction">
              ⚠️ Aclaración: El usuario en el registro debe ser tu nombre real completo.
            </div>
            <input
              type="text"
              placeholder="Usuario (Coloca tu Nombre completo)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={25}
              required
              autoFocus
              className="nick-input"
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="nick-input"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Cargando...' : 'Registrarse'}
            </button>
            
            <div className="auth-links">
              <span className="auth-link" onClick={() => { setMode('login'); setErrorMsg(''); setInfoMsg(''); }}>
                Volver al inicio de sesión
              </span>
            </div>
          </form>
        )}

        {mode === 'change_password' && (
          <form onSubmit={handleChangePassword} className="nick-form">
            <h3 className="auth-title">Cambiar Contraseña</h3>
            <input
              type="text"
              placeholder="Usuario (Tu Nombre real)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={25}
              required
              autoFocus
              className="nick-input"
            />
            <input
              type="password"
              placeholder="Nueva Contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="nick-input"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Cargando...' : 'Actualizar Contraseña'}
            </button>
            
            <div className="auth-links">
              <span className="auth-link" onClick={() => { setMode('login'); setErrorMsg(''); setInfoMsg(''); }}>
                Volver al inicio de sesión
              </span>
            </div>
          </form>
        )}

        {mode === 'pick_apodo' && (
          <form onSubmit={handleConnectGame} className="nick-form">
            <h3 className="auth-title">Elige tu Apodo</h3>
            <p style={{ fontSize: '13px', color: 'var(--text)', margin: '-5px 0 10px', textAlign: 'center' }}>
              Este nombre será visible para los otros jugadores en la mesa.
            </p>
            <input
              type="text"
              placeholder="Tu Apodo"
              value={apodo}
              onChange={e => setApodo(e.target.value)}
              maxLength={15}
              required
              autoFocus
              className="nick-input"
            />
            <button type="submit" disabled={loading || !apodo.trim()} className="btn-primary">
              {loading ? 'Entrando...' : 'Entrar a la Sala'}
            </button>
          </form>
        )}

        {errorMsg && <p className="error-msg">{errorMsg}</p>}
        {infoMsg && <p className="info-msg">{infoMsg}</p>}
        {error && !errorMsg && <p className="error-msg">{error}</p>}
      </div>
    </div>
  )
}
