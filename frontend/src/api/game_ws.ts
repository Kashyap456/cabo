import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useCallback, useEffect } from 'react'
import Cookies from 'js-cookie'
import { useRoomStore, type Player, RoomPhase } from '@/stores/game_state'
import { useGamePlayStore, GamePhase, type Card as GameCard } from '@/stores/game_play_state'

export interface WebSocketMessage {
  type: string
  seq_num?: number
  timestamp?: string
  [key: string]: any
}

export interface RoomWaitingStateMessage extends WebSocketMessage {
  type: 'room_waiting_state'
  seq_num: number
  room: {
    room_id: string
    room_code: string
    config: any
    host_session_id: string | null
    players: Array<{
      id: string
      nickname: string
      isHost: boolean
    }>
  }
}

export interface RoomPlayingStateMessage extends WebSocketMessage {
  type: 'room_in_game_state'
  seq_num: number
  room: {
    room_id: string
    room_code: string
  }
  game: {
    current_player_id: string
    phase: string
    turn_number: number
    players: Array<{
      id: string
      nickname: string
      cards: Array<{
        id: string
        rank: number | '?'
        suit: string | '?' | null
        isTemporarilyViewed?: boolean
      }>
      has_called_cabo: boolean
    }>
    top_discard_card: {
      id: string
      rank: number | '?'
      suit: string | '?' | null
      isTemporarilyViewed?: boolean
    } | null
    played_card: {
      id: string
      rank: number | '?'
      suit: string | '?' | null
      isTemporarilyViewed?: boolean
    } | null
    special_action: {
      type: string
      player_id: string
    } | null
    stack_caller: string | null
    cabo_called_by: string | null
    final_round_started: boolean
  }
}

export interface PlayerJoinedMessage extends WebSocketMessage {
  type: 'player_joined'
  seq_num: number
  player: {
    id: string
    nickname: string
    isHost: boolean
  }
}

export interface PlayerLeftMessage extends WebSocketMessage {
  type: 'player_left'
  seq_num: number
  session_id: string
}

export interface ReadyMessage extends WebSocketMessage {
  type: 'ready'
  current_seq: number
}

export interface GameMessage extends WebSocketMessage {
  type: 'game_message'
  seq_num: number
  from: string
  data: any
}

export const useGameWebSocket = () => {
  const { 
    addPlayer, 
    removePlayer, 
    setPlayers, 
    setPhase,
    currentSeq,
    setCurrentSeq,
    isReady,
    setIsReady
  } = useRoomStore()
  
  const {
    setCurrentPlayer,
    setPhase: setGamePhase,
    setPlayers: setGamePlayers,
    addCardToDiscard,
    setSpecialAction,
    addStackCall,
    setCalledCabo
  } = useGamePlayStore()
  
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

  // Send a message to the WebSocket
  const sendWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (readyState === ReadyState.OPEN) {
      sendMessage(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }, [sendMessage, readyState])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('Received WebSocket message:', message)
    
    // Update sequence number if present
    if (message.seq_num !== undefined) {
      setCurrentSeq(message.seq_num)
      
      // Send acknowledgment for sequenced messages
      sendWebSocketMessage({
        type: 'ack_seq',
        seq_num: message.seq_num
      })
    }
    
    switch (message.type) {
      case 'room_waiting_state': {
        const waitingState = message as RoomWaitingStateMessage
        console.log('Received room waiting state checkpoint')
        
        // Apply checkpoint state
        const players = waitingState.room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          isHost: p.isHost
        }))
        setPlayers(players)
        setPhase(RoomPhase.WAITING)
        break
      }
      
      case 'room_in_game_state': {
        const playingState = message as RoomPlayingStateMessage
        console.log('Received room playing state checkpoint')
        
        // Apply room state
        setPhase(RoomPhase.IN_GAME)
        
        // Convert game cards to frontend format
        const convertCard = (card: any): GameCard => ({
          id: card.id,
          rank: card.rank,
          suit: card.suit,
          isTemporarilyViewed: card.isTemporarilyViewed || false
        })
        
        // Apply game state
        setCurrentPlayer(playingState.game.current_player_id)
        setGamePhase(playingState.game.phase as GamePhase)
        
        const gamePlayers = playingState.game.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          cards: p.cards.map(convertCard),
          hasCalledCabo: p.has_called_cabo
        }))
        setGamePlayers(gamePlayers)
        
        // Set discard pile and played card if they exist
        if (playingState.game.top_discard_card) {
          addCardToDiscard(convertCard(playingState.game.top_discard_card))
        }
        
        // Set special action if active
        if (playingState.game.special_action) {
          setSpecialAction({
            type: playingState.game.special_action.type as any,
            playerId: playingState.game.special_action.player_id,
            isComplete: false
          })
        }
        
        // Set stack caller if exists
        if (playingState.game.stack_caller) {
          // We'd need to get the nickname for this, for now just add a basic stack call
          addStackCall({
            playerId: playingState.game.stack_caller,
            nickname: gamePlayers.find(p => p.id === playingState.game.stack_caller)?.nickname || 'Unknown',
            timestamp: Date.now()
          })
        }
        
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
      
      case 'ready': {
        const readyMessage = message as ReadyMessage
        console.log(`Room synchronized, ready at seq ${readyMessage.current_seq}`)
        setCurrentSeq(readyMessage.current_seq)
        setIsReady(true)
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
  }, [addPlayer, removePlayer, setPlayers, setPhase, setCurrentSeq, setIsReady, sendWebSocketMessage])

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