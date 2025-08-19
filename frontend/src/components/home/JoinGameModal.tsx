import { useJoinGame } from '@/api/rooms'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

interface JoinGameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const JoinGameModal = ({ open, onOpenChange }: JoinGameModalProps) => {
  const [roomCode, setRoomCode] = useState('')
  const { mutate: joinGame, isPending } = useJoinGame()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (roomCode.trim().length === 6) {
      joinGame(roomCode.toUpperCase(), {
        onSuccess: () => {
          setRoomCode('')
          onOpenChange(false)
        },
        onError: (error) => {
          console.error('Failed to join game:', error)
        },
      })
    }
  }

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6)
    setRoomCode(value)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg w-96">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Join Game
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="roomCode"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                placeholder="ABC123"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg font-mono tracking-wider"
                autoFocus
                maxLength={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the 6-character room code
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={roomCode.length !== 6 || isPending}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Joining...' : 'Join Game'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default JoinGameModal
