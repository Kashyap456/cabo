import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useUiStore, useGameStore, type GameConfig } from '../stores'
import { useCreateRoom } from '../api'
import { Modal } from './Modal'

export function CreateGameModal() {
  const navigate = useNavigate()
  const { activeModal, closeModal, setLoading, setError } = useUiStore()
  const { setGameConfig, setIsHost } = useGameStore()
  const createRoomMutation = useCreateRoom()
  
  const [config, setConfig] = useState<GameConfig>({
    maxPlayers: 4,
    gameMode: 'classic'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const result = await createRoomMutation.mutateAsync({
        config: {
          maxPlayers: config.maxPlayers,
          gameMode: config.gameMode
        }
      })
      
      setGameConfig(config)
      setIsHost(true)
      closeModal()
      
      navigate({ to: `/room/${result.room_code}` })
    } catch (error) {
      console.error('Failed to create game:', error)
      setError(error instanceof Error ? error.message : 'Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={activeModal === 'create-game'}
      onClose={closeModal}
      title="Create New Game"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="maxPlayers" className="block text-sm font-medium text-gray-700 mb-1">
            Maximum Players
          </label>
          <select
            id="maxPlayers"
            value={config.maxPlayers}
            onChange={(e) => setConfig({ ...config, maxPlayers: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={2}>2 Players</option>
            <option value={3}>3 Players</option>
            <option value={4}>4 Players</option>
            <option value={5}>5 Players</option>
            <option value={6}>6 Players</option>
          </select>
        </div>

        <div>
          <label htmlFor="gameMode" className="block text-sm font-medium text-gray-700 mb-1">
            Game Mode
          </label>
          <select
            id="gameMode"
            value={config.gameMode}
            onChange={(e) => setConfig({ ...config, gameMode: e.target.value as 'classic' | 'advanced' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="classic">Classic Cabo</option>
            <option value="advanced">Advanced Mode (with special cards)</option>
          </select>
        </div>

        <div className="bg-gray-50 p-4 rounded-md">
          <h4 className="font-medium text-gray-800 mb-2">Game Rules Preview:</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Goal: Get the lowest total card value</li>
            <li>• Remember your cards and swap strategically</li>
            {config.gameMode === 'advanced' && (
              <li>• Special cards included: Peek, Spy, Swap</li>
            )}
          </ul>
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
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Create Game
          </button>
        </div>
      </form>
    </Modal>
  )
}