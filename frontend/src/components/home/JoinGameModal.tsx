import { useJoinGame } from '@/api/rooms'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import ConflictModal from './ConflictModal'

interface JoinGameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const JoinGameModal = ({ open, onOpenChange }: JoinGameModalProps) => {
  const [roomCode, setRoomCode] = useState('')
  const { mutate: joinGame, isPending, conflictError, clearConflict } = useJoinGame()
  const showConflictModal = !!conflictError

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (roomCode.trim().length === 6) {
      joinGame({ roomCode: roomCode.toUpperCase(), force: false }, {
        onSuccess: () => {
          setRoomCode('')
          onOpenChange(false)
        },
        onError: (error) => {
          if (error.response?.status !== 409) {
            console.error('Failed to join game:', error)
          }
        },
      })
    }
  }

  const handleForceJoin = () => {
    if (roomCode.trim().length === 6) {
      joinGame({ roomCode: roomCode.toUpperCase(), force: true }, {
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
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content 
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-yellow-500/80 p-8 rounded-lg shadow-wood-deep w-96 overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
          }}
        >
          {/* Wood grain texture overlay */}
          <div className="absolute inset-0 opacity-40 pointer-events-none wood-texture" />
          
          <div className="relative">
            <Dialog.Title className="text-2xl font-black text-yellow-100 mb-4 text-center uppercase tracking-wider text-shadow-painted">
              Join Game
            </Dialog.Title>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="roomCode"
                  className="block text-sm font-bold text-wood-darker mb-1 uppercase tracking-wide"
                >
                  Room Code
                </label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                placeholder="ABC123"
                className="w-full px-3 py-2 bg-white border-3 border-wood-dark rounded text-wood-darker font-bold shadow-wood-inset focus:outline-none focus:border-yellow-500/80 focus:shadow-gold-glow text-center text-lg font-mono tracking-wider"
                autoFocus
                maxLength={6}
              />
                <p className="text-xs text-wood-medium mt-1 text-center">
                  Enter the 6-character room code
                </p>
            </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 px-4 py-2 border-4 border-wood-dark bg-wood-medium text-yellow-100 font-bold uppercase rounded shadow-wood-inset hover:bg-wood-dark hover:scale-105 hover:shadow-wood-raised active:scale-95 transition-all duration-200 text-shadow-dark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={roomCode.length !== 6 || isPending}
                  className="flex-1 px-4 py-2 border-4 border-yellow-500/80 text-yellow-100 font-black uppercase tracking-wider rounded shadow-wood-deep hover:shadow-button-hover hover:border-yellow-400 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-shadow-painted"
                  style={{
                    background: 'linear-gradient(180deg, #B45309 0%, #92400E 50%, #78350F 100%)',
                  }}
                >
                  {isPending ? 'Joining...' : 'Join Game'}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    
    <ConflictModal
      open={showConflictModal}
      onOpenChange={(open) => {
        if (!open) clearConflict()
      }}
      currentRoom={conflictError?.current_room || null}
      onForceAction={handleForceJoin}
      actionText="Join New Game"
    />
  </>
  )
}

export default JoinGameModal
