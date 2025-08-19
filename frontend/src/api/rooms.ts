import { RoomPhase, useRoomStore } from "@/stores/game_state"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import Cookies from "js-cookie"
import axios from "axios"

export const useCreateGame = () => {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async (config: any) => {
      const response = await axios.post(`/rooms`, config)
      return response.data
    },
    onSuccess: (data) => {
      useRoomStore.setState({
        roomCode: data.room_code,
        phase: RoomPhase.WAITING,
        players: [{
          id: data.host_session_id,
          nickname: Cookies.get('nickname'),
          isHost: true,
        }],
        isHost: true,
      })
      console.log(useRoomStore.getState())
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
      useRoomStore.setState({
        roomCode: data.room.room_code,
        phase: data.room.phase,
        players: data.room.players,
        isHost: data.room.host_session_id === Cookies.get('session_token'),
      })
      console.log(useRoomStore.getState())
      navigate({ to: '/$roomCode', params: { roomCode: data.room.room_code } })
    }
  })
}