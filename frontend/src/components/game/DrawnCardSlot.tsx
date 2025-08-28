import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'

interface DrawnCardSlotProps {
  drawnCard?: {
    rank: string | number
    suit: string
  }
  isCurrentPlayer: boolean
  onCardClick?: () => void
}

const DrawnCardSlot = ({ drawnCard, isCurrentPlayer, onCardClick }: DrawnCardSlotProps) => {
  return (
    <div className="relative">
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
      <div className="relative h-28 w-20">
        <AnimatePresence mode="wait">
          {drawnCard ? (
            <motion.div
              key="drawn-card"
              initial={{ 
                x: 100, // Start from deck position (to the right)
                y: 0,
                scale: 0.8
              }}
              animate={{ 
                x: 0,
                y: 0,
                scale: 1
              }}
              exit={{ 
                x: 0,
                y: -100,
                scale: 0,
                opacity: 0
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="absolute inset-0 cursor-pointer"
              onClick={isCurrentPlayer ? onCardClick : undefined}
              whileHover={isCurrentPlayer ? { scale: 1.05 } : {}}
              whileTap={isCurrentPlayer ? { scale: 0.95 } : {}}
            >
              <AnimatedCard
                value={isCurrentPlayer ? drawnCard.rank : undefined}
                suit={isCurrentPlayer ? drawnCard.suit : undefined}
                isFaceDown={!isCurrentPlayer}
                className="h-28 w-20"
                isFlipped={false} // Never use the flip that mirrors
              />
            </motion.div>
          ) : (
            // Empty slot placeholder
            <div className="w-full h-full border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center">
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