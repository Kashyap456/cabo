import { create } from 'zustand'

export enum Suit {
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
  SPADES = 'spades'
}

export enum Rank {
  ACE = 1,
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
  SIX = 6,
  SEVEN = 7,
  EIGHT = 8,
  NINE = 9,
  TEN = 10,
  JACK = 11,
  QUEEN = 12,
  KING = 13,
  JOKER = 0
}

export interface Card {
  id: string
  rank: Rank | '?'  // '?' for unknown cards
  suit: Suit | '?' | null  // '?' for unknown cards, null for jokers
  isTemporarilyViewed?: boolean
  isBeingViewed?: boolean  // True when someone is currently viewing this card
}

export interface PlayerGameState {
  id: string
  nickname: string
  cards: Card[]  // All cards (known and unknown)
  hasCalledCabo: boolean
}

// Match backend game phases
export enum GamePhase {
  SETUP = 'setup',
  DRAW_PHASE = 'draw_phase',  // Can draw a card or call cabo
  CARD_DRAWN = 'card_drawn',  // Must play or replace the drawn card
  WAITING_FOR_SPECIAL_ACTION = 'waiting_for_special_action',
  KING_VIEW_PHASE = 'king_view_phase',
  KING_SWAP_PHASE = 'king_swap_phase',
  STACK_CALLED = 'stack_called',
  STACK_GIVE_CARD = 'stack_give_card',  // After successful opponent stack, choose card to give
  STACK_TURN_TRANSITION = 'stack_turn_transition',  // Show stack card after failure, prevent stacking
  TURN_TRANSITION = 'turn_transition',
  ENDED = 'ended'
}

export interface SpecialAction {
  type: 'VIEW_OWN' | 'VIEW_OPPONENT' | 'SWAP_CARDS' | 'KING_VIEW' | 'KING_SWAP'
  playerId: string
  targetPlayerId?: string
  cardPositions?: number[]
  isComplete: boolean
}

export interface CardSelection {
  playerId: string
  cardIndex: number
}

export interface StackCaller {
  playerId: string
  nickname: string
  timestamp: number  // When the stack call was made
}

export interface StackGiveTarget {
  fromPlayer: string  // Who is giving the card
  toPlayer: string    // Who is receiving the card
  targetCardIndex?: number  // Where the target's card was removed from
}

export interface EndGameData {
  winnerId: string
  winnerName: string
  finalScores: Array<{
    player_id: string
    name: string
    score: number
  }>
  playerHands: { [playerId: string]: Array<{
    rank: string
    suit: string | null
    value: number
  }> }
  caboCaller?: string
  countdownSeconds?: number
}

export interface GamePlayState {
  // Game state
  currentPlayerId: string
  phase: GamePhase
  turnNumber: number
  
  // Players and their cards
  players: PlayerGameState[]
  
  // Card visibility map: viewer_id -> [(target_player_id, card_index)]
  cardVisibility: { [viewerId: string]: Array<[string, number]> }
  
  // Deck (card IDs still in deck)
  deckCards: string[]
  
  // Discard pile
  discardPile: Card[]
  topDiscardCard: Card | null
  
  // Drawn card (visible only to the player who drew it)
  drawnCard: Card | null
  
  // Special states
  specialAction: SpecialAction | null
  
  // Card selection for special actions
  selectedCards: CardSelection[]
  
  // Stack caller - only one can win the race
  stackCaller: StackCaller | null
  
  // Stack give target - for opponent stack success
  stackGiveTarget: StackGiveTarget | null
  
  // Currently being viewed card (for visual indication)
  viewingIndicator: { playerId: string; cardIndex: number } | null
  
  // Cabo state
  caboCalledBy: string | null
  finalRoundStarted: boolean
  
  // Endgame state
  endGameData: EndGameData | null
  
  // Drawn card state
  clearDrawnCard: boolean
  
  // Actions
  setCurrentPlayer: (playerId: string) => void
  setPhase: (phase: GamePhase) => void
  setPlayers: (players: PlayerGameState[]) => void
  updatePlayerCards: (playerId: string, cards: Card[]) => void
  setCardVisibility: (visibility: { [viewerId: string]: Array<[string, number]> }) => void
  addVisibleCard: (viewerId: string, targetId: string, cardIndex: number) => void
  addCardToDiscard: (card: Card) => void
  setDrawnCard: (card: Card | null) => void
  setSpecialAction: (action: SpecialAction | null) => void
  selectCard: (playerId: string, cardIndex: number) => void
  clearSelectedCards: () => void
  setStackCaller: (stackCaller: StackCaller | null) => void
  clearStackCaller: () => void
  setStackGiveTarget: (target: StackGiveTarget | null) => void
  setViewingIndicator: (indicator: { playerId: string; cardIndex: number } | null) => void
  setCalledCabo: (playerId: string) => void
  resetGameState: () => void
  setDiscardPile: (cards: Card[]) => void
  setEndGameData: (data: EndGameData) => void
  updateCountdown: (seconds: number) => void
  setDeckCards: (cardIds: string[]) => void
  setClearDrawnCard: (shouldClear: boolean) => void
  
  // Helper functions
  getCurrentPlayer: () => PlayerGameState | null
  getPlayerById: (id: string) => PlayerGameState | null
  canCallStack: () => boolean
  hasStackCaller: () => boolean
  isCardSelectable: (playerId: string, cardIndex: number, sessionId?: string) => boolean
  replaceAndPlayCard: (playerId: string, handIndex: number, drawnCardId: string) => void
  swapCards: (playerId: string, targetPlayerId: string, cardIndex1: number, cardIndex2: number) => void
}

export const useGamePlayStore = create<GamePlayState>((set, get) => ({
  // Initial state
  currentPlayerId: '',
  phase: GamePhase.SETUP,
  turnNumber: 1,
  players: [],
  cardVisibility: {},
  deckCards: [],
  discardPile: [],
  topDiscardCard: null,
  drawnCard: null,
  specialAction: null,
  selectedCards: [],
  stackCaller: null,
  stackGiveTarget: null,
  viewingIndicator: null,
  caboCalledBy: null,
  finalRoundStarted: false,
  endGameData: null,
  clearDrawnCard: false,
  
  // Actions
  setCurrentPlayer: (playerId) => set((state) => {
    // Clear drawn card when turn changes to a different player
    const shouldClearDrawnCard = state.currentPlayerId !== playerId
    return {
      currentPlayerId: playerId,
      drawnCard: shouldClearDrawnCard ? null : state.drawnCard
    }
  }),
  setPhase: (phase) => set({ phase }),
  setPlayers: (players) => set({ players }),
  
  updatePlayerCards: (playerId, cards) => set((state) => ({
    players: state.players.map(p => 
      p.id === playerId ? { ...p, cards } : p
    )
  })),
  
  setCardVisibility: (visibility) => set({ cardVisibility: visibility }),
  
  addVisibleCard: (viewerId, targetId, cardIndex) => set((state) => {
    const currentVisibility = state.cardVisibility[viewerId] || []
    // Check if already visible
    const alreadyVisible = currentVisibility.some(
      ([t, i]) => t === targetId && i === cardIndex
    )
    if (alreadyVisible) return state
    
    return {
      cardVisibility: {
        ...state.cardVisibility,
        [viewerId]: [...currentVisibility, [targetId, cardIndex] as [string, number]]
      }
    }
  }),
  
  addCardToDiscard: (card) => set((state) => ({
    discardPile: [...state.discardPile, card],
    topDiscardCard: card
  })),
  
  setDrawnCard: (card) => set((state) => {
    console.log('Setting drawn card:', card)
    return { drawnCard: card }
  }),
  
  setSpecialAction: (action) => set({ specialAction: action, selectedCards: [] }),
  
  selectCard: (playerId, cardIndex) => set((state) => {
    // Check if this card is already selected
    const existingIndex = state.selectedCards.findIndex(
      s => s.playerId === playerId && s.cardIndex === cardIndex
    )
    
    if (existingIndex >= 0) {
      // Deselect if already selected
      return {
        selectedCards: state.selectedCards.filter((_, i) => i !== existingIndex)
      }
    }
    
    // Add to selection
    return {
      selectedCards: [...state.selectedCards, { playerId, cardIndex }]
    }
  }),
  
  clearSelectedCards: () => set({ selectedCards: [] }),
  
  setStackCaller: (stackCaller) => set({ stackCaller }),
  
  clearStackCaller: () => set({ stackCaller: null }),
  
  setStackGiveTarget: (target) => set({ stackGiveTarget: target }),
  
  setViewingIndicator: (indicator) => set({ viewingIndicator: indicator }),
  
  setCalledCabo: (playerId) => set((state) => ({
    players: state.players.map(p =>
      p.id === playerId ? { ...p, hasCalledCabo: true } : p
    ),
    caboCalledBy: playerId,
    finalRoundStarted: true
  })),
  
  resetGameState: () => set({
    currentPlayerId: '',
    phase: GamePhase.SETUP,
    turnNumber: 1,
    players: [],
    cardVisibility: {},
    deckCards: [],
    discardPile: [],
    topDiscardCard: null,
    drawnCard: null,
    specialAction: null,
    selectedCards: [],
    stackCaller: null,
    stackGiveTarget: null,
    caboCalledBy: null,
    finalRoundStarted: false,
    endGameData: null
  }),
  
  setDiscardPile: (cards) => set({
    discardPile: cards,
    topDiscardCard: cards.length > 0 ? cards[cards.length - 1] : null
  }),
  
  setEndGameData: (data) => set({ endGameData: data }),
  
  setDeckCards: (cardIds) => set({ deckCards: cardIds }),

  setClearDrawnCard: (shouldClear) => set({ clearDrawnCard: shouldClear }),
  
  updateCountdown: (seconds) => set((state) => ({
    endGameData: state.endGameData ? { ...state.endGameData, countdownSeconds: seconds } : null
  })),
  
  // Helper functions
  getCurrentPlayer: () => {
    const state = get()
    return state.players.find(p => p.id === state.currentPlayerId) || null
  },
  
  getPlayerById: (id) => {
    const state = get()
    return state.players.find(p => p.id === id) || null
  },
  
  canCallStack: () => {
    const state = get()
    // Can call stack after a card is played (turn transition or special action phases)
    // Cannot call stack during draw/play phases, stack phase, or stack_turn_transition
    return (state.phase === GamePhase.TURN_TRANSITION || 
            state.phase === GamePhase.WAITING_FOR_SPECIAL_ACTION ||
            state.phase === GamePhase.KING_VIEW_PHASE ||
            state.phase === GamePhase.KING_SWAP_PHASE) &&
           state.phase !== GamePhase.STACK_CALLED &&
           state.phase !== GamePhase.STACK_TURN_TRANSITION
  },
  
  hasStackCaller: () => {
    const state = get()
    return state.stackCaller !== null
  },
  
  isCardSelectable: (playerId, cardIndex, sessionId) => {
    const state = get()
    const { phase, specialAction, currentPlayerId, stackCaller, stackGiveTarget } = state
    
    // Check if we're in stack selection mode
    // sessionId should be the current user's session ID
    if (phase === GamePhase.STACK_CALLED && stackCaller?.playerId === sessionId) {
      // During stack, the stack caller can select any card (own or opponent's)
      return true
    }
    
    // Check if we're in stack give card phase
    if (phase === GamePhase.STACK_GIVE_CARD && stackGiveTarget?.fromPlayer === sessionId) {
      // Can only select own cards to give
      return playerId === sessionId
    }
    
    // Not selectable if no special action or not in the right phase
    if (!specialAction || 
        (phase !== GamePhase.WAITING_FOR_SPECIAL_ACTION && 
         phase !== GamePhase.KING_VIEW_PHASE && 
         phase !== GamePhase.KING_SWAP_PHASE)) {
      return false
    }
    
    // Only the current player can select during their special action
    // Use sessionId to check if the current user is the one with the special action
    if (specialAction.playerId !== sessionId) {
      return false
    }
    
    // Check based on special action type
    switch (specialAction.type) {
      case 'VIEW_OWN':
        // Can only select own cards
        return playerId === sessionId
      case 'VIEW_OPPONENT':
        // Can only select opponent cards
        return playerId !== sessionId
      case 'SWAP_CARDS':
        // Can select any card (own or opponent)
        return true
      case 'KING_VIEW':
        // Can view any card
        return true
      case 'KING_SWAP':
        // Can select any card for swapping
        return true
      default:
        return false
    }
  },

  replaceAndPlayCard: (playerId: string, handIndex: number, drawnCardId: string) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    if (!player) return
    
    const updatedCards = [...player.cards]
    const oldCard = updatedCards[handIndex]
    updatedCards[handIndex] = {
      ...state.drawnCard,
      id: drawnCardId,
      isTemporarilyViewed: false
    }
    
    set((state) => ({
      discardPile: [...state.discardPile, oldCard],
      topDiscardCard: oldCard,
      players: state.players.map(p =>
        p.id === playerId ? { ...p, cards: updatedCards } : p
      ),
      drawnCard: null
    }))
  },

  swapCards: (playerId: string, targetPlayerId: string, cardIndex1: number, cardIndex2: number) => {
    const state = get()
    const player = state.players.find(p => p.id === playerId)
    const targetPlayer = state.players.find(p => p.id === targetPlayerId)
    if (!player || !targetPlayer) return
    
    const updatedCards = [...player.cards]
    const updatedTargetCards = [...targetPlayer.cards]
    
    const card1 = updatedCards[cardIndex1]
    const card2 = updatedTargetCards[cardIndex2]
    
    updatedCards[cardIndex1] = card2
    updatedTargetCards[cardIndex2] = card1
    
    set((state) => ({
      players: state.players.map(p =>
        p.id === playerId ? { ...p, cards: updatedCards } : 
        p.id === targetPlayerId ? { ...p, cards: updatedTargetCards } : p
      ),
      drawnCard: null
    }))
  }
}))

// Helper functions to work with cards
export const createUnknownCard = (id: string): Card => ({
  id,
  rank: '?',
  suit: '?'
})

export const createKnownCard = (id: string, rank: Rank, suit: Suit | null, isTemporarilyViewed = false): Card => ({
  id,
  rank,
  suit,
  isTemporarilyViewed
})

export const getCardDisplayValue = (card: Card): string => {
  if (card.rank === Rank.JOKER) return 'Joker'
  
  const suitSymbol = {
    [Suit.HEARTS]: '♥',
    [Suit.DIAMONDS]: '♦',
    [Suit.CLUBS]: '♣',
    [Suit.SPADES]: '♠'
  }[card.suit as Suit] || ''
  
  return `${card.rank}${suitSymbol}`
}

export const getCardValue = (card: Card): number => {
  if (card.rank === Rank.JOKER) return 0
  if (card.rank === Rank.KING && (card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS)) {
    return -1  // Red Kings
  }
  
  return card.rank as number
}