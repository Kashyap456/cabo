import { useMutation } from "@tanstack/react-query"
import axios from "axios"

export const useCreateGame = () => {
  return useMutation({
    mutationFn: async (config: any) => {
      const response = await axios.post(`/rooms`, config)
      return response.data
    },
  })
}

export const useJoinGame = () => {
  return useMutation({
    mutationFn: async (roomCode: string) => {
      const response = await axios.post(`/rooms/${roomCode}/join`)
      return response.data
    },
  })
}