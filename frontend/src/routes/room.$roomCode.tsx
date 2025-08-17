import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useRoom } from '../api'
import { useGameStore, useUserStore } from '../stores'
import { WaitingView } from '../components/WaitingView'

export const Route = createFileRoute('/room/$roomCode')({
  component: RoomPage,
})

function RoomPage() {
  const { roomCode } = useParams({ from: '/room/$roomCode' })
  const navigate = useNavigate()
  const { hasValidSession } = useUserStore()
  const { setCurrentRoom, setGameState, clearGame } = useGameStore()

  // Redirect to home if no valid session
  useEffect(() => {
    if (!hasValidSession()) {
      navigate({ to: '/' })
    }
  }, [hasValidSession, navigate])

  const { data: roomData, isLoading, error } = useRoom(roomCode)

  useEffect(() => {
    if (roomData) {
      setCurrentRoom(roomData.room.room_id)
      setGameState(roomData.room.state as any)
    }
  }, [roomData, setCurrentRoom, setGameState])

  useEffect(() => {
    return () => {
      // Clean up game state when leaving the route
      clearGame()
    }
  }, [clearGame])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading room...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Room Not Found</h2>
          <p className="text-gray-600 mb-4">
            {error.message || 'Unable to load the room. It may not exist or you may not have access.'}
          </p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!roomData) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {roomData.room.state === 'WAITING' && (
        <WaitingView room={roomData.room} players={roomData.players} />
      )}
      {roomData.room.state === 'PLAYING' && (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Game In Progress</h2>
          <p>Game view coming soon...</p>
        </div>
      )}
      {roomData.room.state === 'FINISHED' && (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Game Finished</h2>
          <p>Results view coming soon...</p>
        </div>
      )}
    </div>
  )
}