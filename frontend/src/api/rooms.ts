import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import axios from "axios"

export const useCreateGame = () => {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (config: any) => {
      const response = await axios.post(`/rooms`, config)
      return response.data
    },
    onSuccess: (data) => {
      navigate({ to: '/$roomCode', params: { roomCode: data.room_code } })
    }
  })
}

export const useJoinGame = () => {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (roomCode: string) => {
      const response = await axios.post(`/rooms/${roomCode}/join`)
      return response.data
    },
    onSuccess: (data) => {
      navigate({ to: '/$roomCode', params: { roomCode: data.room.room_code } })
    }
  })
}

export const useStartGame = () => {
  return useMutation({
    mutationFn: async (roomCode: string) => {
      const response = await axios.post(`/rooms/${roomCode}/start`)
      return response.data
    },
    onSuccess: (data) => {
      console.log('Game started successfully:', data)
    }
  })
}