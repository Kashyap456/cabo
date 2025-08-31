import { useAuthStore } from "@/stores/auth"
import { useMutation } from "@tanstack/react-query"
import axios from "axios"
import Cookies from "js-cookie"

export const useCreateSession = () => {
  const { setSessionInfo } = useAuthStore()
  return useMutation({
    mutationFn: async (nickname: string) => {
      const response = await axios.post(`/sessions`, { nickname })
      return response.data
    },
    onSuccess: (data) => {
      Cookies.set('session_token', data.user_id)
      Cookies.set('nickname', data.nickname)
      setSessionInfo(data.nickname, data.user_id)
    },
  })
}

export const useUpdateNickname = () => {
  const { setSessionInfo, sessionId } = useAuthStore()
  return useMutation({
    mutationFn: async (nickname: string) => {
      const response = await axios.put(`/sessions/nickname`, { nickname })
      return response.data
    },
    onSuccess: (data) => {
      Cookies.set('nickname', data.nickname)
      setSessionInfo(data.nickname, sessionId!)
    },
  })
}

export default useCreateSession;