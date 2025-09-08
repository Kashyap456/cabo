import {
  useGamePlayStore,
  GamePhase,
  type StackGiveTarget,
} from '../../stores/game_play_state'
import { useAuthStore } from '../../stores/auth'
import { useGameWebSocket } from '../../api/game_ws'
import { useCallback, useState, useEffect } from 'react'

interface ActionPanelProps {
  isMobile?: boolean
}

export default function ActionPanel({ isMobile = false }: ActionPanelProps) {
  const {
    phase,
    currentPlayerId,
    players,
    drawnCard,
    specialAction,
    stackCaller,
    stackGiveTarget,
  } = useGamePlayStore()

  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()

  const currentPlayer = players.find((p) => p.id === sessionId)
  const isMyTurn = currentPlayer && currentPlayer.id === currentPlayerId

  // Determine button states
  const canCallStack = () => {
    // Can call stack during turn_transition or waiting_for_special_action phases
    // But not if already in stack_called phase or stack_turn_transition
    return (
      (phase === GamePhase.TURN_TRANSITION ||
        phase === GamePhase.WAITING_FOR_SPECIAL_ACTION ||
        phase === GamePhase.KING_VIEW_PHASE ||
        phase === GamePhase.KING_SWAP_PHASE) &&
      phase !== GamePhase.STACK_TURN_TRANSITION &&
      !stackCaller
    )
  }

  const canSkip = () => {
    // Can skip during J/Q swap (swap_opponent) or king_swap_phase
    if (specialAction && isMyTurn) {
      if (
        (specialAction.type === 'SWAP_CARDS' &&
          phase === GamePhase.WAITING_FOR_SPECIAL_ACTION) ||
        phase === GamePhase.KING_SWAP_PHASE
      ) {
        return true
      }
    }

    // Can also skip during STACK_GIVE_CARD phase if you're the giver
    if (
      phase === GamePhase.STACK_GIVE_CARD &&
      stackGiveTarget?.fromPlayer === sessionId
    ) {
      return true
    }

    return false
  }

  const canCallCabo = () => {
    // Can only call cabo at the start of turn before drawing
    return (
      isMyTurn &&
      phase === GamePhase.DRAW_PHASE &&
      !drawnCard &&
      !players.some((p) => p.hasCalledCabo)
    )
  }

  // Handle Stack button click
  const handleStack = useCallback(() => {
    if (!canCallStack()) return

    // Just call stack - wait for backend to tell us if we won the race
    sendMessage({ type: 'call_stack' })
  }, [sendMessage, canCallStack])

  // Handle Skip button click
  const handleSkip = useCallback(() => {
    if (!canSkip()) return

    if (phase === GamePhase.STACK_GIVE_CARD) {
      // Skip giving card after opponent stack
      sendMessage({ type: 'skip_give_stack_card' })
    } else if (phase === GamePhase.KING_SWAP_PHASE) {
      // King swap skip
      sendMessage({ type: 'king_skip_swap' })
    } else if (specialAction?.type === 'SWAP_CARDS') {
      // J/Q swap skip
      sendMessage({ type: 'skip_swap' })
    }
  }, [sendMessage, canSkip, phase, specialAction])

  // Handle Cabo button click
  const handleCabo = useCallback(() => {
    if (!canCallCabo()) return

    sendMessage({ type: 'call_cabo' })
  }, [sendMessage, canCallCabo])

  if (!currentPlayer) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold mb-4">Actions</h3>
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border-2 border-yellow-600/60 ${isMobile ? 'p-1' : 'p-3'}`}
      style={{
        background:
          'linear-gradient(180deg, rgba(139, 69, 19, 0.95) 0%, rgba(101, 67, 33, 0.95) 100%)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Action buttons with wood/casino styling */}
        <button
          onClick={handleStack}
          disabled={!canCallStack()}
          className={`relative ${isMobile ? 'px-3 py-1 text-[10px]' : 'px-8 py-2 text-sm'} rounded-lg font-black tracking-wider transition-all transform ${
            canCallStack()
              ? 'hover:scale-105 hover:-translate-y-0.5'
              : 'cursor-not-allowed opacity-40'
          }`}
          style={{
            background: canCallStack()
              ? 'linear-gradient(180deg, #FF8C00 0%, #FF6F00 50%, #E65100 100%)'
              : 'linear-gradient(180deg, #424242 0%, #303030 100%)',
            boxShadow: canCallStack()
              ? '0 4px 15px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
              : 'none',
            border: '2px solid rgba(0, 0, 0, 0.2)',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
        >
          <span className="text-white">STACK</span>
        </button>

        <button
          onClick={handleSkip}
          disabled={!canSkip()}
          className={`relative ${isMobile ? 'px-3 py-1 text-[10px]' : 'px-8 py-2 text-sm'} rounded-lg font-black tracking-wider transition-all transform ${
            canSkip()
              ? 'hover:scale-105 hover:-translate-y-0.5'
              : 'cursor-not-allowed opacity-40'
          }`}
          style={{
            background: canSkip()
              ? 'linear-gradient(180deg, #FFD700 0%, #FFC107 50%, #FFA000 100%)'
              : 'linear-gradient(180deg, #424242 0%, #303030 100%)',
            boxShadow: canSkip()
              ? '0 4px 15px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
              : 'none',
            border: '2px solid rgba(0, 0, 0, 0.2)',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
          }}
        >
          <span className={canSkip() ? 'text-amber-900' : 'text-white'}>
            SKIP
          </span>
        </button>

        <button
          onClick={handleCabo}
          disabled={!canCallCabo()}
          className={`relative ${isMobile ? 'px-4 py-1 text-[10px]' : 'px-10 py-2 text-sm'} rounded-lg font-black tracking-wider transition-all transform ${
            canCallCabo()
              ? 'hover:scale-110 hover:-translate-y-0.5 animate-pulse'
              : 'cursor-not-allowed opacity-40'
          }`}
          style={{
            background: canCallCabo()
              ? 'linear-gradient(180deg, #DC143C 0%, #B71C1C 50%, #8B0000 100%)'
              : 'linear-gradient(180deg, #424242 0%, #303030 100%)',
            boxShadow: canCallCabo()
              ? '0 4px 20px rgba(220, 20, 60, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
              : 'none',
            border: '2px solid rgba(0, 0, 0, 0.3)',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
          }}
        >
          <span className={`text-white ${isMobile ? 'text-[11px]' : 'text-base'}`}>CABO!</span>
          {canCallCabo() && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

// Helper functions
function getPhaseDisplay(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.SETUP:
      return 'Setup'
    case GamePhase.DRAW_PHASE:
      return 'Draw Phase'
    case GamePhase.CARD_DRAWN:
      return 'Play Card'
    case GamePhase.WAITING_FOR_SPECIAL_ACTION:
      return 'Special Action'
    case GamePhase.KING_VIEW_PHASE:
      return 'King View'
    case GamePhase.KING_SWAP_PHASE:
      return 'King Swap'
    case GamePhase.STACK_CALLED:
      return 'Stack Called'
    case GamePhase.STACK_TURN_TRANSITION:
      return 'Stack Result'
    case GamePhase.TURN_TRANSITION:
      return 'Turn Transition'
    case GamePhase.ENDED:
      return 'Game Ended'
    default:
      return phase
  }
}

function getSpecialActionDisplay(type: string): string {
  switch (type) {
    case 'VIEW_OWN':
      return 'View Your Card (7/8)'
    case 'VIEW_OPPONENT':
      return "View Opponent's Card (9/10)"
    case 'SWAP_CARDS':
      return 'Swap Cards (J/Q)'
    case 'KING_VIEW':
      return 'King - View Any Card'
    case 'KING_SWAP':
      return 'King - Swap Cards'
    default:
      return type
  }
}
