import useCreateSession from '@/api/auth'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'

interface NicknameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NicknameModal = ({ open, onOpenChange }: NicknameModalProps) => {
  const [nickname, setNickname] = useState('')
  const { mutate: createSession } = useCreateSession()
  const currentNickname = useAuthStore((state) => state.nickname)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nickname.trim()) {
      createSession(nickname.trim())
      setNickname('')
      onOpenChange(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-yellow-500/80 p-8 rounded-lg shadow-wood-deep w-96 overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
          }}
        >
          {/* Wood grain texture overlay */}
          <div className="absolute inset-0 opacity-40 pointer-events-none wood-texture" />

          <div className="relative">
            <Dialog.Title className="text-2xl font-black text-yellow-100 mb-2 text-center uppercase tracking-wider text-shadow-painted">
              {currentNickname ? 'Change Nickname' : 'Enter Nickname'}
            </Dialog.Title>

            {currentNickname && (
              <p className="text-center mb-4 font-bold text-yellow-100 text-shadow-dark">
                Current: {currentNickname}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={currentNickname ? 'New nickname' : 'Your nickname'}
                className="px-4 py-3 bg-white border-3 border-wood-dark rounded text-wood-darker placeholder-wood-medium/60 focus:outline-none focus:border-yellow-500/80 focus:shadow-gold-glow font-semibold shadow-wood-inset"
                autoFocus
              />
              <button
                type="submit"
                className="px-6 py-3 border-4 border-yellow-500/80 text-yellow-100 font-black uppercase tracking-wider rounded shadow-wood-deep hover:shadow-button-hover hover:border-yellow-400 hover:scale-105 active:scale-95 transition-all duration-200 text-shadow-painted"
                style={{
                  background:
                    'linear-gradient(180deg, #B45309 0%, #92400E 50%, #78350F 100%)',
                }}
              >
                {currentNickname ? 'Change' : 'Submit'}
              </button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default NicknameModal
