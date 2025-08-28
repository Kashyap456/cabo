import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'

interface DeckProps {
  deckCount?: number
  discardPile?: Array<{ value: number | string; suit?: string }>
  onDrawFromDeck?: () => void
  onDrawFromDiscard?: () => void
  isCurrentPlayerTurn?: boolean
}

const Deck = ({
  deckCount = 0,
  discardPile = [],
  onDrawFromDeck,
  onDrawFromDiscard,
  isCurrentPlayerTurn = false
}: DeckProps) => {
  const topDiscardCard = discardPile[discardPile.length - 1]
  
  return (
    <div className="flex gap-8 items-center">
      {/* Draw deck */}
      <motion.div
        className="relative"
        whileHover={isCurrentPlayerTurn ? { scale: 1.05 } : {}}
        whileTap={isCurrentPlayerTurn ? { scale: 0.95 } : {}}
      >
        <div
          className={`relative cursor-pointer ${!isCurrentPlayerTurn && 'pointer-events-none opacity-70'}`}
          onClick={onDrawFromDeck}
        >
          {/* Stack effect for deck */}
          {[...Array(Math.min(3, Math.ceil(deckCount / 10)))].map((_, i) => (
            <div
              key={i}
              className="absolute w-20 h-28 bg-gradient-to-br from-blue-800 to-blue-900 border-2 border-white rounded-lg"
              style={{
                top: -i * 2,
                left: -i * 2,
                zIndex: -i,
              }}
            />
          ))}
          
          {/* Top card of deck */}
          <AnimatedCard
            isFaceDown={true}
            className="relative z-10"
          />
          
          {/* Deck count */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-white text-sm font-bold">
            {deckCount}
          </div>
        </div>
      </motion.div>

      {/* Discard pile */}
      <motion.div
        className="relative"
        whileHover={isCurrentPlayerTurn && discardPile.length > 0 ? { scale: 1.05 } : {}}
        whileTap={isCurrentPlayerTurn && discardPile.length > 0 ? { scale: 0.95 } : {}}
      >
        <div
          className={`relative ${(!isCurrentPlayerTurn || discardPile.length === 0) && 'pointer-events-none opacity-70'}`}
          onClick={onDrawFromDiscard}
        >
          {/* Empty discard pile placeholder */}
          {discardPile.length === 0 && (
            <div className="w-20 h-28 border-2 border-dashed border-white/30 rounded-lg flex items-center justify-center">
              <span className="text-white/50 text-xs">Discard</span>
            </div>
          )}
          
          {/* Discard pile cards */}
          <AnimatePresence>
            {discardPile.slice(-3).map((card, index) => (
              <motion.div
                key={`${card.value}-${card.suit}-${index}`}
                className="absolute"
                initial={{ x: -100, y: -100, rotate: -180, opacity: 0 }}
                animate={{ 
                  x: index * 2, 
                  y: index * 2, 
                  rotate: Math.random() * 20 - 10,
                  opacity: 1 
                }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ zIndex: index }}
              >
                <AnimatedCard
                  value={card.value}
                  suit={card.suit}
                  isFaceDown={false}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

export default Deck