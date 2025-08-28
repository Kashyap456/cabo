import { useEffect, useState, useRef } from 'react'
import { useRoomStore, useIsHost, RoomPhase } from '../../stores/game_state'
import { useAuthStore } from '../../stores/auth'
import { useStartGame } from '../../api/rooms'
import { useGamePlayStore, GamePhase } from '@/stores/game_play_state'
import { useGameWebSocket } from '@/api/game_ws'
import { useSpecialActionHandler } from '@/hooks/useSpecialActionHandler'
import { useCardVisibility } from '@/hooks/useCardVisibility'
import GameTable from '../game/GameTable'
import PlayerSpot from '../game/PlayerSpot'
import Deck from '../game/Deck'
import WoodButton from '../ui/WoodButton'
import ActionPanel from './ActionPanel'
import { calculatePlayerPositions } from '@/utils/tablePositions'
import { motion, AnimatePresence } from 'framer-motion'

export default function RoomView() {
  // Room state
  const { players, roomCode, phase: roomPhase } = useRoomStore()
  const isHost = useIsHost()
  const { sessionId } = useAuthStore()
  const startGameMutation = useStartGame()
  
  // Game state (only used when in game)
  const gamePlayState = useGamePlayStore()
  const { sendMessage } = useGameWebSocket()
  const { isCardVisible } = useCardVisibility()
  
  // Table dimensions
  const [tableDimensions, setTableDimensions] = useState({ width: 1000, height: 600 })
  
  // Special action handler for game
  useSpecialActionHandler()

  useEffect(() => {
    const updateDimensions = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = Math.min(vw * 0.85, 1200)
      const height = Math.min(vh * 0.75, 700)
      setTableDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Game logic helpers
  const isInGame = roomPhase === RoomPhase.IN_GAME
  
  // Get the actual player list we'll be rendering
  const displayPlayers = isInGame ? gamePlayState.players : players
  
  // Calculate player positions based on the actual players we're showing
  const currentPlayerIndex = displayPlayers.findIndex(p => p.id === sessionId)
  const positions = calculatePlayerPositions(
    displayPlayers.length || 1,
    currentPlayerIndex >= 0 ? currentPlayerIndex : 0,
    tableDimensions.width,
    tableDimensions.height
  )
  const currentPlayer = isInGame ? gamePlayState.players.find(p => p.id === sessionId) : null
  const isMyTurn = isInGame && currentPlayer && currentPlayer.id === gamePlayState.currentPlayerId
  const gamePhase = isInGame ? gamePlayState.phase : null

  // Handle deck click
  const handleDeckClick = () => {
    if (isMyTurn && gamePhase === GamePhase.DRAW_PHASE && !gamePlayState.drawnCard) {
      sendMessage({ type: 'draw_card' })
    }
  }

  // Handle drawn card actions
  const handleDrawnCardClick = () => {
    if (gamePlayState.drawnCard && isMyTurn && gamePhase === GamePhase.CARD_DRAWN) {
      sendMessage({ type: 'play_drawn_card' })
    }
  }

  // Handle hand card replacement
  const handleHandCardClick = (playerId: string, cardIndex: number) => {
    const player = isInGame ? gamePlayState.players.find(p => p.id === playerId) : null
    if (!player) return

    // Handle replacement when card is drawn
    if (gamePlayState.drawnCard && isMyTurn && gamePhase === GamePhase.CARD_DRAWN) {
      sendMessage({
        type: 'replace_and_play',
        hand_index: cardIndex,
      })
      return
    }

    // Handle special actions and stack selection
    if (gamePlayState.isCardSelectable(playerId, cardIndex, sessionId)) {
      gamePlayState.selectCard(playerId, cardIndex)
      
      // Handle stack execution
      if (gamePhase === GamePhase.STACK_CALLED && gamePlayState.stackCaller?.playerId === sessionId) {
        if (playerId === sessionId) {
          sendMessage({
            type: 'execute_stack',
            card_index: cardIndex
          })
        } else {
          sendMessage({
            type: 'execute_stack',
            card_index: cardIndex,
            target_player_id: playerId
          })
        }
      }
    }
  }

  return (
    <GameTable showPositionGuides={false}>
      {/* Room info display - always visible */}
      <div className="fixed top-4 right-4 z-20">
        <div 
          className="border-4 border-yellow-500/80 px-4 py-3 rounded-lg shadow-wood-deep"
          style={{
            background: 'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
          }}
        >
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-wood-darker font-bold text-xs uppercase">Room Code</p>
              <p className="text-yellow-100 font-black text-xl tracking-wider text-shadow-painted">
                {roomCode}
              </p>
            </div>
            <div className="border-t-2 border-wood-medium pt-2">
              <p className="text-yellow-100 font-bold text-sm">
                {players.length} / 8 Players
              </p>
              {isInGame && gamePhase && (
                <p className="text-yellow-200 text-xs mt-1">
                  Phase: {gamePhase}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Players positioned around the table */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          {displayPlayers.map((player, index) => {
            const roomPlayer = players.find(p => p.id === player.id)
            const cards = isInGame && 'cards' in player ? player.cards : []
            
            return (
              <PlayerSpot
                key={player.id}
                nickname={player.nickname || roomPlayer?.nickname || 'Unknown'}
                isHost={roomPlayer?.isHost || false}
                isCurrentPlayer={player.id === sessionId}
                isTurn={isInGame && player.id === gamePlayState.currentPlayerId}
                position={positions[index]}
                tableDimensions={tableDimensions}
                cards={cards.map((card: any) => ({
                  value: isCardVisible(player.id, cards.indexOf(card), card) ? card.rank : undefined,
                  suit: isCardVisible(player.id, cards.indexOf(card), card) ? card.suit : undefined,
                  isFaceDown: !isCardVisible(player.id, cards.indexOf(card), card),
                }))}
                onCardClick={isInGame ? (cardIndex) => handleHandCardClick(player.id, cardIndex) : undefined}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Center content - changes based on phase */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <AnimatePresence mode="wait">
          {/* Waiting phase content */}
          {roomPhase === RoomPhase.WAITING && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              {players.length < 2 ? (
                <div>
                  <p className="text-white/80 text-lg font-semibold mb-2">
                    Waiting for players...
                  </p>
                  <p className="text-white/60 text-sm">
                    Need at least {2 - players.length} more player{2 - players.length > 1 ? 's' : ''}
                  </p>
                </div>
              ) : isHost ? (
                <WoodButton
                  variant="large"
                  onClick={() => startGameMutation.mutate(roomCode)}
                  disabled={startGameMutation.isPending}
                  className="min-w-[200px]"
                >
                  {startGameMutation.isPending ? 'Starting...' : 'Start Game'}
                </WoodButton>
              ) : (
                <div>
                  <p className="text-white/80 text-lg font-semibold">
                    Waiting for host to start
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* In-game content */}
          {roomPhase === RoomPhase.IN_GAME && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-6"
            >
              {/* Deck and Discard Pile */}
              <Deck
                deckCount={50} // TODO: Get from game state
                discardPile={gamePlayState.topDiscardCard ? [{
                  value: gamePlayState.topDiscardCard.rank,
                  suit: gamePlayState.topDiscardCard.suit
                }] : []}
                onDrawFromDeck={handleDeckClick}
                isCurrentPlayerTurn={isMyTurn}
              />

              {/* Drawn card (shown separately when player has drawn) */}
              {gamePlayState.drawnCard && isMyTurn && (
                <motion.div
                  initial={{ x: -100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="absolute top-32 bg-green-50 border-2 border-green-400 rounded-lg p-2"
                  onClick={handleDrawnCardClick}
                >
                  <p className="text-xs text-green-700 mb-1">Drawn Card</p>
                  <div className="text-lg font-bold">
                    {gamePlayState.drawnCard.rank} {gamePlayState.drawnCard.suit}
                  </div>
                  <p className="text-xs text-green-600 mt-1">Click to play</p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Special action status */}
      {isInGame && gamePlayState.specialAction && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 z-30"
        >
          <h3 className="font-semibold text-yellow-800 mb-2">
            Special Action in Progress
          </h3>
          <p className="text-yellow-700">
            {gamePlayState.getPlayerById(gamePlayState.specialAction.playerId)?.nickname} is performing: {gamePlayState.specialAction.type}
          </p>
        </motion.div>
      )}

      {/* Stack caller notification */}
      {isInGame && gamePlayState.stackCaller && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-50 border-2 border-red-400 rounded-lg p-4 z-30"
        >
          <h3 className="font-semibold text-red-800 mb-2">Stack Called!</h3>
          <p className="text-red-700">
            {gamePlayState.stackCaller.nickname} called STACK!
          </p>
        </motion.div>
      )}

      {/* Action Panel - for current player during game */}
      {isInGame && currentPlayer && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
          <ActionPanel />
        </div>
      )}
    </GameTable>
  )
}