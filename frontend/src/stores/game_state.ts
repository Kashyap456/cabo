import { create } from 'zustand'
import { useAuthStore } from './auth'

export enum RoomPhase {
    WAITING = 'WAITING',
    PLAYING = 'PLAYING',
    ENDED = 'ENDED',
}

export interface Player {
    id: string
    nickname: string
    isHost: boolean
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  roomCode: '',
  setRoomCode: (roomCode) => set({ roomCode }),
  phase: RoomPhase.WAITING,
  setPhase: (phase) => set({ phase }),
  players: [],
  setPlayers: (players) => set({ players }),
  addPlayer: (player) => set((state) => ({ 
    players: [...state.players, player] 
  })),
  removePlayer: (playerId) => set((state) => ({ 
    players: state.players.filter(p => p.id !== playerId) 
  })),
  currentSeq: 0,
  setCurrentSeq: (seq) => set({ currentSeq: seq }),
  isReady: false,
  setIsReady: (ready) => set({ isReady: ready }),
}))

// Helper functions to compute derived state
export const useIsHost = () => {
  const players = useRoomStore(state => state.players)
  const nickname = useAuthStore(state => state.nickname)
  const currentPlayer = players.find(p => p.nickname === nickname)
  return currentPlayer?.isHost ?? false
}

export const useCurrentPlayer = () => {
  const players = useRoomStore(state => state.players)
  const nickname = useAuthStore(state => state.nickname)
  return players.find(p => p.nickname === nickname) ?? null
}

interface RoomStore {
  roomCode: string
  setRoomCode: (roomCode: string) => void
  phase: RoomPhase
  setPhase: (phase: RoomPhase) => void
  players: Player[]
  setPlayers: (players: Player[]) => void
  addPlayer: (player: Player) => void
  removePlayer: (playerId: string) => void
  currentSeq: number
  setCurrentSeq: (seq: number) => void
  isReady: boolean
  setIsReady: (ready: boolean) => void
}