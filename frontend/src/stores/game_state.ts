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

export const useRoomStore = create<RoomStore>((set) => ({
  roomCode: '',
  setRoomCode: (roomCode) => set({ roomCode }),
  phase: RoomPhase.WAITING,
  setPhase: (phase) => set({ phase }),
  players: [],
  setPlayers: (players) => set({ players }),
  isHost: false,
  setIsHost: (isHost) => set({ isHost }),
}))

interface RoomStore {
  roomCode: string
  setRoomCode: (roomCode: string) => void
  phase: RoomPhase
  setPhase: (phase: RoomPhase) => void
  players: Player[]
  setPlayers: (players: Player[]) => void
  isHost: boolean
  setIsHost: (isHost: boolean) => void
}