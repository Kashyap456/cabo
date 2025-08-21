import { useGamePlayStore, GamePhase } from '../../stores/game_play_state'
import { useAuthStore } from '../../stores/auth'
import { useGameWebSocket } from '../../api/game_ws'
import { useCallback, useState, useEffect } from 'react'

export default function ActionPanel() {
  const { 
    phase, 
    currentPlayerId, 
    players, 
    drawnCard,
    specialAction,
    stackCaller
  } = useGamePlayStore()

  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  
  const currentPlayer = players.find((p) => p.id === sessionId)
  const isMyTurn = currentPlayer && currentPlayer.id === currentPlayerId
  

  // Determine button states
  const canCallStack = () => {
    // Can call stack during turn_transition or waiting_for_special_action phases
    // But not if already in stack_called phase
    return (phase === GamePhase.TURN_TRANSITION || 
            phase === GamePhase.WAITING_FOR_SPECIAL_ACTION ||
            phase === GamePhase.KING_VIEW_PHASE ||
            phase === GamePhase.KING_SWAP_PHASE) &&
           phase !== GamePhase.STACK_CALLED
  }

  const canSkip = () => {
    // Can skip during J/Q swap (swap_opponent) or king_swap_phase
    if (!isMyTurn || !specialAction) return false
    
    return (specialAction.type === 'SWAP_CARDS' && 
            phase === GamePhase.WAITING_FOR_SPECIAL_ACTION) ||
           (phase === GamePhase.KING_SWAP_PHASE)
  }

  const canCallCabo = () => {
    // Can only call cabo at the start of turn before drawing
    return isMyTurn && 
           phase === GamePhase.PLAYING && 
           !drawnCard &&
           !players.some(p => p.hasCalledCabo)
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
    
    if (phase === GamePhase.KING_SWAP_PHASE) {
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
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4">Actions</h3>

      {/* Main action buttons */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          onClick={handleStack}
          disabled={!canCallStack()}
          className={`px-4 py-3 rounded-lg font-medium transition-all ${
            canCallStack()
              ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Stack
        </button>

        <button
          onClick={handleSkip}
          disabled={!canSkip()}
          className={`px-4 py-3 rounded-lg font-medium transition-all ${
            canSkip()
              ? 'bg-yellow-600 text-white hover:bg-yellow-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Skip
        </button>

        <button
          onClick={handleCabo}
          disabled={!canCallCabo()}
          className={`px-4 py-3 rounded-lg font-medium transition-all ${
            canCallCabo()
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Cabo!
        </button>
      </div>

      {/* Stack selection mode indicator */}
      {phase === GamePhase.STACK_CALLED && stackCaller?.playerId === sessionId && (
        <div className="mb-4 p-3 bg-orange-100 border-2 border-orange-400 rounded-lg">
          <p className="text-sm font-medium text-orange-800">
            Select a card to stack (yours or an opponent's)
          </p>
        </div>
      )}

      {/* Stack caller display */}
      {stackCaller && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm font-semibold text-blue-900">
            Stack Called By: {stackCaller.nickname} {stackCaller.playerId === sessionId && '(You)'}
          </p>
        </div>
      )}

      {/* Phase and Turn Info */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600 space-y-1">
          <p><span className="font-medium">Phase:</span> {getPhaseDisplay(phase)}</p>
          <p><span className="font-medium">Current Player:</span> {
            isMyTurn ? 'Your Turn' : players.find(p => p.id === currentPlayerId)?.nickname || 'Unknown'
          }</p>
          {drawnCard && isMyTurn && (
            <p className="text-green-600 font-medium">Card drawn - Play or Replace</p>
          )}
          {specialAction && (
            <p className="text-purple-600 font-medium">
              Special Action: {getSpecialActionDisplay(specialAction.type)}
            </p>
          )}
        </div>
      </div>

    </div>
  )
}

// Helper functions
function getPhaseDisplay(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.SETUP: return 'Setup'
    case GamePhase.PLAYING: return 'Playing'
    case GamePhase.WAITING_FOR_SPECIAL_ACTION: return 'Special Action'
    case GamePhase.KING_VIEW_PHASE: return 'King View'
    case GamePhase.KING_SWAP_PHASE: return 'King Swap'
    case GamePhase.STACK_CALLED: return 'Stack Called'
    case GamePhase.TURN_TRANSITION: return 'Turn Transition'
    case GamePhase.ENDED: return 'Game Ended'
    default: return phase
  }
}

function getSpecialActionDisplay(type: string): string {
  switch (type) {
    case 'VIEW_OWN': return 'View Your Card (7/8)'
    case 'VIEW_OPPONENT': return "View Opponent's Card (9/10)"
    case 'SWAP_CARDS': return 'Swap Cards (J/Q)'
    case 'KING_VIEW': return 'King - View Any Card'
    case 'KING_SWAP': return 'King - Swap Cards'
    default: return type
  }
}