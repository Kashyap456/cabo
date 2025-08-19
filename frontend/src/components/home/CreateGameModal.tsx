import { useCreateGame } from '@/api/rooms'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

interface CreateGameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CreateGameModal = ({ open, onOpenChange }: CreateGameModalProps) => {
  const [config, setConfig] = useState({
    maxPlayers: 4,
    gameMode: 'classic',
  })
  const { mutate: createGame, isPending } = useCreateGame()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createGame(config, {
      onSuccess: () => {
        onOpenChange(false)
      },
      onError: (error) => {
        console.error('Failed to create game:', error)
      },
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg w-96">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Create Game
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="maxPlayers"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Max Players
              </label>
              <select
                id="maxPlayers"
                value={config.maxPlayers}
                onChange={(e) =>
                  setConfig({ ...config, maxPlayers: parseInt(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={2}>2 Players</option>
                <option value={3}>3 Players</option>
                <option value={4}>4 Players</option>
                <option value={6}>6 Players</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="gameMode"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Game Mode
              </label>
              <select
                id="gameMode"
                value={config.gameMode}
                onChange={(e) =>
                  setConfig({ ...config, gameMode: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="classic">Classic</option>
                <option value="blitz">Blitz</option>
              </select>
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
                disabled={isPending}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Creating...' : 'Create Game'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default CreateGameModal
