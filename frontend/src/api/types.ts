export interface GameRoom {
  room_id: string
  room_code: string
  config: Record<string, any>
  state: 'WAITING' | 'PLAYING' | 'FINISHED'
  host_session_id: string | null
  created_at: string | null
  last_activity: string | null
  game_started_at: string | null
  player_count: number
}

export interface Player {
  user_id: string
  nickname: string
  is_active: boolean
}

export interface CreateRoomRequest {
  config?: Record<string, any>
}

export interface CreateRoomResponse {
  room_code: string
  room_id: string
}

export interface JoinRoomResponse {
  success: boolean
  room: GameRoom
}

export interface RoomResponse {
  room: GameRoom
  players: Player[]
}

export interface ApiError {
  detail: string
}

export interface CreateSessionRequest {
  nickname: string
}

export interface SessionResponse {
  user_id: string
  nickname: string
  token: string
  expires_at: string
  created_at: string
}