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
  PLAYING = 'playing',
  WAITING_FOR_SPECIAL_ACTION = 'waiting_for_special_action',
  KING_VIEW_PHASE = 'king_view_phase',
  KING_SWAP_PHASE = 'king_swap_phase',
  STACK_CALLED = 'stack_called',
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

export interface GamePlayState {
  // Game state
  currentPlayerId: string
  phase: GamePhase
  turnNumber: number
  
  // Players and their cards
  players: PlayerGameState[]
  
  // Card visibility map: viewer_id -> [(target_player_id, card_index)]
  cardVisibility: { [viewerId: string]: Array<[string, number]> }
  
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
  
  // Cabo state
  caboCalledBy: string | null
  finalRoundStarted: boolean
  
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
  setCalledCabo: (playerId: string) => void
  resetGameState: () => void
  setDiscardPile: (cards: Card[]) => void
  
  // Helper functions
  getCurrentPlayer: () => PlayerGameState | null
  getPlayerById: (id: string) => PlayerGameState | null
  canCallStack: () => boolean
  hasStackCaller: () => boolean
  isCardSelectable: (playerId: string, cardIndex: number) => boolean
}

export const useGamePlayStore = create<GamePlayState>((set, get) => ({
  // Initial state
  currentPlayerId: '',
  phase: GamePhase.SETUP,
  turnNumber: 1,
  players: [],
  cardVisibility: {},
  discardPile: [],
  topDiscardCard: null,
  drawnCard: null,
  specialAction: null,
  selectedCards: [],
  stackCaller: null,
  caboCalledBy: null,
  finalRoundStarted: false,
  
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
    discardPile: [],
    topDiscardCard: null,
    drawnCard: null,
    specialAction: null,
    selectedCards: [],
    stackCaller: null,
    caboCalledBy: null,
    finalRoundStarted: false
  }),
  
  setDiscardPile: (cards) => set({
    discardPile: cards,
    topDiscardCard: cards.length > 0 ? cards[cards.length - 1] : null
  }),
  
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
    // Can call stack during PLAYING or WAITING_FOR_SPECIAL_ACTION phases
    // Cannot call stack if already in STACK_CALLED phase
    return (state.phase === GamePhase.PLAYING || 
            state.phase === GamePhase.WAITING_FOR_SPECIAL_ACTION ||
            state.phase === GamePhase.KING_VIEW_PHASE ||
            state.phase === GamePhase.KING_SWAP_PHASE) &&
           state.phase !== GamePhase.STACK_CALLED
  },
  
  hasStackCaller: () => {
    const state = get()
    return state.stackCaller !== null
  },
  
  isCardSelectable: (playerId, cardIndex) => {
    const state = get()
    const { phase, specialAction, currentPlayerId, stackCaller } = state
    
    // Check if we're in stack selection mode
    if (phase === GamePhase.STACK_CALLED && stackCaller?.playerId === currentPlayerId) {
      // During stack, can select any card (own or opponent's)
      return true
    }
    
    // Not selectable if no special action or not in the right phase
    if (!specialAction || 
        (phase !== GamePhase.WAITING_FOR_SPECIAL_ACTION && 
         phase !== GamePhase.KING_VIEW_PHASE && 
         phase !== GamePhase.KING_SWAP_PHASE)) {
      return false
    }
    
    // Only the current player can select during their special action
    if (specialAction.playerId !== currentPlayerId) {
      return false
    }
    
    // Check based on special action type
    switch (specialAction.type) {
      case 'VIEW_OWN':
        // Can only select own cards
        return playerId === currentPlayerId
      case 'VIEW_OPPONENT':
        // Can only select opponent cards
        return playerId !== currentPlayerId
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

export const isCardKnown = (card: Card): boolean => {
  return card.rank !== '?' && card.suit !== '?'
}

export const getCardDisplayValue = (card: Card, alwaysShow = false): string => {
  // Check if we should show the card value
  if (!isCardKnown(card)) return '?'
  
  // For player cards, only show if temporarily viewed or if alwaysShow is true
  if (!alwaysShow && !card.isTemporarilyViewed) return '?'
  
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
  if (!isCardKnown(card)) return 0
  
  if (card.rank === Rank.JOKER) return 0
  if (card.rank === Rank.KING && (card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS)) {
    return -1  // Red Kings
  }
  
  return card.rank as number
}