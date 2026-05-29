import { useEffect, useRef, useState } from 'react'
import { useGameSocket } from './hooks/useGameSocket'
import { useSound }      from './hooks/useSound'
import NickForm      from './components/NickForm'
import Lobby         from './components/Lobby'
import Table         from './components/Table'
import InterRound    from './components/InterRound'
import SoundControls from './components/SoundControls'
import OrderDeterminationAnimation from './components/OrderDeterminationAnimation'
import './App.css'

function App() {
  const socket = useGameSocket()
  const sound  = useSound()
  const [startNotice, setStartNotice] = useState(null)

  // Auto-login from a remembered session so the player skips the form.
  // Runs once on mount; the connect call is a no-op if the socket is up.
  const connect = socket.connect
  const triedAutoLogin = useRef(false)
  useEffect(() => {
    if (triedAutoLogin.current) return
    triedAutoLogin.current = true
    const s = socket.savedSession
    if (s?.username) connect(s.username, s.apodo || s.username)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sound effects: play whatever the server broadcasts ───────────────
  // Effects are server-driven so every player in the room hears the same
  // sound at the same time. Keyed on soundEvent.seq ONLY — depending on the
  // whole `sound` object would re-fire the last effect on every re-render.
  const playEffect = sound.playEffect
  const soundSeq   = socket.soundEvent?.seq
  const soundFx    = socket.soundEvent?.effect
  useEffect(() => {
    if (soundSeq != null && soundFx) playEffect(soundFx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundSeq])

  // ── Background music sync ────────────────────────────────────────────
  // Feed the server's shared music clock into the audio system. Only the
  // first reading matters (updateMusicClock ignores later ones).
  const updateMusicClock = sound.updateMusicClock
  const musicEpoch = socket.roomState?.music_epoch
  const serverTime = socket.roomState?.server_time
  useEffect(() => {
    if (musicEpoch != null) updateMusicClock(musicEpoch, serverTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicEpoch])

  // ── Secret joker sounds (personal — only the local player hears them) ─
  // The `hand` message is per-player, so detecting jokers here is naturally
  // local. Plays the sound only when the joker count rises (just received).
  const prevJokers = useRef(0)
  const hand = socket.hand
  const roundNumber = socket.roomState?.session?.round_number
  // A new round deals a fresh hand — reset so its jokers are detected anew.
  useEffect(() => { prevJokers.current = 0 }, [roundNumber])
  useEffect(() => {
    const jokers = (hand ?? []).filter(c => c.rank === 'JOKER').length
    if (jokers > prevJokers.current) {
      if (jokers >= 2)      playEffect('two_jokers')
      else if (jokers === 1) playEffect('one_joker')
    }
    prevJokers.current = jokers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand])

  // Turn announcement toast for subsequent rounds (Ronda 2+)
  const orderResult = socket.orderResult
  const setOrderResult = socket.setOrderResult
  useEffect(() => {
    if (orderResult) {
      if (roundNumber > 1) {
        const starter = orderResult.play_order[0]
        const apodo = socket.roomState.apodos?.[starter] || starter
        setStartNotice(apodo)
        setOrderResult(null) // suppress animation overlay
        playEffect('new_offer')
      }
    }
  }, [orderResult, roundNumber, setOrderResult, playEffect, socket.roomState.apodos])

  // Separate effect to auto-clear the turn announcement after 3 seconds
  useEffect(() => {
    if (startNotice) {
      const timer = setTimeout(() => {
        setStartNotice(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [startNotice])

  let screenEl = null

  if (socket.screen === 'nick_form') {
    screenEl = <NickForm onConnect={socket.connect} error={socket.error} />
  } else if (socket.screen === 'lobby') {
    screenEl = (
      <Lobby
        myNick={socket.myNick}
        myRole={socket.myRole}
        roomState={socket.roomState}
        joinGame={socket.joinGame}
        leaveGame={socket.leaveGame}
        startGame={socket.startGame}
        setReady={socket.setReady}
        setUnready={socket.setUnready}
        setConfig={socket.setConfig}
        amReady={socket.amReady}
        changeApodo={socket.changeApodo}
        logout={socket.logout}
      />
    )
  } else if (socket.screen === 'in_game') {
    screenEl = (
      <Table
        myNick={socket.myNick}
        hand={socket.hand}
        handRank={socket.handRank}
        gameState={socket.gameState}
        validActions={socket.validActions}
        selectedHandCard={socket.selectedHandCard}
        setSelectedHandCard={socket.setSelectedHandCard}
        selectedTableCard={socket.selectedTableCard}
        setSelectedTableCard={socket.setSelectedTableCard}
        swapAll={socket.swapAll}
        swapOne={socket.swapOne}
        passTurn={socket.passTurn}
        stand={socket.stand}
        newGame={socket.newGame}
        error={socket.error}
        session={socket.roomState.session}
        showdownData={socket.showdownData}
        showdownTimer={socket.showdownTimer}
        showdownTimerMax={socket.showdownTimerMax}
        onRevealHand={socket.onRevealHand}
        turnTimer={socket.turnTimer}
        turnTimerMax={socket.turnTimerMax}
        gameReaction={socket.gameReaction}
        sendGameReaction={socket.sendGameReaction}
        apodos={socket.roomState.apodos}
      />
    )
  } else if (socket.screen === 'inter_round') {
    screenEl = (
      <InterRound
        myNick={socket.myNick}
        session={socket.roomState.session}
        error={socket.error}
        tradeNotice={socket.tradeNotice}
        postLifeOffer={socket.postLifeOffer}
        acceptOffer={socket.acceptOffer}
        cancelOffer={socket.cancelOffer}
        reactOffer={socket.reactOffer}
        placeBid={socket.placeBid}
        proposeFinalDeal={socket.proposeFinalDeal}
        acceptFinalDeal={socket.acceptFinalDeal}
        rejectFinalDeal={socket.rejectFinalDeal}
        onInterReady={socket.interReady}
        onInterUnready={socket.interUnready}
        changeApodo={socket.changeApodo}
        apodos={socket.roomState.apodos}
      />
    )
  }

  return (
    <>
      {screenEl}
      {startNotice && (
        <div className="start-notice-toast">
          👑 ¡La ronda {roundNumber} comienza! Turno de <strong>{startNotice}</strong> 🃏
        </div>
      )}
      {socket.orderResult && (roundNumber === 1 || !roundNumber) && (
        <OrderDeterminationAnimation 
          data={socket.orderResult}
          onFinish={() => socket.setOrderResult(null)}
          playEffect={sound.playEffect}
          apodos={socket.roomState.apodos}
        />
      )}
      <SoundControls sound={sound} />
    </>
  )
}

export default App
