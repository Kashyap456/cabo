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

export interface StackCall {
  playerId: string
  nickname: string
  cardPlayed?: Card  // The card they're attempting to stack with
  isSuccessful?: boolean
  timestamp: number  // When the stack call was made
}

export interface GamePlayState {
  // Game state
  currentPlayerId: string
  phase: GamePhase
  turnNumber: number
  
  // Players and their cards
  players: PlayerGameState[]
  
  // Discard pile
  discardPile: Card[]
  topDiscardCard: Card | null
  
  // Drawn card (visible only to the player who drew it)
  drawnCard: Card | null
  
  // Special states
  specialAction: SpecialAction | null
  
  // Stack calls can happen during special actions
  stackCalls: StackCall[]
  pendingStackCall: StackCall | null  // The first stack call that will be processed
  
  // Cabo state
  caboCalledBy: string | null
  finalRoundStarted: boolean
  
  // Actions
  setCurrentPlayer: (playerId: string) => void
  setPhase: (phase: GamePhase) => void
  setPlayers: (players: PlayerGameState[]) => void
  updatePlayerCards: (playerId: string, cards: Card[]) => void
  addCardToDiscard: (card: Card) => void
  setDrawnCard: (card: Card | null) => void
  setSpecialAction: (action: SpecialAction | null) => void
  addStackCall: (stackCall: StackCall) => void
  setPendingStackCall: (stackCall: StackCall | null) => void
  clearStackCalls: () => void
  setCalledCabo: (playerId: string) => void
  resetGameState: () => void
  setDiscardPile: (cards: Card[]) => void
  
  // Helper functions
  getCurrentPlayer: () => PlayerGameState | null
  getPlayerById: (id: string) => PlayerGameState | null
  canCallStack: () => boolean
  hasStackCalls: () => boolean
}

export const useGamePlayStore = create<GamePlayState>((set, get) => ({
  // Initial state
  currentPlayerId: '',
  phase: GamePhase.SETUP,
  turnNumber: 1,
  players: [],
  discardPile: [],
  topDiscardCard: null,
  drawnCard: null,
  specialAction: null,
  stackCalls: [],
  pendingStackCall: null,
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
  
  addCardToDiscard: (card) => set((state) => ({
    discardPile: [...state.discardPile, card],
    topDiscardCard: card
  })),
  
  setDrawnCard: (card) => set((state) => {
    console.log('Setting drawn card:', card)
    return { drawnCard: card }
  }),
  
  setSpecialAction: (action) => set({ specialAction: action }),
  
  addStackCall: (stackCall) => set((state) => {
    const newStackCalls = [...state.stackCalls, stackCall]
    return {
      stackCalls: newStackCalls,
      // Set pending stack call to the first one if none exists
      pendingStackCall: state.pendingStackCall || stackCall
    }
  }),
  
  setPendingStackCall: (stackCall) => set({ pendingStackCall: stackCall }),
  
  clearStackCalls: () => set({ stackCalls: [], pendingStackCall: null }),
  
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
    discardPile: [],
    topDiscardCard: null,
    drawnCard: null,
    specialAction: null,
    stackCalls: [],
    pendingStackCall: null,
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
  
  hasStackCalls: () => {
    const state = get()
    return state.stackCalls.length > 0
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

export const getCardDisplayValue = (card: Card): string => {
  if (!isCardKnown(card)) return '?'
  
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