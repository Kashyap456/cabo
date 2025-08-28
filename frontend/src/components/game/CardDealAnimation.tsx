import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import AnimatedCard from './AnimatedCard'

interface CardDealAnimationProps {
  isDealing: boolean
  players: Array<{
    id: string
    position: { x: number; y: number }
    cardCount: number
  }>
  onDealComplete?: () => void
}

const CardDealAnimation = ({ isDealing, players, onDealComplete }: CardDealAnimationProps) => {
  const [dealingCards, setDealingCards] = useState<Array<{
    id: string
    playerId: string
    cardIndex: number
    startTime: number
  }>>([])
  
  useEffect(() => {
    if (!isDealing) {
      setDealingCards([])
      return
    }
    
    // Create animation sequence for dealing cards
    const cards: typeof dealingCards = []
    let cardId = 0
    const cardsPerPlayer = 4 // Cabo typically deals 4 cards per player
    
    // Deal cards one at a time to each player in rotation
    for (let round = 0; round < cardsPerPlayer; round++) {
      players.forEach((player, playerIndex) => {
        cards.push({
          id: `card-${cardId++}`,
          playerId: player.id,
          cardIndex: round,
          startTime: (round * players.length + playerIndex) * 150 // 150ms delay between cards
        })
      })
    }
    
    setDealingCards(cards)
    
    // Calculate when all cards are done animating
    const totalDuration = cards.length * 150 + 800 // Last card animation time
    const timer = setTimeout(() => {
      if (onDealComplete) {
        onDealComplete()
      }
    }, totalDuration)
    
    return () => clearTimeout(timer)
  }, [isDealing, players, onDealComplete])
  
  return (
    <AnimatePresence>
      {dealingCards.map((card) => {
        const player = players.find(p => p.id === card.playerId)
        if (!player) return null
        
        return (
          <motion.div
            key={card.id}
            className="absolute pointer-events-none"
            initial={{
              left: '50%',
              top: '50%',
              x: '-50%',
              y: '-50%',
              scale: 1,
              rotate: 0,
            }}
            animate={{
              left: `${player.position.x}px`,
              top: `${player.position.y}px`,
              x: '-50%',
              y: '-50%',
              scale: 0.8,
              rotate: Math.random() * 20 - 10,
            }}
            exit={{
              opacity: 0,
              scale: 0,
            }}
            transition={{
              delay: card.startTime / 1000,
              duration: 0.8,
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{ zIndex: 1000 + card.startTime }}
          >
            <AnimatedCard
              isFaceDown={true}
              className="w-16 h-22"
            />
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}

export default CardDealAnimation