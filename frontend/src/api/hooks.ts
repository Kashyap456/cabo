import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { 
  CreateRoomRequest, 
  CreateRoomResponse, 
  JoinRoomResponse, 
  RoomResponse,
  CreateSessionRequest,
  SessionResponse
} from './types'

export const useCreateRoom = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (request: CreateRoomRequest): Promise<CreateRoomResponse> => {
      return apiClient.post('/api/rooms/create', request)
    },
    onSuccess: () => {
      // Invalidate room queries to refresh any cached data
      queryClient.invalidateQueries({ queryKey: ['room'] })
    },
  })
}

export const useJoinRoom = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (roomCode: string): Promise<JoinRoomResponse> => {
      return apiClient.post(`/api/rooms/${roomCode}/join`)
    },
    onSuccess: (data, roomCode) => {
      // Cache the room data
      queryClient.setQueryData(['room', roomCode], data.room)
      queryClient.invalidateQueries({ queryKey: ['room'] })
    },
  })
}

export const useRoom = (roomCode: string | null) => {
  return useQuery({
    queryKey: ['room', roomCode],
    queryFn: async (): Promise<RoomResponse> => {
      if (!roomCode) throw new Error('Room code is required')
      return apiClient.get(`/api/rooms/${roomCode}`)
    },
    enabled: !!roomCode,
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 1000, // Consider data stale after 1 second
  })
}

export const useStartGame = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (roomCode: string) => {
      return apiClient.post(`/api/rooms/${roomCode}/start`)
    },
    onSuccess: (_, roomCode) => {
      // Invalidate room data to get updated game state
      queryClient.invalidateQueries({ queryKey: ['room', roomCode] })
    },
  })
}

export const useLeaveRoom = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (roomCode: string) => {
      return apiClient.post(`/api/rooms/${roomCode}/leave`)
    },
    onSuccess: () => {
      // Clear all room-related queries
      queryClient.invalidateQueries({ queryKey: ['room'] })
    },
  })
}

export const useUpdateRoomConfig = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ roomCode, config }: { roomCode: string; config: Record<string, any> }) => {
      return apiClient.patch(`/api/rooms/${roomCode}/config`, { config })
    },
    onSuccess: (_, { roomCode }) => {
      // Invalidate room data to get updated config
      queryClient.invalidateQueries({ queryKey: ['room', roomCode] })
    },
  })
}

// Session hooks
export const useCreateSession = () => {
  return useMutation({
    mutationFn: async (request: CreateSessionRequest): Promise<SessionResponse> => {
      return apiClient.post('/sessions/', request)
    },
  })
}

export const useValidateSession = () => {
  return useQuery({
    queryKey: ['session'],
    queryFn: async (): Promise<SessionResponse> => {
      return apiClient.get('/sessions/validate')
    },
    retry: false, // Don't retry on 401
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}