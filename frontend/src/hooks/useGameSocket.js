import { useState, useRef, useCallback, useEffect } from 'react'

// WebSocket endpoint. In production set VITE_WS_URL (e.g. on Vercel);
// falls back to the local backend for development.
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

export function useGameSocket() {
  const wsRef = useRef(null)
  const [screen, setScreen]                   = useState('nick_form')
  const [myNick, setMyNick]                   = useState('')
  const [roomState, setRoomState]             = useState({
    waiting: [], playing: [], spectators: [], disconnected: [],
    phase: 'idle', ready: [], config: { buy_in: 10, max_lives: 3 }, session: null,
  })
  const [error, setError]                     = useState('')
  const [lastPong, setLastPong]               = useState(null)
  const [hand, setHand]                       = useState([])
  const [gameState, setGameState]             = useState(null)
  const [validActions, setValidActions]       = useState([])
  const [selectedHandCard, setSelectedHandCard] = useState(null)

  // Showdown state. showdownTimerMax is the window's full length so the
  // progress bar can scale (the window varies with player count).
  const [showdownData,  setShowdownData]  = useState(null)
  const [showdownTimer, setShowdownTimer] = useState(0)
  const [showdownTimerMax, setShowdownTimerMax] = useState(8)
  const showdownIntervalRef = useRef(null)

  // Turn timer countdown (received from server)
  const [turnTimer, setTurnTimer] = useState(0)
  const [turnTimerMax, setTurnTimerMax] = useState(20)
  const turnTimerIntervalRef = useRef(null)

  // Error auto-clear timer
  const errorTimeoutRef = useRef(null)

  function _showError(message) {
    setError(message)
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    errorTimeoutRef.current = setTimeout(() => setError(''), 5000)
  }

  // Trade notification (auto-clearing)
  const [tradeNotice, setTradeNotice] = useState('')
  const tradeNoticeTimeoutRef = useRef(null)

  function _showTradeNotice(message) {
    setTradeNotice(message)
    if (tradeNoticeTimeoutRef.current) clearTimeout(tradeNoticeTimeoutRef.current)
    tradeNoticeTimeoutRef.current = setTimeout(() => setTradeNotice(''), 6000)
  }

  function _clearShowdownInterval() {
    if (showdownIntervalRef.current) {
      clearInterval(showdownIntervalRef.current)
      showdownIntervalRef.current = null
    }
  }

  function _clearTurnTimerInterval() {
    if (turnTimerIntervalRef.current) {
      clearInterval(turnTimerIntervalRef.current)
      turnTimerIntervalRef.current = null
    }
  }

  // ── Incoming message dispatcher ──────────────────────────────────────
  const messageHandlers = useRef({})

  // We rebuild handlers inside a useEffect so they always close over
  // the latest state setters (which are stable refs anyway).
  useEffect(() => {
    messageHandlers.current = {
      room_state: (msg) => {
        setRoomState(msg)
        setScreen(prev => {
          if (prev === 'nick_form') {
            if (msg.phase === 'in_game')     return 'in_game'
            if (msg.phase === 'inter_round') return 'inter_round'
            return 'lobby'
          }
          if (prev === 'lobby') {
            if (msg.phase === 'in_game')     return 'in_game'
            if (msg.phase === 'inter_round') return 'inter_round'
          }
          if (prev === 'in_game' && msg.phase === 'inter_round') return 'inter_round'
          if (prev === 'inter_round' && msg.phase === 'in_game') return 'in_game'
          if (msg.phase === 'idle') return 'lobby'
          return prev
        })
        if (msg.phase === 'idle') {
          setHand([])
          setGameState(null)
          setValidActions([])
          setSelectedHandCard(null)
          setShowdownData(null)
          setShowdownTimer(0)
          _clearShowdownInterval()
          _clearTurnTimerInterval()
          setTurnTimer(0)
        }
      },

      error: (msg) => {
        setScreen(prev => {
          if (prev === 'nick_form') {
            // Connection-time error (e.g. duplicate nick): keep it visible
            // on the form, no auto-clear.
            setError(msg.message)
            if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
            wsRef.current?.close()
            wsRef.current = null
          } else {
            // In-game / lobby error: show transiently, auto-clear after 5s.
            _showError(msg.message)
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
        // Clear any lingering showdown data when a new round starts
        setShowdownData(null)
        setShowdownTimer(0)
        _clearShowdownInterval()
      },

      order_result: (_msg) => {},

      // Turn timer from server (duration may vary)
      turn_timer: (msg) => {
        const secs = msg.seconds ?? 20
        _clearTurnTimerInterval()
        setTurnTimerMax(secs)
        setTurnTimer(secs)
        turnTimerIntervalRef.current = setInterval(() => {
          setTurnTimer(prev => {
            if (prev <= 1) {
              _clearTurnTimerInterval()
              return 0
            }
            return prev - 1
          })
        }, 1000)
      },

      // Server signals showdown window is open (length varies by player count)
      showdown_timer: (msg) => {
        const secs = msg.seconds ?? 8
        _clearShowdownInterval()
        setShowdownTimerMax(secs)
        setShowdownTimer(secs)
        showdownIntervalRef.current = setInterval(() => {
          setShowdownTimer(prev => {
            if (prev <= 1) {
              _clearShowdownInterval()
              return 0
            }
            return prev - 1
          })
        }, 1000)
      },

      // Initial showdown reveal: safe hands already exposed, losers listed
      showdown_reveal: (msg) => {
        setShowdownData(msg)
        // msg contains: { evaluations, winners, losers, revealed, table }
        _clearTurnTimerInterval()
        setTurnTimer(0)
      },

      // A loser voluntarily revealed their hand during the 8s window
      showdown_reveal_update: (msg) => {
        setShowdownData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            revealed: { ...prev.revealed, [msg.nickname]: msg.cards },
          }
        })
      },

      // A life trade was completed — notify everyone
      trade_notice: (msg) => {
        const lives = msg.amount === 1 ? '1 vida' : `${msg.amount} vidas`
        const kind  = msg.directed ? 'oferta dirigida' : 'oferta pública'
        _showTradeNotice(
          `${msg.seller} vendió ${lives} a ${msg.buyer} por S/. ${Number(msg.price).toFixed(2)} (${kind})`
        )
      },
    }
  })

  const handleMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.data)
      const handler = messageHandlers.current[msg.type]
      if (handler) handler(msg)
      else console.warn('[ws] Tipo desconocido:', msg.type)
    } catch (e) {
      console.error('[ws] Error al parsear:', e)
    }
  }, [])

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      _clearShowdownInterval()
      _clearTurnTimerInterval()
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
      if (tradeNoticeTimeoutRef.current) clearTimeout(tradeNoticeTimeoutRef.current)
    }
  }, [])

  // ── Connection ───────────────────────────────────────────────────────
  const connect = useCallback((nickname) => {
    if (!nickname.trim()) return
    setError('')
    setMyNick(nickname.trim())

    const socket = new WebSocket(WS_URL)
    socket.onopen    = () => send_raw(socket, 'join', { nickname: nickname.trim() })
    socket.onmessage = handleMessage
    socket.onclose   = () => {
      if (wsRef.current) {
        setError('Conexión cerrada por el servidor.')
        setScreen('nick_form')
        wsRef.current = null
        _clearShowdownInterval()
        _clearTurnTimerInterval()
      }
    }
    wsRef.current = socket
  }, [handleMessage])

  // ── Sender ───────────────────────────────────────────────────────────
  function send_raw(socket, type, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type, ...payload }))
  }

  const send = useCallback((type, payload = {}) => {
    send_raw(wsRef.current, type, payload)
  }, [])

  // ── Lobby ────────────────────────────────────────────────────────────
  const joinGame   = useCallback(() => send('join_game'),   [send])
  const leaveGame  = useCallback(() => send('leave_game'),  [send])
  const startGame  = useCallback(() => send('start_game'),  [send])
  const ping       = useCallback(() => send('ping'),        [send])
  const setReady   = useCallback(() => send('ready'),       [send])
  const setUnready = useCallback(() => send('unready'),     [send])
  const setConfig  = useCallback((buy_in, max_lives) =>
    send('set_config', { buy_in, max_lives }), [send])

  // ── In-game ──────────────────────────────────────────────────────────
  const swapAll  = useCallback(() => send('swap_all'),  [send])
  const passTurn = useCallback(() => send('pass_turn'), [send])
  const stand    = useCallback(() => send('stand'),     [send])
  const newGame  = useCallback(() => send('new_game'),  [send])

  const swapOne = useCallback((handCardId, tableCardId) => {
    send('swap_one', { hand_card_id: handCardId, table_card_id: tableCardId })
    setSelectedHandCard(null)
  }, [send])

  const onRevealHand = useCallback(() => send('reveal_hand'), [send])

  // ── Inter-round ──────────────────────────────────────────────────────
  const postLifeOffer = useCallback((offer_type, amount, price, target_nick) =>
    send('life_offer', { offer_type, amount, price, target_nick }), [send])

  const acceptOffer = useCallback((offer_id) =>
    send('accept_offer', { offer_id }), [send])

  const cancelOffer = useCallback((offer_id) =>
    send('cancel_offer', { offer_id }), [send])

  const reactOffer = useCallback((offer_id, emoji) =>
    send('react_offer', { offer_id, emoji }), [send])

  const proposeFinalDeal = useCallback((my_share) =>
    send('propose_final_deal', { my_share }), [send])

  const acceptFinalDeal = useCallback(() => send('accept_final_deal'), [send])
  const rejectFinalDeal = useCallback(() => send('reject_final_deal'), [send])

  const interReady   = useCallback(() => send('inter_ready'),   [send])
  const interUnready = useCallback(() => send('inter_unready'), [send])

  // ── Derived state ────────────────────────────────────────────────────
  const myRole = roomState.waiting.includes(myNick)  ? 'waiting'
    : roomState.playing.includes(myNick)             ? 'playing'
    : 'spectator'

  const amReady = roomState.ready?.includes(myNick) ?? false

  return {
    screen, myNick, myRole, roomState, error, lastPong,
    hand, gameState, validActions,
    selectedHandCard, setSelectedHandCard,
    amReady,
    showdownData, showdownTimer, showdownTimerMax,
    turnTimer, turnTimerMax,
    tradeNotice,
    connect, send,
    joinGame, leaveGame, startGame, ping,
    setReady, setUnready, setConfig,
    swapAll, swapOne, passTurn, stand, newGame,
    onRevealHand,
    postLifeOffer, acceptOffer, cancelOffer, reactOffer,
    proposeFinalDeal, acceptFinalDeal, rejectFinalDeal,
    interReady, interUnready,
  }
}
