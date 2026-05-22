import { useEffect } from 'react'
import { useGameSocket } from './hooks/useGameSocket'
import { useSound }      from './hooks/useSound'
import NickForm      from './components/NickForm'
import Lobby         from './components/Lobby'
import Table         from './components/Table'
import InterRound    from './components/InterRound'
import SoundControls from './components/SoundControls'
import './App.css'

function App() {
  const socket = useGameSocket()
  const sound  = useSound()

  // ── Sound effects: play whatever the server broadcasts ───────────────
  // Effects are server-driven so every player in the room hears the same
  // sound at the same time.
  useEffect(() => {
    if (socket.soundEvent) sound.playEffect(socket.soundEvent.effect)
    // Re-runs whenever soundEvent.seq changes (even for the same effect).
  }, [socket.soundEvent, sound])

  // ── Background music sync ────────────────────────────────────────────
  // Feed the server's shared music clock into the audio system so all
  // players hear roughly the same part of the track.
  const musicEpoch  = socket.roomState?.music_epoch
  const serverTime  = socket.roomState?.server_time
  useEffect(() => {
    if (musicEpoch != null) sound.updateMusicClock(musicEpoch, serverTime)
  }, [musicEpoch, serverTime, sound])

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
        proposeFinalDeal={socket.proposeFinalDeal}
        acceptFinalDeal={socket.acceptFinalDeal}
        rejectFinalDeal={socket.rejectFinalDeal}
        onInterReady={socket.interReady}
        onInterUnready={socket.interUnready}
      />
    )
  }

  return (
    <>
      {screenEl}
      <SoundControls sound={sound} />
    </>
  )
}

export default App
