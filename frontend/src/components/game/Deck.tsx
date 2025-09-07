import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import DrawnCardSlot from './DrawnCardSlot'
import { GamePhase } from '../../stores/game_play_state'

interface DeckProps {
  deckCount?: number
  deckCardIds?: string[] // All card IDs currently in deck
  discardPile?: Array<{
    id?: string
    value: number | string
    suit?: string
  }>
  drawnCard?: {
    id?: string
    rank: string | number
    suit: string
    isFaceDown?: boolean
  }
  onDrawFromDeck?: () => void
  onDrawFromDiscard?: () => void
  onDrawnCardClick?: () => void
  isCurrentPlayerTurn?: boolean
  gamePhase?: GamePhase
}

const Deck = ({
  deckCount = 0,
  deckCardIds = [],
  discardPile = [],
  drawnCard,
  onDrawFromDeck,
  onDrawFromDiscard,
  onDrawnCardClick,
  isCurrentPlayerTurn = false,
  gamePhase,
}: DeckProps) => {
  const topDiscardCard = discardPile[discardPile.length - 1]
  const isDeckSelectable = isCurrentPlayerTurn && gamePhase === GamePhase.DRAW_PHASE && !drawnCard

  return (
    <div className="flex gap-4 sm:gap-8 items-start justify-center">
      {/* Draw deck */}
      {/* Drawn card slot */}
      <DrawnCardSlot
        drawnCard={drawnCard}
        isCurrentPlayer={isCurrentPlayerTurn}
        onCardClick={onDrawnCardClick}
        gamePhase={gamePhase}
      />

      <motion.div
        className="relative"
        whileHover={isDeckSelectable ? { scale: 1.05 } : {}}
        whileTap={isDeckSelectable ? { scale: 0.95 } : {}}
      >
        <div
          className={`relative ${isDeckSelectable ? 'cursor-pointer' : 'pointer-events-none opacity-70'}`}
          onClick={onDrawFromDeck}
        >
          {/* All deck cards stacked - needed for FLIP animations */}
          <div className="relative w-8 h-12 sm:w-12 sm:h-18">
            <AnimatePresence>
              {deckCardIds.map((cardId, _) => (
                <AnimatedCard
                  key={cardId}
                  cardId={cardId}
                  isFaceDown={true}
                  className="absolute inset-0 w-8 h-12 sm:w-12 sm:h-18"
                  animationDelay={0}
                />
              ))}
            </AnimatePresence>
            {/* Fallback if deck is empty */}
            {deckCardIds.length === 0 && (
              <div className="w-8 h-12 sm:w-12 sm:h-18 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center">
                <span className="text-white/50 text-xs">Empty</span>
              </div>
            )}
          </div>

          {/* Deck count */}
          <div className="absolute -bottom-8 sm:-bottom-10 left-1/2 -translate-x-1/2 text-white text-xs sm:text-sm font-bold">
            Deck
          </div>
        </div>
      </motion.div>

      {/* Discard pile */}
      <motion.div
        className="relative"
        whileHover={
          isCurrentPlayerTurn && discardPile.length > 0 ? { scale: 1.05 } : {}
        }
        whileTap={
          isCurrentPlayerTurn && discardPile.length > 0 ? { scale: 0.95 } : {}
        }
      >
        <div
          className={`relative ${(!isCurrentPlayerTurn || discardPile.length === 0) && 'pointer-events-none opacity-70'}`}
          onClick={onDrawFromDiscard}
        >
          {/* Empty discard pile placeholder */}
          {discardPile.length === 0 && (
            <div className="w-8 h-12 sm:w-12 sm:h-18 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center">
              <span className="text-white/50 text-[10px] sm:text-xs">Discard</span>
            </div>
          )}

          {/* Discard pile cards */}
          {topDiscardCard && (
            <AnimatedCard
              key={topDiscardCard.id}
              cardId={topDiscardCard.id}
              value={topDiscardCard.value}
              suit={topDiscardCard.suit}
              isFaceDown={false}
              className="w-8 h-12 sm:w-12 sm:h-18"
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default Deck
