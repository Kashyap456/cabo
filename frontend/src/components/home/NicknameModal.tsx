import useCreateSession from '@/api/auth'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'

interface NicknameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const NicknameModal = ({ open, onOpenChange }: NicknameModalProps) => {
  const [nickname, setNickname] = useState('')
  const { mutate: createSession } = useCreateSession()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (nickname.trim()) {
      createSession(nickname.trim())
      setNickname('')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg shadow-lg w-96">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Enter your nickname
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Submit
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default NicknameModal
