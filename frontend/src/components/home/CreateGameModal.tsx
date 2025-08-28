import { useCreateGame } from '@/api/rooms'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import ConflictModal from './ConflictModal'

interface CreateGameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CreateGameModal = ({ open, onOpenChange }: CreateGameModalProps) => {
  const [config, setConfig] = useState({
    maxPlayers: 4,
  })
  const { mutate: createGame, isPending, conflictError, clearConflict } = useCreateGame()
  const showConflictModal = !!conflictError

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createGame({ config, force: false }, {
      onSuccess: () => {
        onOpenChange(false)
      },
      onError: (error) => {
        if (error.response?.status !== 409) {
          console.error('Failed to create game:', error)
        }
      },
    })
  }

  const handleForceCreate = () => {
    createGame({ config, force: true }, {
      onSuccess: () => {
        onOpenChange(false)
      },
      onError: (error) => {
        console.error('Failed to create game:', error)
      },
    })
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
                Create Game
              </Dialog.Title>
              <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="maxPlayers"
                  className="block text-sm font-bold text-wood-darker mb-1 uppercase tracking-wide"
                >
                  Max Players
                </label>
                <select
                  id="maxPlayers"
                  value={config.maxPlayers}
                  onChange={(e) =>
                    setConfig({ ...config, maxPlayers: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gold-light border-3 border-wood-dark rounded text-gold-border font-bold shadow-wood-inset focus:outline-none focus:border-yellow-500/80 focus:shadow-gold-glow cursor-pointer hover:bg-yellow-100 transition-colors appearance-none"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B8860B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    backgroundSize: '1.5em 1.5em',
                    paddingRight: '2.5rem',
                  }}
                >
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                  <option value={6}>6 Players</option>
                </select>
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
                  disabled={isPending}
                  className="flex-1 px-4 py-2 border-4 border-yellow-500/80 text-yellow-100 font-black uppercase tracking-wider rounded shadow-wood-deep hover:shadow-button-hover hover:border-yellow-400 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-shadow-painted"
                  style={{
                    background: 'linear-gradient(180deg, #B45309 0%, #92400E 50%, #78350F 100%)',
                  }}
                >
                  {isPending ? 'Creating...' : 'Create Game'}
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
      onForceAction={handleForceCreate}
      actionText="Create New Game"
    />
  </>
  )
}

export default CreateGameModal
