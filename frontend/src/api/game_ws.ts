import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useCallback, useEffect } from 'react'
import Cookies from 'js-cookie'
import { useRoomStore, type Player } from '@/stores/game_state'

export interface WebSocketMessage {
  type: string
  [key: string]: any
}

export interface PlayerJoinedMessage extends WebSocketMessage {
  type: 'player_joined'
  player: {
    id: string
    nickname: string
    isHost: boolean
  }
}

export interface PlayerLeftMessage extends WebSocketMessage {
  type: 'player_left'
  session_id: string
}

export interface ConnectedMessage extends WebSocketMessage {
  type: 'connected'
  session_id: string
  nickname: string
}

export interface GameMessage extends WebSocketMessage {
  type: 'game_message'
  from: string
  data: any
}

export const useGameWebSocket = () => {
  const { addPlayer, removePlayer } = useRoomStore()
  const socketUrl = 'ws://localhost:8000/ws'

  const {
    sendMessage,
    lastMessage,
    readyState,
    getWebSocket
  } = useWebSocket(socketUrl, {
    shouldReconnect: (closeEvent) => {
      // Reconnect unless it was a manual close or auth failure
      console.log('WebSocket closed:', closeEvent.code, closeEvent.reason)
      return closeEvent.code !== 1000 && closeEvent.code !== 4001
    },
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    onOpen: () => console.log('WebSocket connected'),
    onClose: (event) => console.log('WebSocket disconnected:', event.code, event.reason),
    onError: (event) => console.error('WebSocket error:', event),
  })

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const message: WebSocketMessage = JSON.parse(lastMessage.data)
        handleMessage(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }
  }, [lastMessage])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('Received WebSocket message:', message)
    
    switch (message.type) {
      case 'connected': {
        const connectedMessage = message as ConnectedMessage
        console.log(`Connected as ${connectedMessage.nickname}`)
        break
      }
      
      case 'player_joined': {
        const joinedMessage = message as PlayerJoinedMessage
        console.log(`Player ${joinedMessage.player.nickname} joined the room`)
        const newPlayer: Player = {
          id: joinedMessage.player.id,
          nickname: joinedMessage.player.nickname,
          isHost: joinedMessage.player.isHost
        }
        addPlayer(newPlayer)
        break
      }
      
      case 'player_left': {
        const leftMessage = message as PlayerLeftMessage
        console.log(`Player ${leftMessage.session_id} left the room`)
        removePlayer(leftMessage.session_id)
        break
      }
      
      case 'game_message': {
        const gameMessage = message as GameMessage
        console.log('Game message from', gameMessage.from, ':', gameMessage.data)
        break
      }
      
      case 'error': {
        console.error('WebSocket error:', message.message)
        break
      }
      
      default:
        console.log('Unhandled message type:', message.type)
    }
  }, [addPlayer, removePlayer])

  // Send a message to the WebSocket
  const sendWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (readyState === ReadyState.OPEN) {
      sendMessage(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }, [sendMessage, readyState])

  // Send ping to keep connection alive
  const sendPing = useCallback(() => {
    sendWebSocketMessage({ type: 'ping' })
  }, [sendWebSocketMessage])

  // Get session info
  const requestSessionInfo = useCallback(() => {
    sendWebSocketMessage({ type: 'get_session_info' })
  }, [sendWebSocketMessage])

  // Connection status helpers
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Disconnecting',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState]

  const isConnected = readyState === ReadyState.OPEN
  const isConnecting = readyState === ReadyState.CONNECTING
  const isDisconnected = readyState === ReadyState.CLOSED

  return {
    sendMessage: sendWebSocketMessage,
    sendPing,
    requestSessionInfo,
    isConnected,
    isConnecting,
    isDisconnected,
    connectionStatus,
    readyState,
    getWebSocket,
  }
}