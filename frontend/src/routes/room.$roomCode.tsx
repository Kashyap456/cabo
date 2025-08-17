import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useRoom, useJoinRoom, useValidateSession } from '../api'
import { useGameStore } from '../stores'
import { WaitingView } from '../components/WaitingView'

export const Route = createFileRoute('/room/$roomCode')({
  component: RoomPage,
})

function RoomPage() {
  const { roomCode } = useParams({ from: '/room/$roomCode' })
  const navigate = useNavigate()
  const { setCurrentRoom, setGameState, clearGame } = useGameStore()
  
  // Check session status without immediate redirect
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = useValidateSession()
  const joinRoomMutation = useJoinRoom()
  const { data: roomData, isLoading: roomLoading, error: roomError, refetch: refetchRoom } = useRoom(roomCode)

  // Handle session validation
  useEffect(() => {
    if (sessionError && !sessionLoading) {
      // No valid session, redirect to home
      navigate({ to: '/' })
    }
  }, [sessionError, sessionLoading, navigate])

  // Try to join room if not already in it
  useEffect(() => {
    if (roomError && sessionData && !joinRoomMutation.isPending) {
      // If we can't access the room, try to join it
      const errorMessage = roomError.message || ''
      if (errorMessage.includes('Not in this room') || errorMessage.includes('403')) {
        joinRoomMutation.mutate(roomCode, {
          onSuccess: () => {
            // Successfully joined, refetch room data
            refetchRoom()
          },
          onError: (error) => {
            console.error('Failed to join room:', error)
            // If join fails, redirect to home after a brief delay
            setTimeout(() => navigate({ to: '/' }), 2000)
          }
        })
      }
    }
  }, [roomError, sessionData, roomCode, joinRoomMutation, refetchRoom, navigate])

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

  const isLoading = sessionLoading || roomLoading || joinRoomMutation.isPending

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {joinRoomMutation.isPending ? 'Joining room...' : 'Loading room...'}
          </p>
        </div>
      </div>
    )
  }

  if (roomError && !joinRoomMutation.isPending) {
    const errorMessage = roomError.message || ''
    const isRoomNotFound = errorMessage.includes('404') || errorMessage.includes('not found')
    const canRetryJoin = errorMessage.includes('Not in this room') || errorMessage.includes('403')
    
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {isRoomNotFound ? 'Room Not Found' : 'Unable to Access Room'}
          </h2>
          <p className="text-gray-600 mb-4">
            {isRoomNotFound 
              ? 'This room may no longer exist or the code may be incorrect.'
              : canRetryJoin 
                ? 'Attempting to rejoin the room...'
                : errorMessage
            }
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