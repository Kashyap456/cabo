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
  sessionId: Cookies.get('session_id') || null,
  setNickname: (nickname) => {
    Cookies.set('nickname', nickname)
    set({ nickname })
  },
  setSessionId: (sessionId) => {
    if (sessionId) {
      Cookies.set('session_id', sessionId)
    } else {
      Cookies.remove('session_id')
    }
    set({ sessionId })
  },
  setSessionInfo: (nickname, sessionId) => {
    Cookies.set('nickname', nickname)
    Cookies.set('session_id', sessionId)
    set({ nickname, sessionId })
  },
}))