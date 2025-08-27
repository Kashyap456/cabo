import { useEffect } from 'react'
import { useRoomStore, RoomPhase } from '../../stores/game_state'
import { useGameWebSocket } from '../../api/game_ws'
import WaitingView from './WaitingView'
import PlayingView from './PlayingView'
import EndGameView from './EndGameView'

interface RoomProps {
  roomCode: string
}

export default function Room({ roomCode }: RoomProps) {
  const { phase, setRoomCode, isReady } = useRoomStore()
  const { isConnected, isConnecting, connectionStatus } = useGameWebSocket()

  useEffect(() => {
    setRoomCode(roomCode)
  }, [roomCode, setRoomCode])

  if (isConnecting || (isConnected && !isReady)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>{isConnecting ? 'Connecting to game...' : 'Synchronizing...'}</p>
          <p className="text-sm text-gray-500">{connectionStatus}</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-6 h-6 bg-red-600 rounded-full"></div>
          </div>
          <p className="text-red-600 mb-2">Connection failed</p>
          <p className="text-sm text-gray-500">{connectionStatus}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-center mb-2">
            Room {roomCode}
          </h1>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">Connected</span>
          </div>
        </div>

        {phase === RoomPhase.WAITING && <WaitingView />}
        {phase === RoomPhase.IN_GAME && <PlayingView />}
        {phase === RoomPhase.ENDED && <EndGameView />}
      </div>
    </div>
  )
}
