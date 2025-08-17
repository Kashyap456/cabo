import { create } from 'zustand'
import type { GameRoom } from '../api/types'

export type ModalType = 'none' | 'create-game' | 'join-game' | 'nickname-prompt' | 'room-conflict'

export interface RoomConflictData {
  currentRoom: GameRoom
  requestedAction: 'create' | 'join'
  requestedRoomCode?: string
  requestedConfig?: any
}

interface UiState {
  activeModal: ModalType
  isLoading: boolean
  error: string | null
  roomConflictData: RoomConflictData | null
  
  openModal: (modal: ModalType) => void
  closeModal: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  setRoomConflictData: (data: RoomConflictData | null) => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeModal: 'none',
  isLoading: false,
  error: null,
  roomConflictData: null,
  
  openModal: (modal: ModalType) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: 'none', roomConflictData: null }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
  setRoomConflictData: (data: RoomConflictData | null) => set({ roomConflictData: data }),
}))