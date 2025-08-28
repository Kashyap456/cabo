import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import DrawnCardSlot from './DrawnCardSlot'

interface DeckProps {
  deckCount?: number
  discardPile?: Array<{ value: number | string; suit?: string }>
  drawnCard?: {
    rank: string | number
    suit: string
  }
  onDrawFromDeck?: () => void
  onDrawFromDiscard?: () => void
  onDrawnCardClick?: () => void
  isCurrentPlayerTurn?: boolean
}

const Deck = ({
  deckCount = 0,
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
          {/* Top card of deck */}
          <AnimatedCard isFaceDown={true} className="relative z-10 w-12 h-18" />

          {/* Deck count */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white text-sm font-bold">
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
            <AnimatedCard
              value={topDiscardCard.value}
              suit={topDiscardCard.suit}
              isFaceDown={false}
            />
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

export default Deck
