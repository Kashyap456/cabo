import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import DrawnCardSlot from './DrawnCardSlot'

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
}: DeckProps) => {
  const topDiscardCard = discardPile[discardPile.length - 1]

  return (
    <div className="flex gap-8 items-start justify-center">
      {/* Draw deck */}
      {/* Drawn card slot */}
      <DrawnCardSlot
        drawnCard={drawnCard}
        isCurrentPlayer={isCurrentPlayerTurn}
        onCardClick={onDrawnCardClick}
      />

      <motion.div
        className="relative"
        whileHover={isCurrentPlayerTurn ? { scale: 1.05 } : {}}
        whileTap={isCurrentPlayerTurn ? { scale: 0.95 } : {}}
      >
        <div
          className={`relative cursor-pointer ${!isCurrentPlayerTurn && 'pointer-events-none opacity-70'}`}
          onClick={onDrawFromDeck}
        >
          {/* All deck cards stacked - needed for FLIP animations */}
          <div className="relative w-12 h-18">
            <AnimatePresence>
              {deckCardIds.map((cardId, _) => (
                <AnimatedCard
                  key={cardId}
                  cardId={cardId}
                  isFaceDown={true}
                  className="absolute inset-0 w-12 h-18"
                  animationDelay={0}
                />
              ))}
            </AnimatePresence>
            {/* Fallback if deck is empty */}
            {deckCardIds.length === 0 && (
              <div className="w-12 h-18 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center">
                <span className="text-white/50 text-xs">Empty</span>
              </div>
            )}
          </div>

          {/* Deck count */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-white text-sm font-bold">
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
            <div className="w-12 h-18 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center">
              <span className="text-white/50 text-xs">Discard</span>
            </div>
          )}

          {/* Discard pile cards */}
          <AnimatePresence>
            {topDiscardCard && (
              <AnimatedCard
                cardId={topDiscardCard.id}
                value={topDiscardCard.value}
                suit={topDiscardCard.suit}
                isFaceDown={false}
                className="w-12 h-18"
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

export default Deck
