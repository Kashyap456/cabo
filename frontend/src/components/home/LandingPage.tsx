import NicknameModal from './NicknameModal'
import CreateGameModal from './CreateGameModal'
import JoinGameModal from './JoinGameModal'
import { useAuthStore } from '@/stores/auth'
import { useState } from 'react'
import CaboLogo from '@/assets/cabo-logo.png'
import CaboBackground from '@/assets/cabo-background.png'
import WoodButton from '@/components/ui/WoodButton'
import { Pencil } from 'lucide-react'

const LandingPage = () => {
  const { nickname } = useAuthStore()
  const [createGameOpen, setCreateGameOpen] = useState(false)
  const [joinGameOpen, setJoinGameOpen] = useState(false)
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)

  return (
    <div
      className="bg-cover bg-center h-screen"
      style={{ backgroundImage: `url(${CaboBackground})` }}
    >
      <NicknameModal
        open={!nickname || nicknameModalOpen}
        onOpenChange={setNicknameModalOpen}
      />
      <CreateGameModal open={createGameOpen} onOpenChange={setCreateGameOpen} />
      <JoinGameModal open={joinGameOpen} onOpenChange={setJoinGameOpen} />

      {nickname && (
        <div className="fixed top-4 left-4 bg-amber-100 border-4 border-amber-900 rounded-lg p-3 shadow-lg z-50">
          <div className="flex items-center gap-2">
            <span className="text-amber-900 text-sm">Playing as:</span>
            <span className="text-amber-900 font-bold text-lg">{nickname}</span>
            <button
              onClick={() => setNicknameModalOpen(true)}
              className="text-amber-700 hover:text-amber-900 transition-colors cursor-pointer"
            >
              <Pencil size={18} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <img src={CaboLogo} alt="Cabo" className="h-96 mb-8" />
        <div className="flex flex-col gap-4 w-96">
          <WoodButton
            onClick={() => setCreateGameOpen(true)}
            variant="large"
            className="w-full"
          >
            Create Game
          </WoodButton>
          <WoodButton
            onClick={() => setJoinGameOpen(true)}
            variant="large"
            className="w-full"
          >
            Join Game
          </WoodButton>
          <WoodButton
            onClick={() => window.open('https://cambiocardgame.com/', '_blank')}
            variant="default"
            className="w-full"
          >
            How to Play
          </WoodButton>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
