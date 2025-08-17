import { create } from 'zustand'

export type ModalType = 'none' | 'create-game' | 'join-game' | 'nickname-prompt'

interface UiState {
  activeModal: ModalType
  isLoading: boolean
  error: string | null
  
  openModal: (modal: ModalType) => void
  closeModal: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeModal: 'none',
  isLoading: false,
  error: null,
  
  openModal: (modal: ModalType) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: 'none' }),
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}))