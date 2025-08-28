import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import axios from "axios"
import { useState } from "react"

export interface ConflictError {
  error_type: string
  message: string
  current_room: {
    room_code: string
    room_id: string
  }
}

export const useCreateGame = () => {
  const navigate = useNavigate()
  const [conflictError, setConflictError] = useState<ConflictError | null>(null)
  
  const mutation = useMutation({
    mutationFn: async ({ config, force = false }: { config: any, force?: boolean }) => {
      const response = await axios.post(`/rooms`, { ...config, force })
      return response.data
    },
    onSuccess: (data) => {
      setConflictError(null)
      navigate({ to: '/$roomCode', params: { roomCode: data.room_code } })
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        // Backend returns error data under 'detail' property
        setConflictError(error.response.data.detail || error.response.data)
      }
    }
  })
  
  return { ...mutation, conflictError, clearConflict: () => setConflictError(null) }
}

export const useJoinGame = () => {
  const navigate = useNavigate()
  const [conflictError, setConflictError] = useState<ConflictError | null>(null)
  
  const mutation = useMutation({
    mutationFn: async ({ roomCode, force = false }: { roomCode: string, force?: boolean }) => {
      const response = await axios.post(`/rooms/${roomCode}/join`, null, {
        params: { force }
      })
      return response.data
    },
    onSuccess: (data) => {
      setConflictError(null)
      navigate({ to: '/$roomCode', params: { roomCode: data.room.room_code } })
    },
    onError: (error: any) => {
      if (error.response?.status === 409) {
        // Backend returns error data under 'detail' property
        setConflictError(error.response.data.detail || error.response.data)
      }
    }
  })
  
  return { ...mutation, conflictError, clearConflict: () => setConflictError(null) }
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