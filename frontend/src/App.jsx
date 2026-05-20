import { useGameSocket } from './hooks/useGameSocket'
import NickForm from './components/NickForm'
import Lobby from './components/Lobby'
import Table from './components/Table'
import './App.css'

function App() {
  const socket = useGameSocket()

  if (socket.screen === 'nick_form') {
    return <NickForm onConnect={socket.connect} error={socket.error} />
  }

  if (socket.screen === 'lobby') {
    return <Lobby {...socket} />
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
      />
    )
  }

  return null
}

export default App
