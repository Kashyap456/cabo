import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useCallback, useEffect } from 'react'

import { useRoomStore, type Player, RoomPhase } from '@/stores/game_state'
import { useGamePlayStore, GamePhase, Suit, type Card as GameCard } from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'

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

export interface SessionInfoMessage extends WebSocketMessage {
  type: 'session_info'
  session_id: string
  nickname: string
  room_id: string | null
}

export interface GameEventMessage extends WebSocketMessage {
  type: 'game_event'
  seq_num: number
  event_type: string
  data: any
}

const handleGameEvent = (gameEvent: GameEventMessage) => {
  const {
    setCurrentPlayer,
    setPhase,
    addCardToDiscard,
    setDrawnCard,
    setSpecialAction,
    addStackCall,
    clearStackCalls,
    setCalledCabo,
    getPlayerById
  } = useGamePlayStore.getState()

  const convertCard = (card: any): GameCard => ({
    id: card.id || '',
    rank: card.rank,
    suit: card.suit,
    isTemporarilyViewed: card.isTemporarilyViewed || false
  })

  switch (gameEvent.event_type) {
    case 'game_started': {
      console.log('Game started with setup phase')
      setPhase(GamePhase.SETUP)
      break
    }

    case 'game_phase_changed': {
      console.log('Game phase changed to:', gameEvent.data.phase)
      setPhase(gameEvent.data.phase as GamePhase)
      if (gameEvent.data.current_player) {
        setCurrentPlayer(gameEvent.data.current_player)
      }
      break
    }

    case 'turn_changed': {
      console.log('Turn changed to player:', gameEvent.data.current_player_name)
      setCurrentPlayer(gameEvent.data.current_player)
      // Clear drawn card when turn changes (in case it wasn't used)
      setDrawnCard(null)
      break
    }

    case 'card_drawn': {
      console.log('Card drawn by player:', gameEvent.data.player_id)
      // If the card is visible (not "hidden"), store it in drawn card state
      if (gameEvent.data.card && gameEvent.data.card !== 'hidden') {
        // Parse card from backend string format (e.g., "3♥" or card object)
        if (typeof gameEvent.data.card === 'string') {
          // Parse string format like "3♥", "K♠", "Joker"
          const cardStr = gameEvent.data.card
          if (cardStr === 'Joker') {
            setDrawnCard({
              id: 'drawn_card',
              rank: 0, // Joker
              suit: null,
              isTemporarilyViewed: false
            })
          } else {
            // Extract rank and suit from string
            const suitSymbols = { '♥': Suit.HEARTS, '♦': Suit.DIAMONDS, '♣': Suit.CLUBS, '♠': Suit.SPADES }
            const lastChar = cardStr.slice(-1)
            const suit = suitSymbols[lastChar as keyof typeof suitSymbols] || Suit.HEARTS
            const rankStr = cardStr.slice(0, -1)
            let rank = parseInt(rankStr)
            if (isNaN(rank)) {
              // Handle face cards
              const faceCards = { 'A': 1, 'J': 11, 'Q': 12, 'K': 13 }
              rank = faceCards[rankStr as keyof typeof faceCards] || 1
            }
            setDrawnCard({
              id: 'drawn_card',
              rank,
              suit,
              isTemporarilyViewed: false
            })
          }
        } else if (typeof gameEvent.data.card === 'object') {
          // Card is already in object format
          setDrawnCard(convertCard(gameEvent.data.card))
        }
      }
      break
    }

    case 'card_played': {
      console.log('Card played:', gameEvent.data.card)
      if (gameEvent.data.card && gameEvent.data.card !== 'hidden') {
        // Parse card string and add to discard pile
        // This would need proper card parsing from backend format
        const cardData = gameEvent.data.card
        if (typeof cardData === 'object') {
          addCardToDiscard(convertCard(cardData))
        }
      }
      // Clear drawn card since it was played
      setDrawnCard(null)
      break
    }

    case 'card_replaced_and_play': {
      console.log('Card replaced and played by:', gameEvent.data.player_id)
      if (gameEvent.data.played_card && typeof gameEvent.data.played_card === 'object') {
        addCardToDiscard(convertCard(gameEvent.data.played_card))
      }
      // Clear drawn card since it was used in replace and play
      setDrawnCard(null)
      break
    }

    case 'stack_called': {
      console.log('Stack called by:', gameEvent.data.caller)
      const caller = getPlayerById(gameEvent.data.caller_id)
      if (caller) {
        addStackCall({
          playerId: gameEvent.data.caller_id,
          nickname: gameEvent.data.caller,
          timestamp: (typeof gameEvent.timestamp === 'number' ? gameEvent.timestamp * 1000 : Date.now())
        })
      }
      setPhase(GamePhase.STACK_CALLED)
      break
    }

    case 'stack_success': {
      console.log('Stack successful:', gameEvent.data.type, 'by', gameEvent.data.player)
      // Clear stack calls and continue game
      clearStackCalls()
      break
    }

    case 'stack_failed': {
      console.log('Stack failed by:', gameEvent.data.player)
      // Clear stack calls and continue game
      clearStackCalls()
      break
    }

    case 'stack_timeout': {
      console.log('Stack timed out for:', gameEvent.data.player)
      clearStackCalls()
      break
    }

    case 'cabo_called': {
      console.log('Cabo called by:', gameEvent.data.player)
      setCalledCabo(gameEvent.data.player_id)
      break
    }

    case 'card_viewed': {
      console.log('Card viewed by:', gameEvent.data.player)
      // Card viewing is handled by temporary visibility in game state
      break
    }

    case 'opponent_card_viewed': {
      console.log('Opponent card viewed by:', gameEvent.data.viewer, 'target:', gameEvent.data.target)
      // Handle opponent card viewing
      break
    }

    case 'cards_swapped': {
      console.log('Cards swapped between:', gameEvent.data.player, 'and', gameEvent.data.target)
      // Card swapping is handled by game state updates
      break
    }

    case 'king_card_viewed': {
      console.log('King card viewed by:', gameEvent.data.viewer, 'target:', gameEvent.data.target)
      setSpecialAction({
        type: 'KING_VIEW',
        playerId: gameEvent.data.viewer_id || '',
        targetPlayerId: gameEvent.data.target_id,
        isComplete: true
      })
      break
    }

    case 'king_cards_swapped': {
      console.log('King cards swapped between:', gameEvent.data.player, 'and', gameEvent.data.target)
      setSpecialAction({
        type: 'KING_SWAP',
        playerId: gameEvent.data.player_id || '',
        targetPlayerId: gameEvent.data.target_id,
        isComplete: true
      })
      break
    }

    case 'king_swap_skipped': {
      console.log('King swap skipped by:', gameEvent.data.player)
      setSpecialAction(null)
      break
    }

    case 'special_action_timeout': {
      console.log('Special action timed out')
      setSpecialAction(null)
      break
    }

    case 'game_ended': {
      console.log('Game ended, winner:', gameEvent.data.winner_name)
      setPhase(GamePhase.ENDED)
      // Could show winner announcement
      break
    }

    default: {
      console.warn('Unknown game event type:', gameEvent.event_type)
      break
    }
  }
}

export const useGameWebSocket = () => {
  const { 
    addPlayer, 
    removePlayer, 
    setPlayers, 
    setPhase,
    setCurrentSeq,
    setIsReady
  } = useRoomStore()
  
  const {
    setCurrentPlayer,
    setPhase: setGamePhase,
    setPlayers: setGamePlayers,
    addCardToDiscard,
    setSpecialAction,
    addStackCall
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
      
      case 'game_event': {
        const gameEvent = message as GameEventMessage
        console.log('Received game event:', gameEvent.event_type, gameEvent.data)
        
        handleGameEvent(gameEvent)
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
      
      case 'session_info': {
        const sessionMessage = message as SessionInfoMessage
        console.log('Received session info:', sessionMessage.session_id, sessionMessage.nickname)
        // Update auth store with session info
        const { setSessionInfo } = useAuthStore.getState()
        setSessionInfo(sessionMessage.nickname, sessionMessage.session_id)
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

  // Request session info when connected
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      console.log('WebSocket connected, requesting session info...')
      requestSessionInfo()
    }
  }, [readyState, requestSessionInfo])

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