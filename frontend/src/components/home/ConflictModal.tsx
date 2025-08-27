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
  actionText 
}: ConflictModalProps) => {
  const navigate = useNavigate()

  const handleGoToCurrentGame = () => {
    if (currentRoom?.room_code) {
      navigate({ to: '/$roomCode', params: { roomCode: currentRoom.room_code } })
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg w-96 z-50">
          <Dialog.Title className="text-lg font-semibold mb-2">
            Already in a Game
          </Dialog.Title>
          <Dialog.Description className="text-gray-600 mb-6">
            You're already in game room <span className="font-mono font-bold">{currentRoom?.room_code}</span>. 
            What would you like to do?
          </Dialog.Description>
          
          <div className="space-y-3">
            <button
              onClick={handleGoToCurrentGame}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              Go to Current Game
            </button>
            
            <button
              onClick={handleForceAction}
              className="w-full px-4 py-3 bg-orange-500 text-white rounded hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
            >
              Leave and {actionText}
            </button>
            
            <button
              onClick={() => onOpenChange(false)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default ConflictModal