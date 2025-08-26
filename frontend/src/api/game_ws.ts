import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useCallback, useEffect } from 'react'
import * as React from 'react'

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

export interface GameCheckpointMessage extends WebSocketMessage {
  type: 'game_checkpoint'
  checkpoint_id: string
  room_id: string
  stream_position: string
  sequence_num: number
  phase: string
  game_state: {
    game_id: string
    phase: string
    current_player: string | null
    current_player_name: string | null
    players: Array<{
      id: string
      name: string
      cards: Array<{
        id: string
        rank: number
        suit: string | null
      }>
      has_called_cabo: boolean
    }>
    deck_size: number
    discard_top: {
      id: string
      rank: number
      suit: string | null
    } | null
    drawn_card: {
      id: string
      rank: number
      suit: string | null
    } | null
    played_card: {
      id: string
      rank: number
      suit: string | null
    } | null
    special_action_player: string | null
    special_action_type: string | null
    stack_caller: string | null
    cabo_caller: string | null
    final_round_started: boolean
    card_visibility: {
      [viewer_id: string]: Array<[string, number]>  // [(target_player_id, card_index)]
    }
  }
  timestamp: string
}

// Keep old message type for backward compatibility during transition
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
    drawn_card: {
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
    setStackCaller,
    clearStackCaller,
    setCalledCabo,
    getPlayerById,
    updatePlayerCards,
    setPlayers
  } = useGamePlayStore.getState()

  const convertCard = (card: any): GameCard => ({
    id: card.id || '',
    rank: card.rank,
    suit: card.suit,
    isTemporarilyViewed: card.isTemporarilyViewed || false
  })

  // Helper function to parse card strings from backend (e.g., "3♥", "K♠", "Joker")
  const parseCardString = (cardStr: string): GameCard => {
    if (cardStr === 'Joker') {
      return {
        id: 'parsed_card',
        rank: 0, // Joker
        suit: null,
        isTemporarilyViewed: false
      }
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
      return {
        id: 'parsed_card',
        rank,
        suit,
        isTemporarilyViewed: false
      }
    }
  }

  switch (gameEvent.event_type) {
    case 'game_started': {
      console.log('Game started with setup phase')
      setPhase(GamePhase.SETUP)
      break
    }

    case 'game_phase_changed': {
      console.log('Game phase changed to:', gameEvent.data.phase, 'with data:', gameEvent.data)
      const newPhase = gameEvent.data.phase as GamePhase
      setPhase(newPhase)
      
      // When transitioning from SETUP to PLAYING, hide all temporarily viewed cards
      if (newPhase === 'playing') {
        const currentUserId = useAuthStore.getState().sessionId
        const players = useGamePlayStore.getState().players
        
        // Clear isTemporarilyViewed flag from all cards (hide setup cards)
        players.forEach(player => {
          const updatedCards = player.cards.map(card => ({
            ...card,
            isTemporarilyViewed: false
          }))
          updatePlayerCards(player.id, updatedCards)
        })
        
        // Clear special action when returning to playing phase
        setSpecialAction(null)
      }
      
      // Clear special action when entering turn transition or stack phases
      if (newPhase === 'turn_transition' || newPhase === 'stack_called') {
        setSpecialAction(null)
      }
      
      // Set special action when entering special action phases
      if (newPhase === 'waiting_for_special_action' || newPhase === 'king_view_phase' || newPhase === 'king_swap_phase') {
        const currentUserId = useAuthStore.getState().sessionId
        const actionType = gameEvent.data.special_action_type
        
        // Map backend action types to frontend types
        let frontendActionType: 'VIEW_OWN' | 'VIEW_OPPONENT' | 'SWAP_CARDS' | 'KING_VIEW' | 'KING_SWAP'
        if (newPhase === 'king_view_phase') {
          frontendActionType = 'KING_VIEW'
        } else if (newPhase === 'king_swap_phase') {
          frontendActionType = 'KING_SWAP'
        } else if (actionType === 'view_own') {
          frontendActionType = 'VIEW_OWN'
        } else if (actionType === 'view_opponent') {
          frontendActionType = 'VIEW_OPPONENT'
        } else if (actionType === 'swap_opponent') {
          frontendActionType = 'SWAP_CARDS'
        } else {
          console.warn('Unknown special action type:', actionType)
          frontendActionType = 'VIEW_OWN' // Default fallback
        }
        
        setSpecialAction({
          type: frontendActionType,
          playerId: gameEvent.data.current_player,
          isComplete: false
        })
      }
      
      if (gameEvent.data.current_player) {
        setCurrentPlayer(gameEvent.data.current_player)
      }
      break
    }

    case 'turn_changed': {
      console.log('Turn changed to player:', gameEvent.data.current_player_name)
      const currentUserId = useAuthStore.getState().sessionId
      setCurrentPlayer(gameEvent.data.current_player)
      
      // When turn changes, we're back in the playing phase
      setPhase(GamePhase.PLAYING)
      
      // Clear special action when turn changes
      setSpecialAction(null)
      
      // Clear all temporarily viewed cards when turn changes
      const players = useGamePlayStore.getState().players
      players.forEach(player => {
        const updatedCards = player.cards.map(card => ({
          ...card,
          isTemporarilyViewed: false
        }))
        updatePlayerCards(player.id, updatedCards)
      })
      
      // Clear drawn card if it's not our turn anymore
      if (gameEvent.data.current_player !== currentUserId) {
        setDrawnCard(null)
      }
      break
    }

    case 'card_drawn': {
      console.log('Card drawn by player:', gameEvent.data.player_id)
      const currentUserId = useAuthStore.getState().sessionId
      
      // Only set drawn card if it's the current user and card is visible
      if (gameEvent.data.player_id === currentUserId && gameEvent.data.card && gameEvent.data.card !== 'hidden') {
        const cardData = gameEvent.data.card
        if (typeof cardData === 'string') {
          // Parse card string from backend (e.g., "3♥", "K♠", "Joker")
          const parsedCard = parseCardString(cardData)
          setDrawnCard({ ...parsedCard, id: `drawn_${gameEvent.data.player_id}_${Date.now()}`, isTemporarilyViewed: true })
        } else if (typeof cardData === 'object') {
          // Handle object format (fallback)
          const drawnCard = convertCard(cardData)
          setDrawnCard({ ...drawnCard, id: `drawn_${gameEvent.data.player_id}_${Date.now()}`, isTemporarilyViewed: true })
        }
      } else if (gameEvent.data.player_id !== currentUserId) {
        // Clear drawn card when another player draws
        setDrawnCard(null)
      }
      break
    }

    case 'card_played': {
      console.log('Card played:', gameEvent.data.card, 'by player:', gameEvent.data.player_id)
      const currentUserId = useAuthStore.getState().sessionId
      
      if (gameEvent.data.card && gameEvent.data.card !== 'hidden') {
        const cardData = gameEvent.data.card
        if (typeof cardData === 'string') {
          // Parse card string from backend (e.g., "3♥", "K♠", "Joker")
          addCardToDiscard(parseCardString(cardData))
        } else if (typeof cardData === 'object') {
          // Handle object format (fallback)
          addCardToDiscard(convertCard(cardData))
        }
      }
      
      // Clear drawn card if the current player played a card
      if (gameEvent.data.player_id === currentUserId) {
        setDrawnCard(null)
      }
      break
    }

    case 'card_replaced_and_played': {
      console.log('Card replaced and played by:', gameEvent.data.player_id)
      const currentUserId = useAuthStore.getState().sessionId
      
      if (gameEvent.data.played_card) {
        const cardData = gameEvent.data.played_card
        if (typeof cardData === 'string') {
          // Parse card string from backend (e.g., "3♥", "K♠", "Joker")
          addCardToDiscard(parseCardString(cardData))
        } else if (typeof cardData === 'object') {
          // Handle object format (fallback)
          addCardToDiscard(convertCard(cardData))
        }
      }
      
      // Clear drawn card if the current player used replace and play
      if (gameEvent.data.player_id === currentUserId) {
        setDrawnCard(null)
      }
      break
    }

    case 'stack_called': {
      console.log('Stack called by:', gameEvent.data.caller)
      // Set the single stack winner
      setStackCaller({
        playerId: gameEvent.data.caller_id,
        nickname: gameEvent.data.caller,
        timestamp: (typeof gameEvent.timestamp === 'number' ? gameEvent.timestamp * 1000 : Date.now())
      })
      setPhase(GamePhase.STACK_CALLED)
      break
    }

    case 'stack_success': {
      console.log('Stack successful:', gameEvent.data.type, 'by', gameEvent.data.player)
      
      // Handle card updates based on stack type
      if (gameEvent.data.type === 'self_stack') {
        // Player discarded their own card
        const player = getPlayerById(gameEvent.data.player_id)
        if (player && gameEvent.data.card_index !== undefined) {
          // Remove the card at the specified index
          const updatedCards = player.cards.filter((_, index) => index !== gameEvent.data.card_index)
          updatePlayerCards(gameEvent.data.player_id, updatedCards)
        }
      } else if (gameEvent.data.type === 'opponent_stack') {
        // Player removed their card and gave it to opponent
        const player = getPlayerById(gameEvent.data.player_id)
        const target = getPlayerById(gameEvent.data.target_id)
        
        if (player && gameEvent.data.card_index !== undefined) {
          // Remove card from player
          const updatedPlayerCards = player.cards.filter((_, index) => index !== gameEvent.data.card_index)
          updatePlayerCards(gameEvent.data.player_id, updatedPlayerCards)
        }
        
        if (target && gameEvent.data.given_card) {
          // Add card to target (create unknown card since we don't know the details)
          const newCard = {
            id: `${gameEvent.data.target_id}_${target.cards.length}_${Date.now()}`,
            rank: '?',
            suit: '?'
          } as GameCard
          const updatedTargetCards = [...target.cards, newCard]
          updatePlayerCards(gameEvent.data.target_id, updatedTargetCards)
        }
      }
      
      // Clear stack caller and continue game
      clearStackCaller()
      break
    }

    case 'stack_failed': {
      console.log('Stack failed by:', gameEvent.data.player)
      
      // Player drew a penalty card
      const player = getPlayerById(gameEvent.data.player_id)
      if (player && gameEvent.data.penalty_card) {
        // Add the penalty card as an unknown card
        const penaltyCard = {
          id: `${gameEvent.data.player_id}_${player.cards.length}_${Date.now()}`,
          rank: '?',
          suit: '?'
        } as GameCard
        const updatedCards = [...player.cards, penaltyCard]
        updatePlayerCards(gameEvent.data.player_id, updatedCards)
      }
      
      // Clear stack caller and continue game
      clearStackCaller()
      break
    }

    case 'stack_timeout': {
      console.log('Stack timed out for:', gameEvent.data.player)
      
      // Player who timed out gets a penalty card
      const player = getPlayerById(gameEvent.data.player_id)
      if (player && gameEvent.data.penalty_card) {
        // Add the penalty card as an unknown card
        const penaltyCard = {
          id: `${gameEvent.data.player_id}_${player.cards.length}_${Date.now()}`,
          rank: '?',
          suit: '?'
        } as GameCard
        const updatedCards = [...player.cards, penaltyCard]
        updatePlayerCards(gameEvent.data.player_id, updatedCards)
      }
      
      clearStackCaller()
      break
    }

    case 'cabo_called': {
      console.log('Cabo called by:', gameEvent.data.player)
      setCalledCabo(gameEvent.data.player_id)
      break
    }

    case 'card_viewed': {
      console.log('Card viewed by:', gameEvent.data.player)
      // Only show the viewed card to the viewer
      const currentUserId = useAuthStore.getState().sessionId
      if (gameEvent.data.player_id === currentUserId && 
          gameEvent.data.card_index !== undefined && 
          gameEvent.data.card) {
        const player = getPlayerById(gameEvent.data.player_id)
        if (player) {
          // Update visibility map
          addVisibleCard(currentUserId, gameEvent.data.player_id, gameEvent.data.card_index)
          
          const updatedCards = [...player.cards]
          if (updatedCards[gameEvent.data.card_index]) {
            // Parse the card string (e.g., "3♥", "K♠", "Joker")
            const parsedCard = parseCardString(gameEvent.data.card)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard,
              id: `${gameEvent.data.player_id}_${gameEvent.data.card_index}`,
              isTemporarilyViewed: true 
            }
            updatePlayerCards(gameEvent.data.player_id, updatedCards)
            
            // Don't auto-hide during special actions - will be cleared on turn change
            // This keeps the card visible until the turn actually changes
          }
        }
      }
      break
    }

    case 'opponent_card_viewed': {
      console.log('Opponent card viewed by:', gameEvent.data.viewer, 'target:', gameEvent.data.target)
      // Show the viewed card to the viewer only
      const currentUserId = useAuthStore.getState().sessionId
      if (gameEvent.data.viewer_id === currentUserId && 
          gameEvent.data.target_id && 
          gameEvent.data.card_index !== undefined && 
          gameEvent.data.card) {
        const targetPlayer = getPlayerById(gameEvent.data.target_id)
        if (targetPlayer) {
          // Update visibility map
          addVisibleCard(currentUserId, gameEvent.data.target_id, gameEvent.data.card_index)
          
          const updatedCards = [...targetPlayer.cards]
          if (updatedCards[gameEvent.data.card_index]) {
            // Parse the card string (e.g., "3♥", "K♠", "Joker")
            const parsedCard = parseCardString(gameEvent.data.card)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard,
              id: `${gameEvent.data.target_id}_${gameEvent.data.card_index}`,
              isTemporarilyViewed: true 
            }
            updatePlayerCards(gameEvent.data.target_id, updatedCards)
          }
        }
      }
      break
    }

    case 'cards_swapped': {
      console.log('Cards swapped between:', gameEvent.data.player, 'and', gameEvent.data.target)
      // Update player cards if the data includes the new card states
      if (gameEvent.data.updated_players) {
        gameEvent.data.updated_players.forEach((playerData: any) => {
          const cards = playerData.cards.map(convertCard)
          updatePlayerCards(playerData.id, cards)
        })
      }
      break
    }

    case 'king_card_viewed': {
      console.log('King card viewed by:', gameEvent.data.viewer, 'target:', gameEvent.data.target, 'card:', gameEvent.data.card)
      
      // Show the viewed card to the viewer only
      const currentUserId = useAuthStore.getState().sessionId
      if (gameEvent.data.viewer_id === currentUserId && 
          gameEvent.data.target_id && 
          gameEvent.data.card_index !== undefined && 
          gameEvent.data.card) {
        const targetPlayer = getPlayerById(gameEvent.data.target_id)
        if (targetPlayer) {
          const updatedCards = [...targetPlayer.cards]
          if (updatedCards[gameEvent.data.card_index]) {
            // Parse the card string (e.g., "3♥", "K♠", "Joker")
            const parsedCard = parseCardString(gameEvent.data.card)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard, 
              id: `${gameEvent.data.target_id}_${gameEvent.data.card_index}`,
              isTemporarilyViewed: true 
            }
            updatePlayerCards(gameEvent.data.target_id, updatedCards)
          }
        }
      }
      
      // Phase should change to KING_SWAP_PHASE automatically via game_phase_changed event
      // Don't modify special action here
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

    case 'swap_skipped': {
      console.log('Swap skipped by:', gameEvent.data.player)
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
    setDrawnCard,
    setSpecialAction,
    setStackCaller
  } = useGamePlayStore()
  
  
  // Helper function to parse card strings from backend (e.g., "3♥", "K♠", "Joker")
  const parseCardString = (cardStr: string): GameCard => {
    if (cardStr === 'Joker') {
      return {
        id: 'parsed_card',
        rank: 0, // Joker
        suit: null,
        isTemporarilyViewed: false
      }
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
      return {
        id: 'parsed_card',
        rank,
        suit,
        isTemporarilyViewed: false
      }
    }
  }
  
  const socketUrl = 'ws://localhost:8000/ws'

  const {
    sendMessage,
    lastMessage,
    readyState,
    getWebSocket
  } = useWebSocket(socketUrl, {
    share: true,  // Share the WebSocket connection across all hook instances
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
      try {
        const messageStr = JSON.stringify(message)
        sendMessage(messageStr)
        console.log('Sent WebSocket message:', message.type)
      } catch (error) {
        console.error('Failed to send WebSocket message:', error, message)
      }
    } else {
      console.warn('WebSocket not connected, cannot send message:', message.type)
    }
  }, [sendMessage, readyState])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log('Received WebSocket message:', message.type)
    
    // Update sequence number if present and send ack immediately
    if (message.seq_num !== undefined) {
      setCurrentSeq(message.seq_num)
      
      // Send acknowledgment for sequenced messages - do this first to avoid blocking
      if (readyState === ReadyState.OPEN) {
        try {
          sendMessage(JSON.stringify({
            type: 'ack_seq',
            seq_num: message.seq_num
          }))
        } catch (error) {
          console.error('Failed to send ack:', error)
        }
      }
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
      
      case 'game_checkpoint': {
        const checkpoint = message as GameCheckpointMessage
        console.log('Received game checkpoint')
        
        // Apply checkpoint state with visibility filtering
        const currentUserId = useAuthStore.getState().sessionId
        const gameState = checkpoint.game_state
        
        // Process players with visibility filtering
        const players = gameState.players.map(player => {
          const cards = player.cards.map((card, index) => {
            // Check if current user can see this card
            const visibleCards = gameState.card_visibility[currentUserId] || []
            const canSee = visibleCards.some(([targetId, cardIdx]) => 
              targetId === player.id && cardIdx === index
            )
            
            // During setup phase, players can see their first 2 cards
            const isOwnCard = player.id === currentUserId
            const isSetupPhase = gameState.phase === 'setup'
            const isSetupVisible = isOwnCard && isSetupPhase && index < 2
            
            return {
              id: card.id,
              rank: (canSee || isSetupVisible) ? card.rank : ('?' as const),
              suit: (canSee || isSetupVisible) ? card.suit : ('?' as const),
              isTemporarilyViewed: canSee || isSetupVisible
            }
          })
          
          return {
            id: player.id,
            nickname: player.name,
            cards,
            hasCalledCabo: player.has_called_cabo
          }
        })
        
        // Apply game state
        setPlayers(players)
        setCurrentPlayer(gameState.current_player || '')
        setPhase(gameState.phase as GamePhase)
        
        // Set drawn card if exists and belongs to current player
        if (gameState.drawn_card && gameState.current_player === currentUserId) {
          setDrawnCard(convertCard(gameState.drawn_card))
        } else {
          setDrawnCard(null)
        }
        
        // Set discard pile
        if (gameState.discard_top) {
          addCardToDiscard(convertCard(gameState.discard_top))
        }
        
        // Set special action
        if (gameState.special_action_player) {
          setSpecialAction({
            type: gameState.special_action_type || '',
            playerId: gameState.special_action_player
          })
        } else {
          setSpecialAction(null)
        }
        
        // Set stack caller
        if (gameState.stack_caller) {
          setStackCaller(gameState.stack_caller)
        } else {
          setStackCaller(null)
        }
        
        // Set cabo caller
        if (gameState.cabo_caller) {
          setCalledCabo(gameState.cabo_caller, true)
        }
        
        // Update room state
        setRoomPhase(RoomPhase.IN_GAME)
        
        // Send acknowledgment
        sendMessage({
          type: 'ack_seq',
          seq_num: checkpoint.sequence_num
        })
        
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
        
        // Reset game state first to clear any stale data
        const { resetGameState, setDiscardPile } = useGamePlayStore.getState()
        resetGameState()
        
        // Apply game state atomically
        const gamePhase = playingState.game.phase as GamePhase
        
        const gamePlayers = playingState.game.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          cards: p.cards.map(convertCard),
          hasCalledCabo: p.has_called_cabo
        }))
        
        // Update all game state at once to avoid partial updates
        setGamePlayers(gamePlayers)
        setCurrentPlayer(playingState.game.current_player_id)
        setGamePhase(gamePhase)
        
        // Set discard pile with only the top card if it exists
        if (playingState.game.top_discard_card) {
          setDiscardPile([convertCard(playingState.game.top_discard_card)])
        }
        
        // Set drawn card if it exists and current player matches
        const currentUserId = useAuthStore.getState().sessionId
        if (playingState.game.drawn_card && playingState.game.current_player_id === currentUserId) {
          // Handle both object and string formats for drawn card
          if (typeof playingState.game.drawn_card === 'string') {
            const parsedCard = parseCardString(playingState.game.drawn_card)
            setDrawnCard({ ...parsedCard, id: `drawn_${playingState.game.current_player_id}_${Date.now()}`, isTemporarilyViewed: true })
          } else {
            // Ensure drawn card has isTemporarilyViewed set to true
            const drawnCard = convertCard(playingState.game.drawn_card)
            setDrawnCard({ ...drawnCard, id: `drawn_${playingState.game.current_player_id}_${Date.now()}`, isTemporarilyViewed: true })
          }
        } else {
          setDrawnCard(null)
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
          setStackCaller({
            playerId: playingState.game.stack_caller,
            nickname: gamePlayers.find(p => p.id === playingState.game.stack_caller)?.nickname || 'Unknown',
            timestamp: Date.now()
          })
        } else {
          // Clear stack caller if not in checkpoint
          setStackCaller(null)
        }
        
        break
      }
      
      case 'game_event': {
        const gameEvent = message as GameEventMessage
        console.log('Received game event:', gameEvent.event_type, gameEvent.data)
        
        try {
          handleGameEvent(gameEvent)
        } catch (error) {
          console.error('Error handling game event:', error, gameEvent)
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
      
      case 'session_info': {
        const sessionMessage = message as SessionInfoMessage
        console.log('Received session info:', sessionMessage.session_id, sessionMessage.nickname)
        // Update auth store with session info
        useAuthStore.getState().setSessionInfo(sessionMessage.nickname, sessionMessage.session_id)
        console.log('Updated auth store with session info')
        break
      }
      

      
      case 'error': {
        console.error('WebSocket error:', message.message)
        break
      }
      
      case 'ping': {
        // Respond to server ping with pong
        sendWebSocketMessage({ type: 'pong' })
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
    console.log('Requesting session info...')
    sendWebSocketMessage({ type: 'get_session_info' })
  }, [sendWebSocketMessage])

  // Request session info when connected - but only once per connection
  useEffect(() => {
    let hasRequestedSession = false
    
    if (readyState === ReadyState.OPEN && !hasRequestedSession) {
      console.log('WebSocket connected, requesting session info...')
      hasRequestedSession = true
      requestSessionInfo()
    }
    
    return () => {
      hasRequestedSession = false
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