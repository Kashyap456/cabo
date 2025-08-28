import { motion } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import { useEffect, useState } from 'react'

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
  const [isAnimating, setIsAnimating] = useState(false)
  
  useEffect(() => {
    if (selectedCards.length === 2) {
      setIsAnimating(true)
      // Reset after animation completes
      const timer = setTimeout(() => {
        setIsAnimating(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [selectedCards])
  
  if (selectedCards.length !== 2 || !isAnimating) return null
  
  const [card1Sel, card2Sel] = selectedCards
  
  // Find player indices
  const player1Index = players.findIndex(p => p.id === card1Sel.playerId)
  const player2Index = players.findIndex(p => p.id === card2Sel.playerId)
  
  if (player1Index < 0 || player2Index < 0) return null
  
  // Get player data
  const player1 = players[player1Index]
  const player2 = players[player2Index]
  
  // Get positions
  const pos1 = positions[player1Index]
  const pos2 = positions[player2Index]
  
  if (!pos1 || !pos2) return null
  
  // Calculate the center position for the table
  const centerX = tableDimensions.width / 2
  const centerY = tableDimensions.height / 2
  
  // Calculate card-specific offsets within the hand
  const calculateCardOffset = (cardIndex: number, totalCards: number, playerPos: any) => {
    // Match the PlayerSpot styling
    const fanAngle = 5 // degrees per card
    const cardRotation = cardIndex * fanAngle - (totalCards - 1) * 2.5
    const cardSpacing = 30 // px between card centers (accounting for overlap)
    
    // Calculate angle from center for the base position
    const angleFromCenter = Math.atan2(
      (playerPos.cardY ?? playerPos.y) - centerY,
      (playerPos.cardX ?? playerPos.x) - centerX
    )
    
    // Cards are laid out horizontally relative to the player's rotation
    // Calculate perpendicular angle for card spread
    const perpAngle = angleFromCenter + Math.PI / 2
    
    // Calculate position offset for this specific card in the hand
    const centerCardIndex = (totalCards - 1) / 2
    const offsetFromCenter = (cardIndex - centerCardIndex) * cardSpacing
    
    const offsetX = offsetFromCenter * Math.cos(perpAngle)
    const offsetY = offsetFromCenter * Math.sin(perpAngle)
    
    return { offsetX, offsetY, rotation: cardRotation }
  }
  
  // Get card offsets
  const card1Offset = calculateCardOffset(card1Sel.cardIndex, player1.cards?.length || 4, pos1)
  const card2Offset = calculateCardOffset(card2Sel.cardIndex, player2.cards?.length || 4, pos2)
  
  // Calculate actual card positions in pixels
  const card1Pos = {
    x: (pos1.cardX ?? pos1.x) + card1Offset.offsetX,
    y: (pos1.cardY ?? pos1.y) + card1Offset.offsetY,
    rotation: pos1.rotation + card1Offset.rotation
  }
  
  const card2Pos = {
    x: (pos2.cardX ?? pos2.x) + card2Offset.offsetX,
    y: (pos2.cardY ?? pos2.y) + card2Offset.offsetY,
    rotation: pos2.rotation + card2Offset.rotation
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      {/* Card 1 animating to Card 2's position */}
      <motion.div
        className="absolute"
        initial={{
          left: card1Pos.x,
          top: card1Pos.y,
          scale: 1,
          rotate: card1Pos.rotation,
        }}
        animate={{
          left: card2Pos.x,
          top: card2Pos.y,
          scale: [1, 1.5, 1],
          rotate: [card1Pos.rotation, card1Pos.rotation - 360, card2Pos.rotation],
        }}
        transition={{
          duration: 1.2,
          ease: "easeInOut",
        }}
        style={{
          transform: 'translate(-50%, -50%)',
        }}
      >
        <AnimatedCard
          isFaceDown={true}
          className="h-20 w-14 shadow-2xl"
          style={{
            filter: 'drop-shadow(0 0 20px rgba(255, 255, 0, 0.8))',
          }}
        />
      </motion.div>

      {/* Card 2 animating to Card 1's position */}
      <motion.div
        className="absolute"
        initial={{
          left: card2Pos.x,
          top: card2Pos.y,
          scale: 1,
          rotate: card2Pos.rotation,
        }}
        animate={{
          left: card1Pos.x,
          top: card1Pos.y,
          scale: [1, 1.5, 1],
          rotate: [card2Pos.rotation, card2Pos.rotation + 360, card1Pos.rotation],
        }}
        transition={{
          duration: 1.2,
          ease: "easeInOut",
        }}
        style={{
          transform: 'translate(-50%, -50%)',
        }}
      >
        <AnimatedCard
          isFaceDown={true}
          className="h-20 w-14 shadow-2xl"
          style={{
            filter: 'drop-shadow(0 0 20px rgba(255, 255, 0, 0.8))',
          }}
        />
      </motion.div>
      
      {/* Visual indicator that swap is happening */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ 
          opacity: [0, 1, 1, 0],
          scale: [0, 1, 1, 0],
        }}
        transition={{
          duration: 1.2,
          times: [0, 0.2, 0.8, 1],
        }}
      >
        <div className="bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-lg shadow-xl">
          SWAPPING!
        </div>
      </motion.div>
    </div>
  )
}

export default CardSwapAnimation