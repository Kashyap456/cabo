import { useNavigate } from '@tanstack/react-router'
import { useUiStore, useGameStore } from '../stores'
import { useCreateRoom, useJoinRoom, useLeaveRoom } from '../api'
import { Modal } from './Modal'

export function RoomConflictModal() {
  const navigate = useNavigate()
  const { activeModal, closeModal, roomConflictData, setLoading, setError } = useUiStore()
  const { setGameConfig, setIsHost } = useGameStore()
  const createRoomMutation = useCreateRoom()
  const joinRoomMutation = useJoinRoom()
  const leaveRoomMutation = useLeaveRoom()

  if (!roomConflictData) return null

  const { currentRoom, requestedAction, requestedRoomCode, requestedConfig } = roomConflictData

  const handleGoToCurrentRoom = () => {
    closeModal()
    navigate({ to: `/room/${currentRoom.room_code}` })
  }

  const handleLeaveAndProceed = async () => {
    setLoading(true)
    setError(null)

    try {
      // Leave the current room first
      await leaveRoomMutation.mutateAsync(currentRoom.room_code)

      // Now proceed with the requested action
      if (requestedAction === 'create' && requestedConfig) {
        const result = await createRoomMutation.mutateAsync({
          config: requestedConfig
        })
        
        setGameConfig(requestedConfig)
        setIsHost(true)
        closeModal()
        navigate({ to: `/room/${result.room_code}` })
      } else if (requestedAction === 'join' && requestedRoomCode) {
        await joinRoomMutation.mutateAsync(requestedRoomCode)
        
        setIsHost(false)
        closeModal()
        navigate({ to: `/room/${requestedRoomCode}` })
      }
    } catch (error) {
      console.error('Failed to leave room and proceed:', error)
      setError(error instanceof Error ? error.message : 'Failed to proceed with action')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={activeModal === 'room-conflict'}
      onClose={closeModal}
      title="Already in a Room"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                You're already in a room
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  You're currently in room <strong>{currentRoom.room_code}</strong>. 
                  You can only be in one room at a time.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-md p-4">
          <h4 className="font-medium text-gray-800 mb-2">Current Room Details:</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>Room Code:</span>
              <span className="font-mono font-bold">{currentRoom.room_code}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="capitalize">{currentRoom.state.toLowerCase()}</span>
            </div>
            <div className="flex justify-between">
              <span>Players:</span>
              <span>{currentRoom.player_count}</span>
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          <p>What would you like to do?</p>
        </div>

        <div className="flex flex-col space-y-3">
          <button
            onClick={handleGoToCurrentRoom}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Go to Current Room ({currentRoom.room_code})
          </button>
          
          <button
            onClick={handleLeaveAndProceed}
            disabled={leaveRoomMutation.isPending || createRoomMutation.isPending || joinRoomMutation.isPending}
            className="w-full bg-orange-600 text-white py-3 px-4 rounded-md hover:bg-orange-700 disabled:bg-gray-400 transition-colors font-medium"
          >
            {leaveRoomMutation.isPending ? 'Leaving...' : 
             `Leave Current Room & ${requestedAction === 'create' ? 'Create New Game' : `Join ${requestedRoomCode}`}`}
          </button>
          
          <button
            onClick={closeModal}
            className="w-full bg-gray-300 text-gray-700 py-3 px-4 rounded-md hover:bg-gray-400 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}