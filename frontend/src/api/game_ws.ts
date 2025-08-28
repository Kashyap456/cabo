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
    setCalledCabo,
    getPlayerById,
    updatePlayerCards,
    setPlayers,
    addVisibleCard
  } = useGamePlayStore.getState()


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
      // Also update room phase to show playing view
      useRoomStore.getState().setPhase(RoomPhase.IN_GAME)
      break
    }

    case 'game_phase_changed': {
      console.log('Game phase changed to:', gameEvent.data.phase, 'with data:', gameEvent.data)
      const newPhase = gameEvent.data.phase
      
      // Validate phase is a valid GamePhase value
      if (!Object.values(GamePhase).includes(newPhase)) {
        console.error('Invalid game phase received:', newPhase)
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
      if (newPhase === 'turn_transition' || newPhase === 'stack_called') {
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
      console.log('Turn changed to player:', gameEvent.data.current_player_name)
      const currentUserId = useAuthStore.getState().sessionId
      const { setCardVisibility } = useGamePlayStore.getState()
      setCurrentPlayer(gameEvent.data.current_player)
      
      // When turn changes, we're in the draw phase
      setPhase(GamePhase.DRAW_PHASE)
      
      // Clear special action when turn changes
      setSpecialAction(null)
      
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
          // Parse and add the given card to target
          const parsedCard = parseCardString(gameEvent.data.given_card)
          const newCard = {
            ...parsedCard,
            id: `${gameEvent.data.target_id}_${target.cards.length}`,
            isTemporarilyViewed: false
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
      console.log('Stack failed by:', gameEvent.data.player, 'penalty:', gameEvent.data.penalty_card)
      
      // Player drew a penalty card
      const player = getPlayerById(gameEvent.data.player_id)
      if (player && gameEvent.data.penalty_card) {
        // Parse the penalty card from backend
        const parsedCard = parseCardString(gameEvent.data.penalty_card)
        const penaltyCard = {
          ...parsedCard,
          id: `${gameEvent.data.player_id}_${player.cards.length}`,
          isTemporarilyViewed: false
        } as GameCard
        const updatedCards = [...player.cards, penaltyCard]
        updatePlayerCards(gameEvent.data.player_id, updatedCards)
      }
      
      // Clear stack caller and continue game
      clearStackCaller()
      break
    }

    case 'stack_timeout': {
      console.log('Stack timed out for:', gameEvent.data.player, 'penalty:', gameEvent.data.penalty_card)
      
      // Player who timed out gets a penalty card
      const player = getPlayerById(gameEvent.data.player_id)
      if (player && gameEvent.data.penalty_card) {
        // Parse the penalty card from backend
        const parsedCard = parseCardString(gameEvent.data.penalty_card)
        const penaltyCard = {
          ...parsedCard,
          id: `${gameEvent.data.player_id}_${player.cards.length}`,
          isTemporarilyViewed: false
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
      console.log('Cards swapped between:', gameEvent.data.player, 'and:', gameEvent.data.target)
      const { updatePlayerCards, getPlayerById, setCardVisibility } = useGamePlayStore.getState()
      const currentUserId = useAuthStore.getState().sessionId
      
      // Swap the cards in the frontend state
      const player = getPlayerById(gameEvent.data.player_id)
      const target = getPlayerById(gameEvent.data.target_id)
      
      if (player && target && gameEvent.data.player_index !== undefined && gameEvent.data.target_index !== undefined) {
        // Make copies of the card arrays
        const playerCards = [...player.cards]
        const targetCards = [...target.cards]
        
        // Swap the cards at the specified indices
        const tempCard = playerCards[gameEvent.data.player_index]
        playerCards[gameEvent.data.player_index] = targetCards[gameEvent.data.target_index]
        targetCards[gameEvent.data.target_index] = tempCard
        
        // Update both players' cards
        updatePlayerCards(gameEvent.data.player_id, playerCards)
        updatePlayerCards(gameEvent.data.target_id, targetCards)
      }
      
      // Update visibility for all players affected by the swap
      if (gameEvent.data.updated_visibility) {
        syncCardVisibility(gameEvent.data.updated_visibility)
      }
      
      // Update player cards if the data includes the new card states (legacy support)
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
      console.log('King cards swapped between:', gameEvent.data.player, 'and:', gameEvent.data.target)
      const { updatePlayerCards, getPlayerById, setCardVisibility } = useGamePlayStore.getState()
      const currentUserId = useAuthStore.getState().sessionId
      
      // Swap the cards in the frontend state
      const player = getPlayerById(gameEvent.data.player_id)
      const target = getPlayerById(gameEvent.data.target_id)
      
      if (player && target && gameEvent.data.player_index !== undefined && gameEvent.data.target_index !== undefined) {
        // Make copies of the card arrays
        const playerCards = [...player.cards]
        const targetCards = [...target.cards]
        
        // For the current user, if they can see the swapped cards, use the actual card data
        // Otherwise, swap the unknown cards
        if (gameEvent.data.player_id === currentUserId || gameEvent.data.target_id === currentUserId) {
          // Parse the actual card data sent from backend
          const playerCardData = gameEvent.data.target_card ? parseCardString(gameEvent.data.target_card) : targetCards[gameEvent.data.target_index]
          const targetCardData = gameEvent.data.player_card ? parseCardString(gameEvent.data.player_card) : playerCards[gameEvent.data.player_index]
          
          // Swap with actual card data, preserving IDs
          playerCards[gameEvent.data.player_index] = {
            ...playerCardData,
            id: playerCards[gameEvent.data.player_index].id
          }
          targetCards[gameEvent.data.target_index] = {
            ...targetCardData,
            id: targetCards[gameEvent.data.target_index].id
          }
        } else {
          // For other players, just swap the cards as-is
          const tempCard = playerCards[gameEvent.data.player_index]
          playerCards[gameEvent.data.player_index] = targetCards[gameEvent.data.target_index]
          targetCards[gameEvent.data.target_index] = tempCard
        }
        
        // Update both players' cards
        updatePlayerCards(gameEvent.data.player_id, playerCards)
        updatePlayerCards(gameEvent.data.target_id, targetCards)
      }
      
      // Update visibility for all players affected by the King swap
      if (gameEvent.data.updated_visibility) {
        // This contains visibility updates for all viewers who could see the swapped cards
        setCardVisibility(gameEvent.data.updated_visibility)
        
        // Now re-apply visibility to update the isTemporarilyViewed flags based on new visibility map
        const visibleCards = gameEvent.data.updated_visibility[currentUserId] || []
        
        // For King swaps, we know exactly which cards were swapped
        // Only make the swapped cards visible, not other cards of the same rank
        const swappedPlayerCard = gameEvent.data.player_card ? parseCardString(gameEvent.data.player_card) : null
        const swappedTargetCard = gameEvent.data.target_card ? parseCardString(gameEvent.data.target_card) : null
        
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
      console.log('Received checkpoint event')
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
        
        // Set drawn card if exists and belongs to current player
        if (gameState.drawn_card && gameState.current_player === currentUserId) {
          setDrawnCard(parseCardString(gameState.drawn_card))
        } else {
          setDrawnCard(null)
        }
        
        // Set discard pile
        if (gameState.discard_top) {
          addCardToDiscard(parseCardString(gameState.discard_top))
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
    
    // Handle sequence number deduplication
    if (message.seq_num !== undefined) {
      const currentSeq = useRoomStore.getState().currentSeq
      
      // Skip duplicate messages (same or older sequence number)
      if (message.seq_num <= currentSeq) {
        console.log(`Skipping duplicate message with seq_num ${message.seq_num} (current: ${currentSeq})`)
        return
      }
      
      setCurrentSeq(message.seq_num)
    }
    
    switch (message.type) {
      case 'room_update': {
        const roomUpdate = message as RoomUpdateMessage
        console.log('Received room update')
        
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
        
        // Set drawn card if exists and belongs to current player
        if (gameState.drawn_card && gameState.current_player === currentUserId) {
          setDrawnCard(parseCardString(gameState.drawn_card))
        } else {
          setDrawnCard(null)
        }
        
        // Set discard pile
        if (gameState.discard_top) {
          addCardToDiscard(parseCardString(gameState.discard_top))
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
        
        break
      }
      
      // room_in_game_state removed - handled by game_checkpoint above
      
      case 'game_event': {
        const gameEvent = message as GameEventMessage
        console.log('Received game event:', gameEvent.event_type, gameEvent.data)
        console.log('Full game event message:', JSON.stringify(gameEvent, null, 2))
        
        // Check if the event has the expected structure
        if (!gameEvent.event_type) {
          console.error('Game event missing event_type:', gameEvent)
          break
        }
        
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
      
      case 'cleanup_countdown': {
        // Update countdown in endgame data
        const { updateCountdown } = useGamePlayStore.getState()
        const countdownMessage = message as { type: string; data: { remaining_seconds: number } }
        updateCountdown(countdownMessage.data.remaining_seconds)
        break
      }
      
      case 'redirect_home': {
        // Redirect to home page using router
        console.log('Game cleanup complete, redirecting to home...')
        // The EndGameView component handles navigation via the router
        // We just clear the game state
        useGamePlayStore.getState().resetGameState()
        useRoomStore.getState().reset()
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