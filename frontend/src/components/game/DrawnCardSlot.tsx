import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'

interface DrawnCardSlotProps {
  drawnCard?: {
    id?: string
    rank: string | number
    suit: string
    isFaceDown?: boolean
  }
  isCurrentPlayer: boolean
  onCardClick?: () => void
}

const DrawnCardSlot = ({
  drawnCard,
  isCurrentPlayer,
  onCardClick,
}: DrawnCardSlotProps) => {
  return (
    <div className="relative w-12 h-18">
      {/* Label for drawn card area */}
      {drawnCard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 text-white text-xs font-bold whitespace-nowrap"
        >
          {isCurrentPlayer ? 'Your Draw' : 'Drawn Card'}
        </motion.div>
      )}

      {/* Card slot */}
      <div className="relative w-card h-card">
        <AnimatePresence>
          {drawnCard ? (
            <AnimatedCard
              key={drawnCard.id || 'drawn-card'}
              cardId={drawnCard.id}
              value={drawnCard.isFaceDown ? undefined : drawnCard.rank}
              suit={drawnCard.isFaceDown ? undefined : drawnCard.suit}
              isFaceDown={drawnCard.isFaceDown !== false}
              isFlipped={false} // Never use the flip that mirrors
              className="w-12 h-18 absolute inset-0"
              onClick={isCurrentPlayer ? onCardClick : undefined}
            />
          ) : (
            // Empty slot placeholder
            <div className="w-12 h-18 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center text-center">
              <span className="text-white/30 text-xs">Draw Slot</span>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Hint text for current player */}
      {drawnCard && isCurrentPlayer && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-green-400 text-xs whitespace-nowrap"
        >
          Click to play
        </motion.p>
      )}
    </div>
  )
}

export default DrawnCardSlot
