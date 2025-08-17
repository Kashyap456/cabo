import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useUiStore, useGameStore } from '../stores'
import { useJoinRoom, RoomConflictError } from '../api'
import { Modal } from './Modal'

export function JoinGameModal() {
  const navigate = useNavigate()
  const {
    activeModal,
    closeModal,
    setLoading,
    setError,
    openModal,
    setRoomConflictData,
  } = useUiStore()
  const { setIsHost } = useGameStore()
  const joinRoomMutation = useJoinRoom()

  const [roomCode, setRoomCode] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomCode.trim()) return

    setLoading(true)
    setError(null)

    try {
      await joinRoomMutation.mutateAsync(roomCode.toUpperCase())

      setIsHost(false)
      closeModal()

      navigate({ to: `/room/${roomCode.toUpperCase()}` })
    } catch (error: any) {
      console.error('Failed to join game:', error)

      // Check if this is a room conflict error
      if (error instanceof RoomConflictError) {
        // Show room conflict modal
        setRoomConflictData({
          currentRoom: error.currentRoom,
          requestedAction: 'join',
          requestedRoomCode: roomCode.toUpperCase(),
        })
        openModal('room-conflict')
        return
      }

      // Handle other errors
      setError(error instanceof Error ? error.message : 'Failed to join room')
    } finally {
      setLoading(false)
    }
  }

  const formatRoomCode = (value: string) => {
    // Remove any non-alphanumeric characters and convert to uppercase
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    // Limit to 6 characters
    return cleaned.slice(0, 6)
  }

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRoomCode(e.target.value)
    setRoomCode(formatted)
  }

  return (
    <Modal
      isOpen={activeModal === 'join-game'}
      onClose={closeModal}
      title="Join Game"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="roomCode"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Room Code
          </label>
          <input
            type="text"
            id="roomCode"
            value={roomCode}
            onChange={handleRoomCodeChange}
            placeholder="Enter 6-character room code"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono tracking-wider"
            autoFocus
            maxLength={6}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Ask the game host for the room code
          </p>
        </div>

        <div className="bg-blue-50 p-4 rounded-md">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1 md:flex md:justify-between">
              <p className="text-sm text-blue-700">
                Make sure you have the correct room code from your game host.
              </p>
            </div>
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <button
            type="button"
            onClick={closeModal}
            className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={roomCode.length !== 6}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Join Game
          </button>
        </div>
      </form>
    </Modal>
  )
}
