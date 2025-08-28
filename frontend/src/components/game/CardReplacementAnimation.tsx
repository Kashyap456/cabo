import { motion, AnimatePresence } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import { useEffect, useState } from 'react'

interface CardReplacementAnimationProps {
  drawnCard: { rank: any; suit: any } | null
  replacedCardIndex: number | null
  playerId: string
  players: Array<any>
  positions: Array<any>
  tableDimensions: { width: number; height: number }
  onAnimationComplete?: () => void
}

// Grid layout positions matching PlayerGridSpot
const getCardGridPosition = (index: number) => {
  const positions = [
    { row: 2, col: 0 }, // Card 1 - bottom left
    { row: 2, col: 1 }, // Card 2 - bottom right
    { row: 1, col: 0 }, // Card 3 - middle left
    { row: 1, col: 1 }, // Card 4 - middle right
    { row: 0, col: 0 }, // Card 5 - top left
    { row: 0, col: 1 }, // Card 6 - top right
  ]
  return positions[index] || { row: 0, col: 0 }
}

const CardReplacementAnimation = ({
  drawnCard,
  replacedCardIndex,
  playerId,
  players,
  positions,
  tableDimensions,
  onAnimationComplete
}: CardReplacementAnimationProps) => {
  const [animationPhase, setAnimationPhase] = useState<'discard' | 'draw' | 'flip' | 'complete' | null>(null)
  
  useEffect(() => {
    if (drawnCard && replacedCardIndex !== null) {
      // Start with discard phase
      setAnimationPhase('discard')
      
      // After discard animation, start draw phase
      const timer1 = setTimeout(() => {
        setAnimationPhase('draw')
      }, 800)
      
      // After draw animation, flip cards to show correct visibility
      const timer2 = setTimeout(() => {
        setAnimationPhase('flip')
      }, 1600)
      
      // Complete animation
      const timer3 = setTimeout(() => {
        setAnimationPhase('complete')
        onAnimationComplete?.()
      }, 2200)
      
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
      }
    }
  }, [drawnCard, replacedCardIndex, onAnimationComplete])
  
  if (!animationPhase || animationPhase === 'complete' || !drawnCard || replacedCardIndex === null) return null
  
  // Find player index
  const playerIndex = players.findIndex(p => p.id === playerId)
  if (playerIndex < 0) return null
  
  const player = players[playerIndex]
  const playerPos = positions[playerIndex]
  if (!playerPos) return null
  
  // Calculate positions relative to table
  const centerX = tableDimensions.width / 2
  const centerY = tableDimensions.height / 2
  
  // Drawn card slot position (left of deck) - in pixels
  const drawnCardPos = {
    x: centerX - 120,
    y: centerY
  }
  
  // Discard pile position (directly right of deck at same height) - in pixels
  const discardPos = {
    x: centerX + 80,
    y: centerY
  }
  
  // Card dimensions matching the grid layout
  const cardWidth = 44 // px
  const cardHeight = 56 // px
  const cardGap = 4 // px gap between cards
  
  // Calculate the specific card position in the grid
  const calculateCardPosition = (cardIndex: number) => {
    const gridPos = getCardGridPosition(cardIndex)
    
    // Calculate angle from center for the player position
    const angleFromCenter = Math.atan2(
      (playerPos.cardY ?? playerPos.y) - centerY,
      (playerPos.cardX ?? playerPos.x) - centerX
    )
    
    // Calculate the card's position within the grid
    const gridOffsetX = gridPos.col * (cardWidth + cardGap) - (cardWidth + cardGap/2)
    const gridOffsetY = gridPos.row * (cardHeight + cardGap) - (cardHeight * 1.5 + cardGap)
    
    // Rotate the grid offset based on player angle
    const rotatedOffsetX = gridOffsetX * Math.cos(angleFromCenter) - gridOffsetY * Math.sin(angleFromCenter)
    const rotatedOffsetY = gridOffsetX * Math.sin(angleFromCenter) + gridOffsetY * Math.cos(angleFromCenter)
    
    // Return absolute position
    return {
      x: (playerPos.cardX ?? playerPos.x) + rotatedOffsetX,
      y: (playerPos.cardY ?? playerPos.y) + rotatedOffsetY,
      rotation: playerPos.rotation
    }
  }
  
  const replacedCardPos = calculateCardPosition(replacedCardIndex)
  
  // Get the replaced card data if available
  const replacedCard = player.cards?.[replacedCardIndex]
  
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      <AnimatePresence>
        {/* Phase 1: Replaced card moving to discard pile */}
        {animationPhase === 'discard' && (
          <motion.div
            key="discard-card"
            className="absolute"
            initial={{
              left: replacedCardPos.x,
              top: replacedCardPos.y,
              scale: 1,
              rotate: replacedCardPos.rotation,
            }}
            animate={{
              left: discardPos.x,
              top: discardPos.y,
              scale: [1, 1.2, 1],
              rotate: [replacedCardPos.rotation, replacedCardPos.rotation + 180, 0],
            }}
            exit={{
              opacity: 0,
              transition: { duration: 0.2 }
            }}
            transition={{
              duration: 0.8,
              ease: "easeInOut",
            }}
            style={{
              transform: 'translate(-50%, -50%)',
            }}
          >
            <AnimatedCard
              value={replacedCard?.rank}
              suit={replacedCard?.suit}
              isFaceDown={!replacedCard || replacedCard.rank === '?'}
              className="h-14 w-11 shadow-2xl"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(255, 100, 100, 0.8))',
              }}
            />
          </motion.div>
        )}

        {/* Phase 2: Drawn card moving to hand position */}
        {(animationPhase === 'draw' || animationPhase === 'flip') && (
          <motion.div
            key="drawn-card"
            className="absolute"
            initial={{
              left: drawnCardPos.x,
              top: drawnCardPos.y,
              scale: 1,
              rotate: 0,
            }}
            animate={{
              left: replacedCardPos.x,
              top: replacedCardPos.y,
              scale: animationPhase === 'draw' ? [1, 1.2, 1] : 1,
              rotate: [0, -20, replacedCardPos.rotation],
            }}
            transition={{
              duration: 0.8,
              ease: "easeInOut",
            }}
            style={{
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Card flip animation */}
            <motion.div
              animate={{
                rotateY: animationPhase === 'flip' ? [0, 180, 360] : 0
              }}
              transition={{
                duration: 0.6,
                ease: "easeInOut"
              }}
              style={{
                transformStyle: 'preserve-3d'
              }}
            >
              <AnimatedCard
                value={drawnCard.rank}
                suit={drawnCard.suit}
                isFaceDown={false}
                className="h-14 w-11 shadow-2xl"
                style={{
                  filter: 'drop-shadow(0 0 20px rgba(100, 255, 100, 0.8))',
                  backfaceVisibility: 'hidden'
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Visual indicators */}
      <AnimatePresence>
        {animationPhase === 'discard' && (
          <motion.div
            key="discard-indicator"
            className="absolute"
            style={{
              left: discardPos.x,
              top: discardPos.y - 50,
              transform: 'translate(-50%, -50%)'
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-xl">
              DISCARD
            </div>
          </motion.div>
        )}
        
        {animationPhase === 'draw' && (
          <motion.div
            key="draw-indicator"
            className="absolute"
            style={{
              left: replacedCardPos.x,
              top: replacedCardPos.y - 50,
              transform: 'translate(-50%, -50%)'
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-xl">
              REPLACE
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default CardReplacementAnimation