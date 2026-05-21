import { useGameSocket } from './hooks/useGameSocket'
import NickForm    from './components/NickForm'
import Lobby       from './components/Lobby'
import Table       from './components/Table'
import InterRound  from './components/InterRound'
import './App.css'

function App() {
  const socket = useGameSocket()

  if (socket.screen === 'nick_form') {
    return <NickForm onConnect={socket.connect} error={socket.error} />
  }

  if (socket.screen === 'lobby') {
    return (
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
  }

  if (socket.screen === 'in_game') {
    return (
      <Table
        myNick={socket.myNick}
        hand={socket.hand}
        gameState={socket.gameState}
        validActions={socket.validActions}
        selectedHandCard={socket.selectedHandCard}
        setSelectedHandCard={socket.setSelectedHandCard}
        swapAll={socket.swapAll}
        swapOne={socket.swapOne}
        passTurn={socket.passTurn}
        stand={socket.stand}
        newGame={socket.newGame}
        error={socket.error}
        session={socket.roomState.session}
        showdownData={socket.showdownData}
        showdownTimer={socket.showdownTimer}
        onRevealHand={socket.onRevealHand}
        turnTimer={socket.turnTimer}
      />
    )
  }

  if (socket.screen === 'inter_round') {
    return (
      <InterRound
        myNick={socket.myNick}
        session={socket.roomState.session}
        error={socket.error}
        tradeNotice={socket.tradeNotice}
        postLifeOffer={socket.postLifeOffer}
        acceptOffer={socket.acceptOffer}
        cancelOffer={socket.cancelOffer}
        proposeFinalDeal={socket.proposeFinalDeal}
        acceptFinalDeal={socket.acceptFinalDeal}
        rejectFinalDeal={socket.rejectFinalDeal}
        onInterReady={socket.interReady}
        onInterUnready={socket.interUnready}
      />
    )
  }

  return null
}

export default App
