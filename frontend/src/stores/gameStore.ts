import { create } from 'zustand'

export type GameState = 'WAITING' | 'PLAYING' | 'FINISHED'

export interface GameConfig {
  maxPlayers: number
  gameMode: 'classic' | 'advanced'
}

interface GameStoreState {
  currentRoomId: string | null
  gameState: GameState
  gameConfig: GameConfig | null
  players: string[]
  isHost: boolean
  
  setCurrentRoom: (roomId: string) => void
  setGameState: (state: GameState) => void
  setGameConfig: (config: GameConfig) => void
  setPlayers: (players: string[]) => void
  setIsHost: (isHost: boolean) => void
  clearGame: () => void
}

export const useGameStore = create<GameStoreState>()((set) => ({
  currentRoomId: null,
  gameState: 'WAITING',
  gameConfig: null,
  players: [],
  isHost: false,
  
  setCurrentRoom: (roomId: string) => set({ currentRoomId: roomId }),
  setGameState: (state: GameState) => set({ gameState: state }),
  setGameConfig: (config: GameConfig) => set({ gameConfig: config }),
  setPlayers: (players: string[]) => set({ players }),
  setIsHost: (isHost: boolean) => set({ isHost }),
  
  clearGame: () => set({
    currentRoomId: null,
    gameState: 'WAITING',
    gameConfig: null,
    players: [],
    isHost: false,
  }),
}))