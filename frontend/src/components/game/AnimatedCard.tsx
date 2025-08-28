import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface AnimatedCardProps {
  value?: number | string
  suit?: string
  isFlipped?: boolean
  isFaceDown?: boolean
  onClick?: () => void
  className?: string
  animationDelay?: number
  position?: { x: number; y: number }
  rotation?: number
}

const AnimatedCard = ({
  value,
  suit,
  isFlipped = false,
  isFaceDown = true,
  onClick,
  className,
  animationDelay = 0,
  position = { x: 0, y: 0 },
  rotation = 0,
}: AnimatedCardProps) => {
  const [isAnimatingFlip, setIsAnimatingFlip] = useState(false)
  const [showFace, setShowFace] = useState(!isFaceDown)

  useEffect(() => {
    if (!isFaceDown && !showFace) {
      setIsAnimatingFlip(true)
      setTimeout(() => {
        setShowFace(true)
        setIsAnimatingFlip(false)
      }, 300)
    } else if (isFaceDown && showFace) {
      setIsAnimatingFlip(true)
      setTimeout(() => {
        setShowFace(false)
        setIsAnimatingFlip(false)
      }, 300)
    }
  }, [isFaceDown, showFace])

  const getRankDisplay = (rank: number | string | undefined) => {
    if (rank === undefined) return '?'

    const rankValue = typeof rank === 'string' ? rank.toUpperCase() : rank

    switch (rankValue) {
      case 'ACE':
      case 1:
        return 'A'
      case 'JACK':
      case 11:
        return 'J'
      case 'QUEEN':
      case 12:
        return 'Q'
      case 'KING':
      case 13:
        return 'K'
      case 'JOKER':
      case 0:
        return '🃏'
      default:
        return rankValue.toString()
    }
  }

  const getSuitSymbol = (suit?: string) => {
    if (!suit) return ''
    switch (suit.toLowerCase()) {
      case 'hearts':
        return '♥'
      case 'diamonds':
        return '♦'
      case 'clubs':
        return '♣'
      case 'spades':
        return '♠'
      default:
        return ''
    }
  }

  const getSuitColor = () => {
    if (!suit) return ''
    const suitLower = suit.toLowerCase()
    if (suitLower === 'hearts' || suitLower === 'diamonds') {
      return 'text-red-500'
    }
    if (suitLower === 'clubs' || suitLower === 'spades') {
      return 'text-gray-900'
    }
    return ''
  }

  const cardBack = (
    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-700 border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center shadow-lg">
      <div className="text-white text-xs font-bold mb-1">CABO</div>
      <div className="text-white text-2xl">🌴</div>
    </div>
  )

  const isJoker = value === 'JOKER' || value === 0
  const rankDisplay = getRankDisplay(value)

  const cardFace = (
    <div
      className={
        'w-12 h-18 bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center shadow-lg'
      }
    >
      {isJoker ? (
        <div className="text-4xl">🃏</div>
      ) : (
        <>
          <div className="font-bold text-xl">{rankDisplay}</div>
          {suit && <div className="text-2xl -mt-1">{getSuitSymbol(suit)}</div>}
        </>
      )}
    </div>
  )

  return (
    <motion.div
      className={cn(
        'cursor-pointer preserve-3d',
        'w-12 h-18', // Default width if not specified
        !className?.includes('h-') && 'h-card', // Default height if not specified
        isAnimatingFlip && 'pointer-events-none',
        className,
      )}
      initial={{
        x: position.x,
        y: position.y,
        rotate: rotation,
        scale: 0,
      }}
      animate={{
        x: position.x,
        y: position.y,
        rotate: rotation,
        rotateY: isFlipped ? 180 : 0,
        scale: 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        delay: animationDelay,
      }}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <AnimatePresence mode="wait">
        {showFace ? (
          <motion.div
            key="face"
            className="w-full h-full"
            initial={{ rotateY: -90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: 90 }}
            transition={{ duration: 0.3 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {cardFace}
          </motion.div>
        ) : (
          <motion.div
            key="back"
            className="w-full h-full"
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: -90 }}
            transition={{ duration: 0.3 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {cardBack}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default AnimatedCard
