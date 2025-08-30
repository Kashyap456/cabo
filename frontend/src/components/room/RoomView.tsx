import { useEffect, useState } from 'react'
import { useRoomStore, useIsHost, RoomPhase } from '../../stores/game_state'
import { useAuthStore } from '../../stores/auth'
import { useStartGame } from '../../api/rooms'
import { useGamePlayStore, GamePhase } from '@/stores/game_play_state'
import { useGameWebSocket } from '@/api/game_ws'
import { useSpecialActionHandler } from '@/hooks/useSpecialActionHandler'
import { useCardVisibility } from '@/hooks/useCardVisibility'
import GameTable from '../game/GameTable'
import PlayerGridSpot from '../game/PlayerGridSpot'
import Deck from '../game/Deck'
import WoodButton from '../ui/WoodButton'
import ActionPanel from './ActionPanel'
import GameStatus from '../game/GameStatus'
import { calculatePlayerPositions } from '@/utils/tablePositions'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'

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
  const [tableDimensions, setTableDimensions] = useState({
    width: 1000,
    height: 600,
  })

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
  const currentPlayerIndex = displayPlayers.findIndex((p) => p.id === sessionId)
  const positions = calculatePlayerPositions(
    displayPlayers.length || 1,
    currentPlayerIndex >= 0 ? currentPlayerIndex : 0,
    tableDimensions.width,
    tableDimensions.height,
  )
  const currentPlayer = isInGame
    ? gamePlayState.players.find((p) => p.id === sessionId)
    : null
  const isMyTurn =
    isInGame &&
    currentPlayer &&
    currentPlayer.id === gamePlayState.currentPlayerId
  const gamePhase = isInGame ? gamePlayState.phase : null

  // Determine if we should show swap animation
  // Only show when we have exactly 2 cards selected during a swap action
  const shouldShowSwap =
    isInGame &&
    (gamePlayState.specialAction?.type === 'SWAP_CARDS' ||
      gamePlayState.specialAction?.type === 'KING_SWAP') &&
    gamePlayState.selectedCards.length === 2

  // Handle deck click
  const handleDeckClick = () => {
    if (
      isMyTurn &&
      gamePhase === GamePhase.DRAW_PHASE &&
      !gamePlayState.drawnCard
    ) {
      sendMessage({ type: 'draw_card' })
    }
  }

  // Handle drawn card actions
  const handleDrawnCardClick = () => {
    if (
      gamePlayState.drawnCard &&
      isMyTurn &&
      gamePhase === GamePhase.CARD_DRAWN
    ) {
      sendMessage({ type: 'play_drawn_card' })
    }
  }

  // Handle hand card replacement
  const handleHandCardClick = (playerId: string, cardIndex: number) => {
    const player = isInGame
      ? gamePlayState.players.find((p) => p.id === playerId)
      : null
    if (!player) return

    // Handle card replacement during CARD_DRAWN phase
    if (
      playerId === sessionId &&
      isMyTurn &&
      gamePhase === GamePhase.CARD_DRAWN &&
      gamePlayState.drawnCard
    ) {
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
      if (
        gamePhase === GamePhase.STACK_CALLED &&
        gamePlayState.stackCaller?.playerId === sessionId
      ) {
        if (playerId === sessionId) {
          sendMessage({
            type: 'execute_stack',
            card_index: cardIndex,
          })
        } else {
          sendMessage({
            type: 'execute_stack',
            card_index: cardIndex,
            target_player_id: playerId,
          })
        }
      }
    }
  }

  return (
    <GameTable showPositionGuides={true} data-table-container>
      <LayoutGroup>
        {/* Game status - show in top left during game */}
        {isInGame && <GameStatus />}

        {/* Room info display - always visible */}
        <div className="fixed top-4 right-4 z-20">
          <div
            className="border-4 border-yellow-500/80 px-4 py-3 rounded-lg shadow-wood-deep"
            style={{
              background:
                'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
            }}
          >
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-wood-darker font-bold text-xs uppercase">
                  Room Code
                </p>
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
          {displayPlayers.map((player, index) => {
            const roomPlayer = players.find((p) => p.id === player.id)
            const cards = isInGame && 'cards' in player ? player.cards : []

            return (
              <PlayerGridSpot
                key={player.id}
                playerId={player.id}
                nickname={player.nickname || roomPlayer?.nickname || 'Unknown'}
                isHost={roomPlayer?.isHost || false}
                isCurrentPlayer={player.id === sessionId}
                isTurn={isInGame && player.id === gamePlayState.currentPlayerId}
                position={positions[index]}
                tableDimensions={tableDimensions}
                cards={cards.map((card: any, cardIndex: number) => ({
                  id: card.id, // Pass through the card ID for animations
                  value: isCardVisible(player.id, cardIndex, card)
                    ? card.rank
                    : undefined,
                  suit: isCardVisible(player.id, cardIndex, card)
                    ? card.suit
                    : undefined,
                  isFaceDown: !isCardVisible(player.id, cardIndex, card),
                  isSelected:
                    isInGame &&
                    gamePlayState.selectedCards.some(
                      (s) =>
                        s.playerId === player.id && s.cardIndex === cardIndex,
                    ),
                  isSelectable: (() => {
                    if (!isInGame) return false

                    // During turn transitions or stack transitions, no cards are selectable
                    if (gamePhase === GamePhase.TURN_TRANSITION) return false

                    // During CARD_DRAWN phase, only current player's own cards are selectable
                    if (gamePhase === GamePhase.CARD_DRAWN) {
                      return (
                        player.id === sessionId &&
                        gamePlayState.drawnCard &&
                        isMyTurn
                      )
                    }

                    // For special actions (VIEW_OWN, VIEW_OPPONENT, etc.)
                    if (
                      gamePlayState.specialAction &&
                      (gamePhase === GamePhase.WAITING_FOR_SPECIAL_ACTION ||
                        gamePhase === GamePhase.KING_VIEW_PHASE ||
                        gamePhase === GamePhase.KING_SWAP_PHASE)
                    ) {
                      // Only the player with the special action can select
                      if (gamePlayState.specialAction.playerId !== sessionId) {
                        return false
                      }

                      const actionType = gamePlayState.specialAction.type

                      // VIEW_OWN: only own cards selectable
                      if (actionType === 'VIEW_OWN') {
                        return player.id === sessionId
                      }

                      // VIEW_OPPONENT: only opponent cards selectable
                      if (actionType === 'VIEW_OPPONENT') {
                        return player.id !== sessionId
                      }

                      // SWAP_CARDS, KING_VIEW, KING_SWAP: any card selectable
                      if (
                        actionType === 'SWAP_CARDS' ||
                        actionType === 'KING_VIEW' ||
                        actionType === 'KING_SWAP'
                      ) {
                        return true
                      }
                    }

                    // Stack phase: stack caller can select any card
                    if (
                      gamePhase === GamePhase.STACK_CALLED &&
                      gamePlayState.stackCaller?.playerId === sessionId
                    ) {
                      return true
                    }

                    return false
                  })(),
                }))}
                onCardClick={
                  isInGame
                    ? (cardIndex) => handleHandCardClick(player.id, cardIndex)
                    : undefined
                }
              />
            )
          })}
        </div>

        {/* Center content - changes based on phase */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <AnimatePresence>
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
                      Need at least {2 - players.length} more player
                      {2 - players.length > 1 ? 's' : ''}
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
                className="flex items-center justify-center"
              >
                {/* Deck with integrated drawn card slot and discard pile */}
                <Deck
                  deckCount={gamePlayState.deckCards.length}
                  deckCardIds={gamePlayState.deckCards} // Pass all card IDs in deck
                  discardPile={
                    gamePlayState.topDiscardCard
                      ? [
                          {
                            id: gamePlayState.topDiscardCard.id,
                            value: gamePlayState.topDiscardCard.rank,
                            suit: gamePlayState.topDiscardCard.suit,
                          },
                        ]
                      : []
                  }
                  drawnCard={
                    gamePlayState.drawnCard
                      ? {
                          id: gamePlayState.drawnCard.id,
                          rank: gamePlayState.drawnCard.rank,
                          suit: gamePlayState.drawnCard.suit,
                          // Show face based on visibility
                          isFaceDown:
                            !gamePlayState.drawnCard.isTemporarilyViewed,
                        }
                      : null
                  }
                  onDrawFromDeck={handleDeckClick}
                  onDrawnCardClick={handleDrawnCardClick}
                  isCurrentPlayerTurn={isMyTurn}
                  gamePhase={gamePhase}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Panel - bottom right corner, below player badges */}
        {isInGame && currentPlayer && (
          <div className="fixed bottom-4 right-4 z-10">
            <ActionPanel />
          </div>
        )}
      </LayoutGroup>
    </GameTable>
  )
}
