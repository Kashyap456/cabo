import { createFileRoute } from '@tanstack/react-router'
import { useUiStore } from '../stores'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const { openModal } = useUiStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex flex-col items-center justify-center text-white p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
          CABO
        </h1>
        <p className="text-xl mb-8 text-gray-300">
          The ultimate card game of memory, strategy, and luck
        </p>
        
        <div className="space-y-4">
          <button
            onClick={() => openModal('create-game')}
            className="w-full max-w-xs bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Create Game
          </button>
          
          <button
            onClick={() => openModal('join-game')}
            className="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Join Game
          </button>
        </div>
        
        <div className="mt-12 text-sm text-gray-400">
          <p>Ready to test your memory and outwit your friends?</p>
        </div>
      </div>
    </div>
  )
}
