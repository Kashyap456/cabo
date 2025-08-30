import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface AnimatedCardProps {
  cardId?: string // Unique card identity for layoutId
  value?: number | string
  suit?: string
  isFlipped?: boolean
  isFaceDown?: boolean
  onClick?: () => void
  className?: string
  animationDelay?: number
  isSelected?: boolean
  isSelectable?: boolean
}

const AnimatedCard = ({
  cardId,
  value,
  suit,
  isFlipped = false,
  isFaceDown = true,
  onClick,
  className,
  animationDelay = 0,
  isSelected = false,
  isSelectable = false,
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
      className={cn(
        'w-12 h-18 bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center shadow-lg',
        getSuitColor(),
        isJoker && suit === 'spades' && 'bg-black',
        isJoker && suit === 'hearts' && 'bg-red-500',
        className,
      )}
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
    // OUTER: shared-layout container, no custom transforms
    <motion.div
      layoutId={cardId}
      layout
      initial={false}
      animate={{ scale: isSelected ? 1.05 : 1, opacity: 1 }}
      // Only apply exit animation if there's no layoutId (no FLIP animation)
      exit={cardId ? undefined : { opacity: 0 }}
      className={cn('w-12 h-18', className, isSelectable ? 'cursor-pointer' : 'cursor-default')}
      whileHover={isSelectable ? { scale: 1.05 } : {}}
      whileTap={isSelectable ? { scale: 0.95 } : {}}
      onClick={isSelectable ? onClick : undefined}
    >
      {/* INNER: flip-only wrapper */}
      <AnimatePresence mode="popLayout" initial={false}>
        {showFace ? (
          <motion.div
            key="face"
            initial={{ rotateY: -90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: 90 }}
            transition={{ duration: 0.3 }}
            style={{ transformStyle: 'preserve-3d' }}
            className="w-full h-full"
          >
            {cardFace}
          </motion.div>
        ) : (
          <motion.div
            key="back"
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: -90 }}
            transition={{ duration: 0.3 }}
            style={{ transformStyle: 'preserve-3d' }}
            className="w-full h-full"
          >
            {cardBack}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default AnimatedCard
