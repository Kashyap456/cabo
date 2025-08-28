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
  rotation = 0
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

  const cardBack = (
    <div className="w-full h-full bg-gradient-to-br from-blue-800 to-blue-900 border-2 border-white rounded-lg flex items-center justify-center">
      <div className="w-16 h-20 bg-white/10 rounded border border-white/20" />
    </div>
  )

  const cardFace = (
    <div className="w-full h-full bg-white border-2 border-gray-300 rounded-lg flex flex-col items-center justify-center">
      <span className="text-2xl font-bold text-black">{value}</span>
      {suit && <span className="text-lg">{suit}</span>}
    </div>
  )

  return (
    <motion.div
      className={cn(
        "w-20 h-28 cursor-pointer preserve-3d",
        isAnimatingFlip && "pointer-events-none",
        className
      )}
      initial={{ 
        x: position.x, 
        y: position.y,
        rotate: rotation,
        scale: 0
      }}
      animate={{ 
        x: position.x, 
        y: position.y,
        rotate: rotation,
        rotateY: isFlipped ? 180 : 0,
        scale: 1
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        delay: animationDelay
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