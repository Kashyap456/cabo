import type { GameRoom } from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class RoomConflictError extends Error {
  constructor(message: string, public currentRoom: GameRoom) {
    super(message)
    this.name = 'RoomConflictError'
  }
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies for session management
      ...options,
    }

    const response = await fetch(url, config)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
      
      // Debug logging for 409 responses
      if (response.status === 409) {
        console.log('🔍 409 Response Debug:', {
          status: response.status,
          errorData,
          hasDetail: !!errorData.detail,
          detailType: errorData.detail?.error_type,
          hasCurrentRoom: !!errorData.detail?.current_room
        })
      }
      
      // Handle 409 Conflict (already in room) specifically
      if (response.status === 409 && errorData.detail?.error_type === 'already_in_room') {
        console.log('✅ Creating RoomConflictError with:', errorData.detail)
        throw new RoomConflictError(errorData.detail.message, errorData.detail.current_room)
      }
      
      throw new Error(errorData.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async patch<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    })
  }
}

export const apiClient = new ApiClient()