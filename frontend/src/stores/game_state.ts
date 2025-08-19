import { create } from 'zustand'

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
  isHost: false,
  setIsHost: (isHost) => set({ isHost }),
  currentSeq: 0,
  setCurrentSeq: (seq) => set({ currentSeq: seq }),
  isReady: false,
  setIsReady: (ready) => set({ isReady: ready }),
}))

interface RoomStore {
  roomCode: string
  setRoomCode: (roomCode: string) => void
  phase: RoomPhase
  setPhase: (phase: RoomPhase) => void
  players: Player[]
  setPlayers: (players: Player[]) => void
  addPlayer: (player: Player) => void
  removePlayer: (playerId: string) => void
  isHost: boolean
  setIsHost: (isHost: boolean) => void
  currentSeq: number
  setCurrentSeq: (seq: number) => void
  isReady: boolean
  setIsReady: (ready: boolean) => void
}