import NicknameModal from './NicknameModal'
import CreateGameModal from './CreateGameModal'
import JoinGameModal from './JoinGameModal'
import { useAuthStore } from '@/stores/auth'
import { useState } from 'react'
import CaboLogo from '@/assets/cabo-logo.png'

const LandingPage = () => {
  const { nickname } = useAuthStore()
  const [createGameOpen, setCreateGameOpen] = useState(false)
  const [joinGameOpen, setJoinGameOpen] = useState(false)

  return (
    <div className="bg-[url('src/assets/cabo-background.png')] bg-cover bg-center h-screen">
      <NicknameModal open={!nickname} onOpenChange={() => {}} />
      <CreateGameModal open={createGameOpen} onOpenChange={setCreateGameOpen} />
      <JoinGameModal open={joinGameOpen} onOpenChange={setJoinGameOpen} />

      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <img src={CaboLogo} alt="Cabo" className="h-96 mb-8" />
        <div className="flex gap-4">
          <button
            onClick={() => setCreateGameOpen(true)}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
          >
            Create Game
          </button>
          <button
            onClick={() => setJoinGameOpen(true)}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
          >
            Join Game
          </button>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
