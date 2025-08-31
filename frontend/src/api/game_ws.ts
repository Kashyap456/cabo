import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { useRoomStore, type Player, RoomPhase } from '@/stores/game_state'
import { useGamePlayStore, GamePhase, Suit, type Card as GameCard } from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'

export interface WebSocketMessage {
  type: string
  seq_num?: number
  timestamp?: string
  [key: string]: any
}

// Room update message (sent when joining waiting room)
export interface RoomUpdateMessage extends WebSocketMessage {
  type: 'room_update'
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

// RoomWaitingStateMessage removed - replaced by RoomUpdateMessage

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
    deck_cards: string[]  // Card IDs in deck
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

// RoomPlayingStateMessage removed - replaced by GameCheckpointMessage

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
  checkpoint_id?: string  // Present for game reconnection
  events_replayed?: number  // Present for game reconnection
  current_seq?: number  // Legacy field
}

export interface SessionInfoMessage extends WebSocketMessage {
  type: 'session_info'
  session_id: string
  nickname: string
  room_id: string | null
}

export interface GameEventMessage extends WebSocketMessage {
  type: 'game_event'
  seq_num?: number
  stream_id?: string  // Position in Redis stream
  event_type: string
  data: any
  timestamp?: string
}

// Convert backend special action types to frontend format
const convertSpecialActionType = (backendType: string): string => {
  switch (backendType) {
    case 'view_own':
      return 'VIEW_OWN'
    case 'view_opponent':
      return 'VIEW_OPPONENT'
    case 'swap_opponent':
      return 'SWAP_CARDS'
    case 'king_effect':
      return 'KING_VIEW' // King starts with view phase
    default:
      return backendType
  }
}

// Helper function to sync isTemporarilyViewed flags with visibility map
const syncCardVisibility = (visibilityMap: any) => {
  const { updatePlayerCards, players, setCardVisibility } = useGamePlayStore.getState()
  const currentUserId = useAuthStore.getState().sessionId
  
  // Update the visibility map
  setCardVisibility(visibilityMap)
  
  // Get what the current user can see
  const visibleCards = visibilityMap[currentUserId] || []
  
  // Update all player cards based on the new visibility
  players.forEach(player => {
    const updatedCards = player.cards.map((card, index) => {
      // Check if current user can see this card
      const canSee = visibleCards.some((visibility: any) => {
        // Handle both array and object formats
        if (Array.isArray(visibility)) {
          const [targetId, cardIdx] = visibility
          return targetId === player.id && cardIdx === index
        } else {
          return visibility.player_id === player.id && visibility.card_index === index
        }
      })
      
      // Update only the isTemporarilyViewed flag
      return {
        ...card,
        isTemporarilyViewed: canSee
      }
    })
    updatePlayerCards(player.id, updatedCards)
  })
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
    setStackGiveTarget,
    setViewingIndicator,
    setCalledCabo,
    getPlayerById,
    updatePlayerCards,
    setPlayers,
    addVisibleCard,
    setDeckCards,
    replaceAndPlayCard,
    swapCards
  } = useGamePlayStore.getState()


  // Helper function to parse card strings from backend (e.g., "3♥", "K♠", "JB", "JR")
  const parseCardString = (cardStr: string, id: string): GameCard => {
    // Handle Jokers with suit differentiation
    if (cardStr === 'JB') {
      // Black Joker (Spades)
      return {
        id,
        rank: 0, // Joker
        suit: Suit.SPADES,
        isTemporarilyViewed: false
      }
    } else if (cardStr === 'JR') {
      // Red Joker (Hearts)
      return {
        id,
        rank: 0, // Joker
        suit: Suit.HEARTS,
        isTemporarilyViewed: false
      }
    } else if (cardStr === 'Joker') {
      // Legacy support - default to black joker
      return {
        id,
        rank: 0, // Joker
        suit: Suit.SPADES,
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
        id,
        rank,
        suit,
        isTemporarilyViewed: false
      }
    }
  }

  switch (gameEvent.event_type) {
    case 'game_started': {
      setPhase(GamePhase.SETUP)
      // Also update room phase to show playing view
      useRoomStore.getState().setPhase(RoomPhase.IN_GAME)
      break
    }

    case 'game_phase_changed': {
      const newPhase = gameEvent.data.phase
      
      // Validate phase is a valid GamePhase value
      if (!Object.values(GamePhase).includes(newPhase)) {
        return
      }
      
      setPhase(newPhase as GamePhase)
      
      // When transitioning from SETUP to DRAW_PHASE, hide all temporarily viewed cards  
      if (newPhase === 'draw_phase') {
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
      if (newPhase === 'turn_transition' || newPhase === 'stack_turn_transition' || newPhase === 'stack_called') {
        setSpecialAction(null)
      }
      
      // Set special action when entering special action phases
      if (newPhase === 'waiting_for_special_action' || newPhase === 'king_view_phase' || newPhase === 'king_swap_phase') {
        const currentUserId = useAuthStore.getState().sessionId
        const actionType = gameEvent.data.special_action_type
        
        // Use the conversion function
        const frontendActionType = newPhase === 'king_view_phase' ? 'KING_VIEW' :
                                    newPhase === 'king_swap_phase' ? 'KING_SWAP' :
                                    convertSpecialActionType(actionType)
        
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
      const currentUserId = useAuthStore.getState().sessionId
      const { setCardVisibility } = useGamePlayStore.getState()
      setCurrentPlayer(gameEvent.data.current_player)
      
      // When turn changes, we're in the draw phase
      setPhase(GamePhase.DRAW_PHASE)
      
      // Clear special action when turn changes
      setSpecialAction(null)
      
      // Clear viewing indicator when turn changes
      setViewingIndicator(null)
      
      // Turn changes always clear ALL visibility (per game rules)
      // Reset visibility map and clear all isTemporarilyViewed flags
      setCardVisibility({})
      
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
      const currentUserId = useAuthStore.getState().sessionId

      const cardData = gameEvent.data.card
      const cardId = gameEvent.data.card_id
      if (!cardId) {
        return
      }

      const parsedCard = parseCardString(cardData, cardId)
      setDrawnCard({ ...parsedCard, id: cardId, isTemporarilyViewed: gameEvent.data.player_id === currentUserId })

      // Remove card from deck (for animation)
      if (gameEvent.data.card_id) {
        const currentDeck = useGamePlayStore.getState().deckCards.filter(id => id !== gameEvent.data.card_id)
        setDeckCards(currentDeck)
      }
      break
    }

    case 'card_played': {      
      if (gameEvent.data.card && gameEvent.data.card !== 'hidden') {
        const cardData = gameEvent.data.card
        const cardId = gameEvent.data.card_id
        if (!cardId) {
          return
        }
        
        const parsedCard = parseCardString(cardData, cardId)
        addCardToDiscard(parsedCard)
      }
      
      // Clear drawn card if the current player played a card
      setDrawnCard(null)
      break
    }

    case 'card_replaced_and_played': {
      replaceAndPlayCard(gameEvent.data.player_id, gameEvent.data.hand_index, gameEvent.data.drawn_card_id)
      break
    }

    case 'stack_called': {
      const currentPhase = useGamePlayStore.getState().phase
      
      // Set the stack winner
      setStackCaller({
        playerId: gameEvent.data.caller_id,
        nickname: gameEvent.data.caller,
        timestamp: (typeof gameEvent.timestamp === 'number' ? gameEvent.timestamp * 1000 : Date.now())
      })
      
      // Only change phase if we're not in a special action phase
      // During special actions, the phase change will come later via game_phase_changed event
      if (currentPhase !== GamePhase.WAITING_FOR_SPECIAL_ACTION && 
          currentPhase !== GamePhase.KING_VIEW_PHASE && 
          currentPhase !== GamePhase.KING_SWAP_PHASE) {
        setPhase(GamePhase.STACK_CALLED)
      }
      break
    }

    case 'stack_success_choose_card': {
      // Successful opponent stack - need to choose card to give
      const stacker = getPlayerById(gameEvent.data.player_id)
      const target = getPlayerById(gameEvent.data.target_id)
      
      if (target && gameEvent.data.target_card_index !== undefined) {
        // Remove the matched card from target's hand at the specified index
        const updatedTargetCards = [...target.cards]
        updatedTargetCards.splice(gameEvent.data.target_card_index, 1)
        const finalTargetCards = [...updatedTargetCards, 
          parseCardString(gameEvent.data.penalty_card, 
                          gameEvent.data.penalty_card_id)]
        updatePlayerCards(gameEvent.data.target_id, finalTargetCards)
        addCardToDiscard(
          parseCardString(
            gameEvent.data.target_matched_card,
            gameEvent.data.target_matched_card_id))
      }
      
      // Set phase to allow choosing card to give
      setPhase(GamePhase.STACK_GIVE_CARD)
      
      // Clear any previous card selections
      useGamePlayStore.getState().clearSelectedCards()
      
      // Track who needs to give a card to whom
      setStackGiveTarget({
        fromPlayer: gameEvent.data.player_id,
        toPlayer: gameEvent.data.target_id,
        targetCardIndex: gameEvent.data.target_card_index
      })
      break
    }
    
    case 'stack_card_given': {
      // Card has been given to the target player
      const giver = getPlayerById(gameEvent.data.player_id)
      const receiver = getPlayerById(gameEvent.data.target_id)
      
      if (giver && gameEvent.data.given_card_id) {
        // Remove the given card from giver's hand
        const updatedGiverCards = giver.cards.filter(c => c.id !== gameEvent.data.given_card_id)
        updatePlayerCards(gameEvent.data.player_id, updatedGiverCards)
      }
      
      if (receiver && gameEvent.data.given_card && gameEvent.data.given_card_id) {
        // Add the given card to receiver's hand
        const givenCard = parseCardString(gameEvent.data.given_card, gameEvent.data.given_card_id)
        const updatedReceiverCards = [...receiver.cards, {
          ...givenCard,
          isTemporarilyViewed: false
        }]
        updatePlayerCards(gameEvent.data.target_id, updatedReceiverCards)
      }
      
      // Clear stack give target
      setStackGiveTarget(null)
      
      // Handle phase transition if specified
      if (gameEvent.data.phase === 'stack_turn_transition') {
        setPhase(GamePhase.STACK_TURN_TRANSITION)
      }
      
      // Clear stack caller
      clearStackCaller()
      break
    }
    
    case 'stack_give_skipped': {
      // Player chose to skip giving a card
      // Clear stack give target
      setStackGiveTarget(null)
      
      // Move to stack turn transition
      if (gameEvent.data.phase === 'stack_turn_transition') {
        setPhase(GamePhase.STACK_TURN_TRANSITION)
      }
      
      // Clear stack caller
      clearStackCaller()
      break
    }
    
    case 'stack_give_timeout': {
      // Timeout during give card phase - random card was given
      const giver = getPlayerById(gameEvent.data.player_id)
      const receiver = getPlayerById(gameEvent.data.target_id)
      
      if (giver && gameEvent.data.given_card_id) {
        // Remove the given card from giver's hand
        const updatedGiverCards = giver.cards.filter(c => c.id !== gameEvent.data.given_card_id)
        updatePlayerCards(gameEvent.data.player_id, updatedGiverCards)
      }
      
      if (receiver && gameEvent.data.given_card && gameEvent.data.given_card_id) {
        // Add the given card to receiver's hand
        const givenCard = parseCardString(gameEvent.data.given_card, gameEvent.data.given_card_id)
        const updatedReceiverCards = [...receiver.cards, {
          ...givenCard,
          isTemporarilyViewed: false
        }]
        updatePlayerCards(gameEvent.data.target_id, updatedReceiverCards)
      }
      
      // Clear stack give target
      setStackGiveTarget(null)
      
      // Move to stack turn transition
      setPhase(GamePhase.STACK_TURN_TRANSITION)
      
      // Clear stack caller
      clearStackCaller()
      break
    }

    case 'stack_success': {
      // Handle card updates based on stack type (for self-stack only now)
      if (gameEvent.data.type === 'self_stack') {
        // Player discarded their own card
        const player = getPlayerById(gameEvent.data.player_id)
        if (player && gameEvent.data.card_index !== undefined) {
          // Remove the card at the specified index
          const updatedCards = player.cards.filter((_, index) => index !== gameEvent.data.card_index)
          updatePlayerCards(gameEvent.data.player_id, updatedCards)
        }
      }
      // Note: opponent_stack is now handled via stack_success_choose_card -> stack_card_given flow
      
      // Handle phase transition if specified
      if (gameEvent.data.phase === 'stack_turn_transition') {
        setPhase(GamePhase.STACK_TURN_TRANSITION)
      }
      
      // Clear stack caller and continue game
      clearStackCaller()
      break
    }

    case 'stack_failed': {
      // Remove penalty card from deck (for animation)
      if (gameEvent.data.penalty_card_id) {
        const currentDeck = useGamePlayStore.getState().deckCards.filter(id => id !== gameEvent.data.penalty_card_id)
        setDeckCards(currentDeck)
      }
      
      // Add penalty card to the stack caller
      const stackCaller = getPlayerById(gameEvent.data.player_id)
      if (stackCaller && gameEvent.data.penalty_card) {
        const parsedCard = parseCardString(gameEvent.data.penalty_card, gameEvent.data.penalty_card_id)
        const penaltyCard = {
          ...parsedCard,
          isTemporarilyViewed: false
        } as GameCard
        const updatedStackCallerCards = [...stackCaller.cards, penaltyCard]
        updatePlayerCards(gameEvent.data.player_id, updatedStackCallerCards)
      }
      
      // If this was an opponent stack attempt, reveal the card they tried to stack
      // target_player_id is who they targeted, target_player_index is the card index
      if (gameEvent.data.target_player_id) {
        const targetPlayer = getPlayerById(gameEvent.data.target_player_id)
        if (targetPlayer) {
          const updatedTargetCards = [...targetPlayer.cards]
          const cardIndex = gameEvent.data.target_player_index
          
          // Make the card in the target player's hand visible to everyone
          if (cardIndex !== undefined && updatedTargetCards[cardIndex]) {
            if (gameEvent.data.attempted_card && gameEvent.data.attempted_card_id) {
              const attemptedCard = parseCardString(gameEvent.data.attempted_card, gameEvent.data.attempted_card_id)
              updatedTargetCards[cardIndex] = {
                ...attemptedCard,
                isTemporarilyViewed: true  // Show the failed stack target to everyone
              }
            }
          }
          
          updatePlayerCards(gameEvent.data.target_player_id, updatedTargetCards)
        }
      } else {
        // Self-stack attempt - reveal the card from stack caller's hand
        const stackCaller = getPlayerById(gameEvent.data.player_id)
        if (stackCaller) {
          const updatedCards = [...stackCaller.cards]
          const cardIndex = gameEvent.data.target_player_index
          
          if (cardIndex !== undefined && updatedCards[cardIndex]) {
            if (gameEvent.data.attempted_card && gameEvent.data.attempted_card_id) {
              const attemptedCard = parseCardString(gameEvent.data.attempted_card, gameEvent.data.attempted_card_id)
              updatedCards[cardIndex] = {
                ...attemptedCard,
                isTemporarilyViewed: true  // Show the failed self-stack card to everyone
              }
            }
          }
          
          updatePlayerCards(gameEvent.data.player_id, updatedCards)
        }
      }
      
      // Handle phase transition if specified
      if (gameEvent.data.phase === 'stack_turn_transition') {
        setPhase(GamePhase.STACK_TURN_TRANSITION)
      }
      
      // Clear stack caller after showing the result
      clearStackCaller()
      break
    }

    case 'stack_timeout': {
      // Remove penalty card from deck (for animation)
      if (gameEvent.data.penalty_card_id) {
        const currentDeck = useGamePlayStore.getState().deckCards.filter(id => id !== gameEvent.data.penalty_card_id)
        setDeckCards(currentDeck)
      }
      
      // Player who timed out gets a penalty card
      const player = getPlayerById(gameEvent.data.player_id)
      if (player && gameEvent.data.penalty_card) {
        // Parse the penalty card from backend
        const parsedCard = parseCardString(gameEvent.data.penalty_card, gameEvent.data.penalty_card_id)
        const penaltyCard = {
          ...parsedCard,
          isTemporarilyViewed: false
        } as GameCard
        const updatedCards = [...player.cards, penaltyCard]
        updatePlayerCards(gameEvent.data.player_id, updatedCards)
      }
      
      // Handle phase transition if specified (should go to stack_turn_transition)
      if (gameEvent.data.phase === 'stack_turn_transition') {
        setPhase(GamePhase.STACK_TURN_TRANSITION)
      }
      
      clearStackCaller()
      break
    }

    case 'cabo_called': {
      setCalledCabo(gameEvent.data.player_id)
      break
    }

    case 'card_viewed': {
      // Set viewing indicator for ALL players to see which card is being viewed
      if (gameEvent.data.player_id && gameEvent.data.card_index !== undefined) {
        setViewingIndicator({
          playerId: gameEvent.data.player_id,
          cardIndex: gameEvent.data.card_index
        })
      }
      
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
            const parsedCard = parseCardString(gameEvent.data.card, gameEvent.data.card_id)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard,
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
      // Set viewing indicator for ALL players to see which card is being viewed
      if (gameEvent.data.target_id && gameEvent.data.card_index !== undefined) {
        setViewingIndicator({
          playerId: gameEvent.data.target_id,
          cardIndex: gameEvent.data.card_index
        })
      }
      
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
            const parsedCard = parseCardString(gameEvent.data.card, gameEvent.data.card_id)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard,
              isTemporarilyViewed: true 
            }
            updatePlayerCards(gameEvent.data.target_id, updatedCards)
          }
        }
      }
      break
    }

    case 'cards_swapped': {
      swapCards(gameEvent.data.player_id, gameEvent.data.target_id, gameEvent.data.player_index, gameEvent.data.target_index)
      
      // Update visibility for all players affected by the swap
      if (gameEvent.data.updated_visibility) {
        syncCardVisibility(gameEvent.data.updated_visibility)
      }
      break
    }

    case 'king_card_viewed': {
      // Set viewing indicator for ALL players to see which card is being viewed
      if (gameEvent.data.target_id && gameEvent.data.card_index !== undefined) {
        setViewingIndicator({
          playerId: gameEvent.data.target_id,
          cardIndex: gameEvent.data.card_index
        })
      }
      
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
            const parsedCard = parseCardString(gameEvent.data.card, gameEvent.data.card_id)
            updatedCards[gameEvent.data.card_index] = { 
              ...parsedCard, 
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
      swapCards(gameEvent.data.player_id, gameEvent.data.target_id, gameEvent.data.player_index, gameEvent.data.target_index)
      
      // Update visibility for all players affected by the King swap
      if (gameEvent.data.updated_visibility) {
        // This contains visibility updates for all viewers who could see the swapped cards
        setCardVisibility(gameEvent.data.updated_visibility)
        
        // Now re-apply visibility to update the isTemporarilyViewed flags based on new visibility map
        const visibleCards = gameEvent.data.updated_visibility[currentUserId] || []
        
        // For King swaps, we know exactly which cards were swapped
        // Only make the swapped cards visible, not other cards of the same rank
        const swappedPlayerCard = gameEvent.data.player_card ? parseCardString(gameEvent.data.player_card, gameEvent.data.player_card_id) : null
        const swappedTargetCard = gameEvent.data.target_card ? parseCardString(gameEvent.data.target_card, gameEvent.data.target_card_id) : null
        
        // Update all player cards based on the new visibility
        const players = useGamePlayStore.getState().players
        players.forEach(player => {
          const updatedCards = player.cards.map((card, index) => {
            // Check if current user can see this card based on updated visibility
            const canSee = visibleCards.some((visibility) => {
              // Handle both array and object formats
              if (Array.isArray(visibility)) {
                const [targetId, cardIdx] = visibility
                if (targetId === player.id && cardIdx === index) {
                  // For King swap, verify this is actually the swapped card
                  if (player.id === gameEvent.data.player_id && index === gameEvent.data.player_index) {
                    // This position now has the target card
                    return swappedTargetCard && card.rank === swappedTargetCard.rank && card.suit === swappedTargetCard.suit
                  } else if (player.id === gameEvent.data.target_id && index === gameEvent.data.target_index) {
                    // This position now has the player card
                    return swappedPlayerCard && card.rank === swappedPlayerCard.rank && card.suit === swappedPlayerCard.suit
                  } else {
                    // Other visible cards not involved in the swap
                    return true
                  }
                }
                return false
              } else {
                return visibility.player_id === player.id && visibility.card_index === index
              }
            })
            
            // Update the card's visibility flag
            return {
              ...card,
              isTemporarilyViewed: canSee
            }
          })
          updatePlayerCards(player.id, updatedCards)
        })
      }
      
      setSpecialAction({
        type: 'KING_SWAP',
        playerId: gameEvent.data.player_id || '',
        targetPlayerId: gameEvent.data.target_id,
        isComplete: true
      })
      break
    }

    case 'king_swap_skipped': {
      setSpecialAction(null)
      break
    }

    case 'swap_skipped': {
      setSpecialAction(null)
      break
    }

    case 'special_action_timeout': {
      setSpecialAction(null)
      break
    }

    case 'game_ended': {
      // Import the store functions we need
      const { setEndGameData, setPhase } = useGamePlayStore.getState()
      
      // Set the endgame data
      setEndGameData({
        winnerId: gameEvent.data.winner_id,
        winnerName: gameEvent.data.winner_name,
        finalScores: gameEvent.data.final_scores,
        playerHands: gameEvent.data.player_hands,
        caboCaller: gameEvent.data.cabo_caller_id,
        countdownSeconds: 30  // Start with 30 seconds
      })
      
      setPhase(GamePhase.ENDED)
      // Also update room phase to show endgame view
      useRoomStore.getState().setPhase(RoomPhase.ENDED)
      break
    }
    
    case 'checkpoint_created': {
      // The checkpoint data is the entire event data
      const checkpoint = gameEvent.data
      
      // Process it like we do for game_checkpoint messages
      if (checkpoint.type === 'game_checkpoint' && checkpoint.game_state) {
        // Apply the checkpoint state (same logic as game_checkpoint message)
        const currentUserId = useAuthStore.getState().sessionId
        const gameState = checkpoint.game_state
        
        // Process players with visibility filtering
        const players = gameState.players.map(player => {
          const cards = player.cards.map((card, index) => {
            // Check if current user can see this card
            const visibleCards = gameState.card_visibility?.[currentUserId] || []
            const canSee = visibleCards.some((visibility) => {
              // Handle both array and object formats
              if (Array.isArray(visibility)) {
                const [targetId, cardIdx] = visibility
                return targetId === player.id && cardIdx === index
              } else {
                return visibility.player_id === player.id && visibility.card_index === index
              }
            })
            
            // During setup phase, players can see their first 2 cards
            const isOwnCard = player.id === currentUserId
            const isSetupPhase = gameState.phase === 'setup'
            const isSetupVisible = isOwnCard && isSetupPhase && index < 2
            
            // Keep the actual card data, just update visibility flag
            return {
              id: card.id,
              rank: card.rank,
              suit: card.suit,
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
        
        // Set deck cards (for animation tracking)
        if (gameState.deck_cards) {
          setDeckCards(gameState.deck_cards)
        }
        
        // Set drawn card if exists and belongs to current player
        if (gameState.drawn_card  ) {
          // drawn_card from checkpoint already has id, rank, suit fields
          setDrawnCard({
            id: gameState.drawn_card.id,
            rank: gameState.drawn_card.rank,
            suit: gameState.drawn_card.suit,
            isTemporarilyViewed: gameState.current_player === currentUserId
          })
        }
        
        // Set discard pile
        if (gameState.discard_top) {
          // discard_top from checkpoint already has id, rank, suit fields
          addCardToDiscard({
            id: gameState.discard_top.id,
            rank: gameState.discard_top.rank,
            suit: gameState.discard_top.suit,
            isTemporarilyViewed: false
          })
        }
        
        // Set special action with proper type conversion
        if (gameState.special_action_player && gameState.special_action_type) {
          setSpecialAction({
            type: convertSpecialActionType(gameState.special_action_type),
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
        // Update room phase using the room store
        useRoomStore.getState().setPhase(RoomPhase.IN_GAME)
      }
      break
    }

    default: {
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
  
  const navigate = useNavigate()
  
  const socketUrl = import.meta.env.VITE_WS_URL || 'wss://cabo.kashyap.ch/ws'

  const {
    sendMessage,
    lastMessage,
    readyState,
    getWebSocket
  } = useWebSocket(socketUrl, {
    share: true,  // Share the WebSocket connection across all hook instances
    shouldReconnect: (closeEvent) => {
      // Reconnect unless it was a manual close or auth failure
      return closeEvent.code !== 1000 && closeEvent.code !== 4001
    },
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    onOpen: () => {},
    onClose: (event) => {},
    onError: (event) => {},
  })

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage !== null) {
      const message: WebSocketMessage = JSON.parse(lastMessage.data)
      handleMessage(message)
    }
  }, [lastMessage])



  // Send a message to the WebSocket
  const sendWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (readyState === ReadyState.OPEN) {
      const messageStr = JSON.stringify(message)
      sendMessage(messageStr)
    }
  }, [sendMessage, readyState])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Handle sequence number deduplication
    if (message.seq_num !== undefined) {
      const currentSeq = useRoomStore.getState().currentSeq
      
      // Skip duplicate messages (same or older sequence number)
      if (message.seq_num <= currentSeq) {
        return
      }
      
      setCurrentSeq(message.seq_num)
    }
    
    switch (message.type) {
      case 'room_update': {
        const roomUpdate = message as RoomUpdateMessage
        
        // Apply room state
        const players = roomUpdate.room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          isHost: p.isHost
        }))
        setPlayers(players)
        setPhase(RoomPhase.WAITING)
        
        // Mark as ready since this is our initial state
        setIsReady(true)
        break
      }
      
      case 'game_event': {
        const gameEvent = message as GameEventMessage
        
        // Check if the event has the expected structure
        if (!gameEvent.event_type) {
          break
        }
        
        try {
          handleGameEvent(gameEvent)
        } catch (error) {
        }
        break
      }
      
      case 'player_joined': {
        const joinedMessage = message as PlayerJoinedMessage
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
        removePlayer(leftMessage.session_id)
        break
      }
      
      case 'player_nickname_updated': {
        // Update player nickname in room store (only needed for waiting room)
        const { player_id, nickname } = message
        const { updatePlayerNickname } = useRoomStore.getState()
        updatePlayerNickname(player_id, nickname)
        break
      }
      
      case 'ready': {
        const readyMessage = message as ReadyMessage
        setCurrentSeq(readyMessage.current_seq)
        setIsReady(true)
        break
      }
      
      case 'session_info': {
        const sessionMessage = message as SessionInfoMessage
        // Update auth store with session info
        useAuthStore.getState().setSessionInfo(sessionMessage.nickname, sessionMessage.session_id)
        break
      }
      

      
      case 'error': {
        break
      }
      
      case 'ping': {
        // Respond to server ping with pong
        sendWebSocketMessage({ type: 'pong' })
        break
      }
      
      case 'cleanup_countdown': {
        // Update countdown in endgame data
        const { updateCountdown } = useGamePlayStore.getState()
        const countdownMessage = message as { type: string; data: { remaining_seconds: number } }
        updateCountdown(countdownMessage.data.remaining_seconds)
        break
      }
      
      case 'redirect_home': {
        // Redirect to home page using router
        // Navigate to homepage first, then clear state
        navigate({ to: '/' })
        // Clear the game state after navigation starts
        setTimeout(() => {
          useGamePlayStore.getState().resetGameState()
          useRoomStore.getState().reset()
        }, 100)
        break
      }
      
      default:
        break
    }
  }, [addPlayer, removePlayer, setPlayers, setPhase, setCurrentSeq, setIsReady, sendWebSocketMessage, navigate])

  // Send ping to keep connection alive
  const sendPing = useCallback(() => {
    sendWebSocketMessage({ type: 'ping' })
  }, [sendWebSocketMessage])

  // Get session info
  const requestSessionInfo = useCallback(() => {
    sendWebSocketMessage({ type: 'get_session_info' })
  }, [sendWebSocketMessage])

  // Request session info when connected - but only once per connection
  useEffect(() => {
    let hasRequestedSession = false
    
    if (readyState === ReadyState.OPEN && !hasRequestedSession) {
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

  // Disconnect WebSocket cleanly
  const disconnect = useCallback(() => {
    const ws = getWebSocket()
    if (ws) {
      ws.close(1000, 'User leaving game')
    }
  }, [getWebSocket])

  return {
    sendMessage: sendWebSocketMessage,
    sendPing,
    requestSessionInfo,
    disconnect,
    isConnected,
    isConnecting,
    isDisconnected,
    connectionStatus,
    readyState,
    getWebSocket,
  }
}