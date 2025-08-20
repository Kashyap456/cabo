import { useGamePlayStore, GamePhase } from '../../stores/game_play_state'
import { useAuthStore } from '../../stores/auth'
import { useGameWebSocket } from '../../api/game_ws'
import { useCallback, useState } from 'react'

export default function ActionPanel() {
  const { phase, canCallStack, currentPlayerId, players } = useGamePlayStore()

  const { sessionId } = useAuthStore()
  const currentPlayer = players.find((p) => p.id === sessionId)
  const isMyTurn = currentPlayer && currentPlayer.id === currentPlayerId

  if (!currentPlayer) return null

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold mb-4">Actions</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Basic Game Actions */}
        {phase === GamePhase.PLAYING && isMyTurn && (
          <>
            <DrawCardButton />
            <PlayDrawnCardButton />
          </>
        )}

        {/* Stack Call - available during multiple phases */}
        {canCallStack() && <CallStackButton />}

        {/* Cabo Call - available during playing and special action phases */}
        {(phase === GamePhase.PLAYING ||
          phase === GamePhase.WAITING_FOR_SPECIAL_ACTION) &&
          isMyTurn && <CallCaboButton />}

        {/* Special Action Buttons */}
        {phase === GamePhase.WAITING_FOR_SPECIAL_ACTION && isMyTurn && (
          <>
            <ViewOwnCardButton />
            <ViewOpponentCardButton />
            <SwapCardsButton />
          </>
        )}

        {/* King Action Buttons */}
        {phase === GamePhase.KING_VIEW_PHASE && isMyTurn && (
          <KingViewCardButton />
        )}

        {phase === GamePhase.KING_SWAP_PHASE && isMyTurn && (
          <>
            <KingSwapCardsButton />
            <KingSkipSwapButton />
          </>
        )}
      </div>

      {/* Phase Description */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">{getPhaseDescription(phase)}</p>
      </div>
    </div>
  )
}

function DrawCardButton() {
  const { sendMessage } = useGameWebSocket()

  const handleClick = useCallback(() => {
    sendMessage({
      type: 'draw_card',
    })
  }, [sendMessage])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
    >
      Draw Card
    </button>
  )
}

function PlayDrawnCardButton() {
  const { sendMessage } = useGameWebSocket()

  const handleClick = useCallback(() => {
    sendMessage({
      type: 'play_drawn_card',
    })
  }, [sendMessage])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
    >
      Play Drawn
    </button>
  )
}

function CallStackButton() {
  const { sendMessage } = useGameWebSocket()

  const handleClick = useCallback(() => {
    sendMessage({
      type: 'call_stack',
    })
  }, [sendMessage])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
    >
      Call STACK
    </button>
  )
}

function CallCaboButton() {
  const { sendMessage } = useGameWebSocket()

  const handleClick = useCallback(() => {
    sendMessage({
      type: 'call_cabo',
    })
  }, [sendMessage])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
    >
      Call CABO
    </button>
  )
}

function ViewOwnCardButton() {
  const { sendMessage } = useGameWebSocket()
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  )

  const handleClick = useCallback(() => {
    if (selectedCardIndex !== null) {
      sendMessage({
        type: 'view_own_card',
        card_index: selectedCardIndex,
      })
      setSelectedCardIndex(null)
    } else {
      // Show card selection UI or default to first card
      setSelectedCardIndex(0)
    }
  }, [sendMessage, selectedCardIndex])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
    >
      View Own Card
    </button>
  )
}

function ViewOpponentCardButton() {
  const { players } = useGamePlayStore()
  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  )

  const currentPlayer = players.find((p) => p.id === sessionId)

  const handleClick = useCallback(() => {
    if (selectedTarget && selectedCardIndex !== null) {
      sendMessage({
        type: 'view_opponent_card',
        target_player_id: selectedTarget,
        card_index: selectedCardIndex,
      })
      setSelectedTarget(null)
      setSelectedCardIndex(null)
    } else {
      // Show target selection UI - for now, select first opponent
      const opponents = players.filter((p) => p.id !== currentPlayer?.id)
      if (opponents.length > 0) {
        setSelectedTarget(opponents[0].id)
        setSelectedCardIndex(0)
      }
    }
  }, [sendMessage, selectedTarget, selectedCardIndex, players, currentPlayer])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
    >
      View Opponent
    </button>
  )
}

function SwapCardsButton() {
  const { players } = useGamePlayStore()
  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const [selectedOwnIndex, setSelectedOwnIndex] = useState<number | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<number | null>(
    null,
  )

  const currentPlayer = players.find((p) => p.id === sessionId)

  const handleClick = useCallback(() => {
    if (
      selectedOwnIndex !== null &&
      selectedTarget &&
      selectedTargetIndex !== null
    ) {
      sendMessage({
        type: 'swap_cards',
        own_index: selectedOwnIndex,
        target_player_id: selectedTarget,
        target_index: selectedTargetIndex,
      })
      setSelectedOwnIndex(null)
      setSelectedTarget(null)
      setSelectedTargetIndex(null)
    } else {
      // Show card selection UI - for now, use defaults
      const opponents = players.filter((p) => p.id !== currentPlayer?.id)
      if (opponents.length > 0) {
        setSelectedOwnIndex(0)
        setSelectedTarget(opponents[0].id)
        setSelectedTargetIndex(0)
      }
    }
  }, [
    sendMessage,
    selectedOwnIndex,
    selectedTarget,
    selectedTargetIndex,
    players,
    currentPlayer,
  ])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
    >
      Swap Cards
    </button>
  )
}

function KingViewCardButton() {
  const { players } = useGamePlayStore()
  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  )

  const currentPlayer = players.find((p) => p.id === sessionId)

  const handleClick = useCallback(() => {
    if (selectedTarget && selectedCardIndex !== null) {
      sendMessage({
        type: 'king_view_card',
        target_player_id: selectedTarget,
        card_index: selectedCardIndex,
      })
      setSelectedTarget(null)
      setSelectedCardIndex(null)
    } else {
      // Show target selection UI - for now, select first opponent
      const opponents = players.filter((p) => p.id !== currentPlayer?.id)
      if (opponents.length > 0) {
        setSelectedTarget(opponents[0].id)
        setSelectedCardIndex(0)
      }
    }
  }, [sendMessage, selectedTarget, selectedCardIndex, players, currentPlayer])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
    >
      King View
    </button>
  )
}

function KingSwapCardsButton() {
  const { players } = useGamePlayStore()
  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const [selectedOwnIndex, setSelectedOwnIndex] = useState<number | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedTargetIndex, setSelectedTargetIndex] = useState<number | null>(
    null,
  )

  const currentPlayer = players.find((p) => p.id === sessionId)

  const handleClick = useCallback(() => {
    if (
      selectedOwnIndex !== null &&
      selectedTarget &&
      selectedTargetIndex !== null
    ) {
      sendMessage({
        type: 'king_swap_cards',
        own_index: selectedOwnIndex,
        target_player_id: selectedTarget,
        target_index: selectedTargetIndex,
      })
      setSelectedOwnIndex(null)
      setSelectedTarget(null)
      setSelectedTargetIndex(null)
    } else {
      // Show card selection UI - for now, use defaults
      const opponents = players.filter((p) => p.id !== currentPlayer?.id)
      if (opponents.length > 0) {
        setSelectedOwnIndex(0)
        setSelectedTarget(opponents[0].id)
        setSelectedTargetIndex(0)
      }
    }
  }, [
    sendMessage,
    selectedOwnIndex,
    selectedTarget,
    selectedTargetIndex,
    players,
    currentPlayer,
  ])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
    >
      King Swap
    </button>
  )
}

function KingSkipSwapButton() {
  const { sendMessage } = useGameWebSocket()

  const handleClick = useCallback(() => {
    sendMessage({
      type: 'king_skip_swap',
    })
  }, [sendMessage])

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
    >
      Skip
    </button>
  )
}

function getPhaseDescription(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.SETUP:
      return 'Game is being set up. Look at your first two cards.'
    case GamePhase.PLAYING:
      return 'Draw a card from the deck or discard pile, then play or replace a card.'
    case GamePhase.WAITING_FOR_SPECIAL_ACTION:
      return 'Choose a special action based on the card you played.'
    case GamePhase.KING_VIEW_PHASE:
      return 'King card played! You may view any card before deciding to swap.'
    case GamePhase.KING_SWAP_PHASE:
      return 'Choose cards to swap, or skip the swap.'
    case GamePhase.STACK_CALLED:
      return 'Stack was called! Resolve the stack attempt.'
    case GamePhase.TURN_TRANSITION:
      return 'Turn is transitioning to the next player.'
    case GamePhase.ENDED:
      return 'Game has ended.'
    default:
      return 'Game in progress.'
  }
}
