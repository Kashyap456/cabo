import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from '@tanstack/react-router'

interface ConflictModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRoom: {
    room_code: string
    room_id: string
  } | null
  onForceAction: () => void
  actionText: string
}

const ConflictModal = ({
  open,
  onOpenChange,
  currentRoom,
  onForceAction,
  actionText,
}: ConflictModalProps) => {
  const navigate = useNavigate()

  const handleGoToCurrentGame = () => {
    console.log('handleGoToCurrentGame', currentRoom)
    if (currentRoom?.room_code) {
      navigate({
        to: '/$roomCode',
        params: { roomCode: currentRoom.room_code },
      })
      onOpenChange(false)
    }
  }

  const handleForceAction = () => {
    onForceAction()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-4 border-yellow-500/80 p-8 rounded-lg shadow-wood-deep w-96 z-50 overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
          }}
        >
          {/* Wood grain texture overlay */}
          <div className="absolute inset-0 opacity-40 pointer-events-none wood-texture" />

          <div className="relative">
            <Dialog.Title className="text-2xl font-black text-yellow-100 mb-2 text-center uppercase tracking-wider text-shadow-painted">
              Already in a Game
            </Dialog.Title>
            <Dialog.Description className="text-wood-darker text-center mb-6 font-semibold">
              You're already in room{' '}
              <span className="font-mono font-black text-yellow-100 text-shadow-dark">
                {currentRoom?.room_code}
              </span>
              <br />
              What would you like to do?
            </Dialog.Description>

            <div className="space-y-3">
              <button
                onClick={handleGoToCurrentGame}
                className="w-full px-4 py-3 border-4 border-yellow-500/80 text-yellow-100 font-black uppercase tracking-wider rounded shadow-wood-deep hover:shadow-button-hover hover:border-yellow-400 hover:scale-105 active:scale-95 transition-all duration-200 text-shadow-painted"
                style={{
                  background:
                    'linear-gradient(180deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)',
                }}
              >
                Go to Current Game
              </button>

              <button
                onClick={handleForceAction}
                className="w-full px-4 py-3 border-4 border-yellow-500/80 text-yellow-100 font-black uppercase tracking-wider rounded shadow-wood-deep hover:shadow-button-hover hover:border-yellow-400 hover:scale-105 active:scale-95 transition-all duration-200 text-shadow-painted"
                style={{
                  background:
                    'linear-gradient(180deg, #EA580C 0%, #C2410C 50%, #9A3412 100%)',
                }}
              >
                Leave and {actionText}
              </button>

              <button
                onClick={() => onOpenChange(false)}
                className="w-full px-4 py-2 border-4 border-wood-dark bg-wood-medium text-yellow-100 font-bold uppercase rounded shadow-wood-inset hover:bg-wood-dark hover:scale-105 hover:shadow-wood-raised active:scale-95 transition-all duration-200 text-shadow-dark"
              >
                Cancel
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default ConflictModal
