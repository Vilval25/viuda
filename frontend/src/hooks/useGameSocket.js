import { useState, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws'

export function useGameSocket() {
  const wsRef = useRef(null)
  const [screen, setScreen] = useState('nick_form') // 'nick_form' | 'lobby' | 'in_game'
  const [myNick, setMyNick] = useState('')
  const [roomState, setRoomState] = useState({ waiting: [], playing: [], spectators: [], phase: 'idle' })
  const [error, setError] = useState('')
  const [lastPong, setLastPong] = useState(null)
  const [hand, setHand] = useState([])
  const [gameState, setGameState] = useState(null)
  const [validActions, setValidActions] = useState([])
  const [selectedHandCard, setSelectedHandCard] = useState(null) // card object | null

  // ── Incoming message dispatcher ──────────────────────────────────────
  const messageHandlers = useRef({
    room_state: (msg) => {
      setRoomState(msg)
      setScreen(prev => {
        if (prev === 'nick_form') {
          // Reconnecting into an active game lands directly on the table
          if (msg.phase === 'in_game') return 'in_game'
          return 'lobby'
        }
        if (msg.phase === 'in_game' && prev === 'lobby') return 'in_game'
        if (msg.phase === 'idle' && prev === 'in_game') return 'lobby'
        return prev
      })
      if (msg.phase === 'idle') {
        setHand([])
        setGameState(null)
        setValidActions([])
        setSelectedHandCard(null)
      }
    },
    error: (msg) => {
      setError(msg.message)
      // Only fatal errors (before joining) should close the connection
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      // If we haven't left nick_form yet, this is a connection-level rejection
      setScreen(prev => {
        if (prev === 'nick_form') {
          wsRef.current?.close()
          wsRef.current = null
        }
        return prev
      })
    },
    pong: (_msg) => {
      setLastPong(new Date().toISOString())
    },
    hand: (msg) => {
      setHand(msg.cards)
      setSelectedHandCard(null)
    },
    game_state: (msg) => {
      setGameState(msg)
      setValidActions(msg.valid_actions ?? [])
    },
    showdown: (msg) => {
      setGameState(prev => prev ? { ...prev, _showdown: msg } : prev)
    },
    order_result: (_msg) => {
      // ignore, informational only
    },
  })

  const handleMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.data)
      const handler = messageHandlers.current[msg.type]
      if (handler) {
        handler(msg)
      } else {
        console.warn('[ws] Tipo de mensaje desconocido:', msg.type)
      }
    } catch (e) {
      console.error('[ws] Error al parsear mensaje:', e)
    }
  }, [])

  // ── Connection ───────────────────────────────────────────────────────
  const connect = useCallback((nickname) => {
    if (!nickname.trim()) return
    setError('')
    setMyNick(nickname.trim())

    const socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      send_raw(socket, 'join', { nickname: nickname.trim() })
    }

    socket.onmessage = handleMessage

    socket.onclose = () => {
      if (wsRef.current) {
        setError('Conexión cerrada por el servidor.')
        setScreen('nick_form')
        wsRef.current = null
      }
    }

    wsRef.current = socket
  }, [handleMessage])

  // ── Sender helpers ───────────────────────────────────────────────────
  function send_raw(socket, type, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, ...payload }))
    }
  }

  const send = useCallback((type, payload = {}) => {
    send_raw(wsRef.current, type, payload)
  }, [])

  const joinGame  = useCallback(() => send('join_game'),  [send])
  const leaveGame = useCallback(() => send('leave_game'), [send])
  const startGame = useCallback(() => send('start_game'), [send])
  const ping      = useCallback(() => send('ping'),       [send])

  // ── Game actions ─────────────────────────────────────────────────────
  const swapAll   = useCallback(() => send('swap_all'),  [send])
  const passTurn  = useCallback(() => send('pass_turn'), [send])
  const stand     = useCallback(() => send('stand'),     [send])
  const newGame   = useCallback(() => send('new_game'),  [send])

  const swapOne = useCallback((handCardId, tableCardId) => {
    send('swap_one', { hand_card_id: handCardId, table_card_id: tableCardId })
    setSelectedHandCard(null)
  }, [send])

  // ── Derived state ────────────────────────────────────────────────────
  const myRole = roomState.waiting.includes(myNick)  ? 'waiting'
    : roomState.playing.includes(myNick)             ? 'playing'
    : 'spectator'

  return {
    screen, myNick, myRole, roomState, error, lastPong,
    hand, gameState, validActions,
    selectedHandCard, setSelectedHandCard,
    connect, send, joinGame, leaveGame, startGame, ping,
    swapAll, swapOne, passTurn, stand, newGame,
  }
}
