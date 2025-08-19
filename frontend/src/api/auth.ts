import { useAuthStore } from "@/stores/auth"
import { useMutation } from "@tanstack/react-query"
import axios from "axios"
import Cookies from "js-cookie"

const useCreateSession = () => {
  const { setNickname } = useAuthStore()
  return useMutation({
    mutationFn: async (nickname: string) => {
      const response = await axios.post(`/sessions`, { nickname })
      return response.data
    },
    onSuccess: (data) => {
      Cookies.set('session_token', data.user_id)
      Cookies.set('nickname', data.nickname)
      setNickname(data.nickname)
    },
  })
}

export default useCreateSession;