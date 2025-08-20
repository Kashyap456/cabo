import { create } from 'zustand'
import Cookies from 'js-cookie'

interface AuthStore {
  nickname: string
  sessionId: string | null
  setNickname: (nickname: string) => void
  setSessionId: (sessionId: string | null) => void
  setSessionInfo: (nickname: string, sessionId: string) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  nickname: Cookies.get('nickname') || '',
  sessionId: Cookies.get('session_token') || null,
  setNickname: (nickname) => set({ nickname }),
  setSessionId: (sessionId) => set({ sessionId }),
  setSessionInfo: (nickname, sessionId) => set({ nickname, sessionId }),
}))