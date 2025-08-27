import {
  useGamePlayStore,
  getCardDisplayValue,
  GamePhase,
} from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'
import { useGameWebSocket } from '@/api/game_ws'
import { useSpecialActionHandler } from '@/hooks/useSpecialActionHandler'
import { useCardVisibility } from '@/hooks/useCardVisibility'
import ActionPanel from './ActionPanel'
import Card from '../game/Card'

export default function PlayingView() {
  const {
    currentPlayerId,
    phase,
    players,
    topDiscardCard,
    drawnCard,
    specialAction,
    selectedCards,
    stackCaller,
    getCurrentPlayer,
    getPlayerById,
    selectCard,
    isCardSelectable,
  } = useGamePlayStore()

  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const { isCardVisible } = useCardVisibility()
  const currentPlayer = players.find((p) => p.id === sessionId)
  const activePlayer = getCurrentPlayer()

  const isMyTurn = currentPlayer && currentPlayer.id === currentPlayerId
  
  // Use the special action handler hook
  useSpecialActionHandler()

  // Handle clicking the drawn card to play it
  const handleDrawnCardClick = () => {
    if (drawnCard && isMyTurn && phase === GamePhase.CARD_DRAWN) {
      sendMessage({ type: 'play_drawn_card' })
    }
  }

  // Handle clicking a hand card to replace and play it
  const handleHandCardClick = (cardIndex: number) => {
    if (drawnCard && isMyTurn && phase === GamePhase.CARD_DRAWN) {
      sendMessage({
        type: 'replace_and_play',
        hand_index: cardIndex,
      })
    }
  }

  // Handle clicking the deck to draw a card
  const handleDeckClick = () => {
    if (isMyTurn && phase === GamePhase.DRAW_PHASE && !drawnCard) {
      sendMessage({ type: 'draw_card' })
    }
  }
  
  // Get instruction text for special actions
  const getSpecialActionInstruction = (type: string, selectedCount: number) => {
    switch (type) {
      case 'VIEW_OWN':
        return '👆 Click one of your cards to view it'
      case 'VIEW_OPPONENT':
        return "👆 Click an opponent's card to view it"
      case 'SWAP_CARDS':
        if (selectedCount === 0) {
          return '👆 Select one of your cards'
        } else if (selectedCount === 1) {
          return "👆 Now select an opponent's card to swap with"
        }
        return ''
      case 'KING_VIEW':
        return '👆 Click any card to view it'
      case 'KING_SWAP':
        if (selectedCount === 0) {
          return '👆 Select the first card for swapping'
        } else if (selectedCount === 1) {
          return '👆 Now select the second card to swap with'
        }
        return ''
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Game Status */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Game in Progress</h2>
          <div className="text-sm text-gray-600">
            Phase: <span className="font-medium">{phase}</span>
          </div>
        </div>

        {activePlayer && (
          <div className="text-center">
            <p className="text-lg">
              Current Player:{' '}
              <span className="font-semibold text-blue-600">
                {activePlayer.nickname}
              </span>
              {isMyTurn && (
                <span className="ml-2 text-green-600">(Your Turn)</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Special Action Status */}
      {specialAction && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Special Action in Progress
          </h3>
          <p className="text-yellow-700">
            {getPlayerById(specialAction.playerId)?.nickname} is performing:{' '}
            {specialAction.type}
          </p>
          {specialAction.playerId === sessionId && (
            <div className="mt-2 text-sm text-yellow-600">
              {getSpecialActionInstruction(specialAction.type, selectedCards.length)}
            </div>
          )}
        </div>
      )}

      {/* Stack Caller */}
      {stackCaller && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2">Stack Called!</h3>
          <p className="text-red-700">
            {stackCaller.nickname} called STACK!
          </p>
        </div>
      )}

      {/* Drawn Card - only show to current player when they have drawn a card */}
      {drawnCard && isMyTurn && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">Drawn Card</h3>
          <div className="flex justify-center">
            <Card
              card={{
                rank: drawnCard.rank,
                suit: drawnCard.suit,
                isFaceUp: true
              }}
              size="medium"
              onClick={handleDrawnCardClick}
              className="border-green-400 hover:border-green-500"
              isSelectable={true}
            />
          </div>
          <p className="text-center text-sm text-green-700 mt-2">
            Click the card to play it, or click one of your cards below to
            replace and play.
          </p>
        </div>
      )}

      {/* Deck and Discard Pile */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <h3 className="text-lg font-semibold mb-3">Deck & Discard Pile</h3>
        <div className="flex justify-center gap-8">
          {/* Deck */}
          <div className="text-center">
            <div
              onClick={handleDeckClick}
              className={`w-16 h-24 bg-blue-600 border-2 border-blue-700 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-lg ${
                isMyTurn && phase === GamePhase.DRAW_PHASE && !drawnCard
                  ? 'cursor-pointer hover:bg-blue-700 hover:border-blue-800 transition-all duration-200 transform hover:scale-105'
                  : 'opacity-50'
              }`}
            >
              DECK
            </div>
            <p className="text-xs text-gray-600 mt-1">Click to draw</p>
          </div>

          {/* Discard Pile */}
          <div className="text-center">
            {topDiscardCard ? (
              <Card
                card={{
                  rank: topDiscardCard.rank,
                  suit: topDiscardCard.suit,
                  isFaceUp: true
                }}
                size="medium"
              />
            ) : (
              <div className="w-16 h-24 bg-gray-100 border-2 border-gray-300 rounded-lg flex items-center justify-center text-gray-500">
                Empty
              </div>
            )}
            <p className="text-xs text-gray-600 mt-1">Discard pile</p>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {players.map((player) => (
          <div
            key={player.id}
            className={`bg-white rounded-lg shadow-md p-4 ${
              player.id === currentPlayerId ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{player.nickname}</h4>
                  {player.id === sessionId && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      You
                    </span>
                  )}
                  {player.hasCalledCabo && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                      Cabo!
                    </span>
                  )}
                </div>
                {/* Show hint when player can click cards */}
                {player.id === sessionId &&
                  drawnCard &&
                  isMyTurn &&
                  phase === GamePhase.CARD_DRAWN && (
                    <div className="text-xs text-blue-600 mt-1">
                      💡 Click a card to replace and play it
                    </div>
                  )}
              </div>
              <span className="text-sm text-gray-600">
                {player.cards.length} cards
              </span>
            </div>

            {/* Player's Cards */}
            <div className="flex flex-wrap gap-2">
              {player.cards.map((card, cardIndex) => {
                const isCurrentPlayer = player.id === sessionId
                const canReplaceCard =
                  isCurrentPlayer &&
                  drawnCard &&
                  isMyTurn &&
                  phase === GamePhase.CARD_DRAWN
                
                // Check if this card can be selected for special actions
                const canSelectForSpecial = isCardSelectable(player.id, cardIndex, sessionId)
                const isSelected = selectedCards.some(
                  s => s.playerId === player.id && s.cardIndex === cardIndex
                )
                
                const handleCardClick = () => {
                  if (canReplaceCard) {
                    handleHandCardClick(cardIndex)
                  } else if (canSelectForSpecial) {
                    // This now handles both special actions and stack selection
                    selectCard(player.id, cardIndex)
                    
                    // If we're in stack mode and just selected a card, send the execute message
                    if (phase === GamePhase.STACK_CALLED && stackCaller?.playerId === sessionId) {
                      if (player.id === sessionId) {
                        // Stacking own card
                        sendMessage({
                          type: 'execute_stack',
                          card_index: cardIndex
                        })
                      } else {
                        // Stacking opponent's card
                        sendMessage({
                          type: 'execute_stack',
                          card_index: cardIndex,
                          target_player_id: player.id
                        })
                      }
                    }
                  }
                }

                const cardIsVisible = isCardVisible(player.id, cardIndex, card)
                
                return (
                  <Card
                    key={card.id}
                    card={{
                      rank: card.rank,
                      suit: card.suit,
                      isFaceUp: cardIsVisible
                    }}
                    size="small"
                    onClick={handleCardClick}
                    isSelected={isSelected}
                    isSelectable={canReplaceCard || canSelectForSpecial}
                    className={
                      cardIsVisible && card.isTemporarilyViewed
                        ? 'ring-2 ring-green-400'
                        : ''
                    }
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Action Panel */}
      {currentPlayer && <ActionPanel />}
    </div>
  )
}
