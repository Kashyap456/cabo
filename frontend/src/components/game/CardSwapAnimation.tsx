import { motion } from 'framer-motion'
import AnimatedCard from './AnimatedCard'

interface SwapAnimationProps {
  selectedCards: Array<{
    playerId: string
    cardIndex: number
  }>
  players: Array<any>
  positions: Array<any>
  tableDimensions: { width: number; height: number }
}

const CardSwapAnimation = ({ selectedCards, players, positions, tableDimensions }: SwapAnimationProps) => {
  if (selectedCards.length !== 2) return null
  
  const [card1Sel, card2Sel] = selectedCards
  
  // Find player indices
  const player1Index = players.findIndex(p => p.id === card1Sel.playerId)
  const player2Index = players.findIndex(p => p.id === card2Sel.playerId)
  
  if (player1Index < 0 || player2Index < 0) return null
  
  // Get positions
  const pos1 = positions[player1Index]
  const pos2 = positions[player2Index]
  
  if (!pos1 || !pos2) return null
  
  // Calculate pixel positions from percentages
  const card1Pos = {
    x: ((pos1.cardX ?? pos1.x) / 100) * tableDimensions.width,
    y: ((pos1.cardY ?? pos1.y) / 100) * tableDimensions.height
  }
  
  const card2Pos = {
    x: ((pos2.cardX ?? pos2.x) / 100) * tableDimensions.width,
    y: ((pos2.cardY ?? pos2.y) / 100) * tableDimensions.height
  }


  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Card 1 animating to Card 2's position */}
      <motion.div
        className="absolute"
        initial={{
          left: card1Pos.x,
          top: card1Pos.y,
          x: '-50%',
          y: '-50%',
          scale: 1,
          rotate: 0,
        }}
        animate={{
          left: card2Pos.x,
          top: card2Pos.y,
          scale: [1, 1.3, 1],
          rotate: [0, -10, 10, 0],
          transition: {
            duration: 1.2,
            ease: "easeInOut",
          }
        }}
      >
        <motion.div
          className="relative"
          animate={{
            y: [0, -40, 0],
          }}
          transition={{
            duration: 1.2,
            ease: "easeInOut",
          }}
        >
          <AnimatedCard
            isFaceDown={true}
            className="h-20 w-14"
          />
        </motion.div>
      </motion.div>

      {/* Card 2 animating to Card 1's position */}
      <motion.div
        className="absolute"
        initial={{
          left: card2Pos.x,
          top: card2Pos.y,
          x: '-50%',
          y: '-50%',
          scale: 1,
          rotate: 0,
        }}
        animate={{
          left: card1Pos.x,
          top: card1Pos.y,
          scale: [1, 1.3, 1],
          rotate: [0, 10, -10, 0],
          transition: {
            duration: 1.2,
            ease: "easeInOut",
          }
        }}
      >
        <motion.div
          className="relative"
          animate={{
            y: [0, -40, 0],
          }}
          transition={{
            duration: 1.2,
            ease: "easeInOut",
          }}
        >
          <AnimatedCard
            isFaceDown={true}
            className="h-20 w-14"
          />
        </motion.div>
      </motion.div>
    </div>
  )
}

export default CardSwapAnimation