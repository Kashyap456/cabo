import type { ReactNode } from 'react'
import { useUiStore } from '../stores'
import { NicknameModal } from './NicknameModal'
import { CreateGameModal } from './CreateGameModal'
import { JoinGameModal } from './JoinGameModal'
import { RoomConflictModal } from './RoomConflictModal'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg p-6 w-full ${maxWidth} mx-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ModalManager() {
  const { activeModal } = useUiStore()
  
  return (
    <>
      {activeModal === 'nickname-prompt' && <NicknameModal />}
      {activeModal === 'create-game' && <CreateGameModal />}
      {activeModal === 'join-game' && <JoinGameModal />}
      {activeModal === 'room-conflict' && <RoomConflictModal />}
    </>
  )
}