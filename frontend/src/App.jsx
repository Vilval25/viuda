import { useEffect, useRef } from 'react'
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

  // ── Wire sound effects to game events ────────────────────────────────
  const prev = useRef({ hadShowdown: false, offerCount: 0 })

  useEffect(() => {
    const p = prev.current
    const { showdownData, roomState } = socket

    // Showdown opens
    const hasShowdown = showdownData != null
    if (hasShowdown && !p.hadShowdown) sound.playEffect('showdown')
    p.hadShowdown = hasShowdown

    // A new life offer was posted
    const offers = roomState?.session?.life_offers ?? []
    if (offers.length > p.offerCount) sound.playEffect('new_offer')
    p.offerCount = offers.length
  }, [socket, sound])

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
        playEffect={sound.playEffect}
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
