import {
  useGamePlayStore,
  getCardDisplayValue,
  isCardKnown,
  GamePhase,
} from '../../stores/game_play_state'
import { useAuthStore } from '../../stores/auth'
import { useGameWebSocket } from '../../api/game_ws'
import ActionPanel from './ActionPanel'

export default function PlayingView() {
  const {
    currentPlayerId,
    phase,
    players,
    topDiscardCard,
    drawnCard,
    specialAction,
    stackCalls,
    getCurrentPlayer,
    getPlayerById,
  } = useGamePlayStore()

  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  const currentPlayer = players.find((p) => p.id === sessionId)
  const activePlayer = getCurrentPlayer()

  const isMyTurn = currentPlayer && currentPlayer.id === currentPlayerId

  // Handle clicking the drawn card to play it
  const handleDrawnCardClick = () => {
    if (drawnCard && isMyTurn && phase === GamePhase.PLAYING) {
      sendMessage({ type: 'play_drawn_card' })
    }
  }

  // Handle clicking a hand card to replace and play it
  const handleHandCardClick = (cardIndex: number) => {
    if (drawnCard && isMyTurn && phase === GamePhase.PLAYING) {
      sendMessage({
        type: 'replace_and_play',
        hand_index: cardIndex,
      })
    }
  }

  // Handle clicking the deck to draw a card
  const handleDeckClick = () => {
    if (isMyTurn && phase === GamePhase.PLAYING && !drawnCard) {
      sendMessage({ type: 'draw_card' })
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
        </div>
      )}

      {/* Stack Calls */}
      {stackCalls.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2">Stack Called!</h3>
          {stackCalls.map((call, index) => (
            <p key={index} className="text-red-700">
              {call.nickname} called STACK!
            </p>
          ))}
        </div>
      )}

      {/* Drawn Card - only show to current player when they have drawn a card */}
      {drawnCard && isMyTurn && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">Drawn Card</h3>
          <div className="flex justify-center">
            <div
              onClick={handleDrawnCardClick}
              className="w-16 h-24 border-2 border-green-400 rounded-lg bg-white flex items-center justify-center text-sm font-medium shadow-lg cursor-pointer hover:bg-green-50 hover:border-green-500 transition-all duration-200 transform hover:scale-105"
            >
              {getCardDisplayValue(drawnCard)}
            </div>
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
                isMyTurn && phase === GamePhase.PLAYING && !drawnCard
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
              <div className="w-16 h-24 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center font-semibold shadow-lg">
                {getCardDisplayValue(topDiscardCard)}
              </div>
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
                  phase === GamePhase.PLAYING && (
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
                  phase === GamePhase.PLAYING

                return (
                  <div
                    key={card.id}
                    onClick={() =>
                      canReplaceCard && handleHandCardClick(cardIndex)
                    }
                    className={`w-12 h-16 border-2 rounded flex items-center justify-center text-xs font-medium ${
                      isCardKnown(card)
                        ? card.isTemporarilyViewed
                          ? 'bg-green-50 border-green-300 text-green-800'
                          : 'bg-white border-gray-300'
                        : 'bg-gray-100 border-gray-300 text-gray-500'
                    } ${
                      canReplaceCard
                        ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 transform hover:scale-105'
                        : ''
                    }`}
                  >
                    {getCardDisplayValue(card)}
                  </div>
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
