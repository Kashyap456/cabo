import NicknameModal from './NicknameModal'
import CreateGameModal from './CreateGameModal'
import JoinGameModal from './JoinGameModal'
import { useAuthStore } from '@/stores/auth'
import { useState } from 'react'
import CaboLogo from '@/assets/cabo-logo.png'
import WoodButton from '@/components/ui/WoodButton'

const LandingPage = () => {
  const { nickname } = useAuthStore()
  const [createGameOpen, setCreateGameOpen] = useState(false)
  const [joinGameOpen, setJoinGameOpen] = useState(false)
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)

  return (
    <div className="bg-[url('src/assets/cabo-background.png')] bg-cover bg-center h-screen">
      <NicknameModal
        open={!nickname || nicknameModalOpen}
        onOpenChange={setNicknameModalOpen}
      />
      <CreateGameModal open={createGameOpen} onOpenChange={setCreateGameOpen} />
      <JoinGameModal open={joinGameOpen} onOpenChange={setJoinGameOpen} />

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
            onClick={() => setNicknameModalOpen(true)}
            variant="default"
            className="w-full"
          >
            Change Nickname
          </WoodButton>
        </div>
      </div>
    </div>
  )
}

export default LandingPage
