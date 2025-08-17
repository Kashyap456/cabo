import { create } from 'zustand'

interface UserState {
  nickname: string | null
  userId: string | null
  isSessionValid: boolean
  setUserData: (nickname: string, userId: string) => void
  clearUserData: () => void
  hasValidSession: () => boolean
  setSessionValid: (valid: boolean) => void
}

export const useUserStore = create<UserState>()((set, get) => ({
  nickname: null,
  userId: null,
  isSessionValid: false,
  
  setUserData: (nickname: string, userId: string) => {
    set({ nickname, userId, isSessionValid: true })
  },
  
  clearUserData: () => {
    set({ nickname: null, userId: null, isSessionValid: false })
  },
  
  hasValidSession: () => {
    const state = get()
    return state.isSessionValid && !!state.nickname
  },
  
  setSessionValid: (valid: boolean) => {
    set({ isSessionValid: valid })
  },
}))