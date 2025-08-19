import { create } from 'zustand'
import Cookies from 'js-cookie'

interface AuthStore {
  nickname: string
  setNickname: (nickname: string) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  nickname: Cookies.get('nickname') || '',
  setNickname: (nickname) => set({ nickname }),
}))