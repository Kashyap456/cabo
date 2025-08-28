import { motion } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import { cn } from '@/lib/utils'

interface PlayerSpotProps {
  nickname: string
  isHost?: boolean
  isCurrentPlayer?: boolean
  isTurn?: boolean
  cards?: Array<{ value?: number | string; suit?: string; isFaceDown: boolean }>
  position: {
    x: number
    y: number
    rotation: number
    badgeX?: number
    badgeY?: number
    cardX?: number
    cardY?: number
  }
  tableDimensions: { width: number; height: number }
  className?: string
  onCardClick?: (cardIndex: number) => void
}

const PlayerSpot = ({
  nickname,
  isHost = false,
  isCurrentPlayer = false,
  isTurn = false,
  cards = [],
  position,
  tableDimensions,
  className,
  onCardClick,
}: PlayerSpotProps) => {
  const { width: tableWidth, height: tableHeight } = tableDimensions
  const centerX = tableWidth / 2
  const centerY = tableHeight / 2

  // Use provided badge and card positions (they should always be defined now)
  const cardX = position.cardX || position.x
  const cardY = position.cardY || position.y
  const badgeX = position.badgeX || position.x
  const badgeY = position.badgeY || position.y

  // Calculate the angle from center (for card orientation)
  // Cards should face the center, so rotate 180 degrees from the outward angle
  const angleFromCenter =
    Math.atan2(cardY - centerY, cardX - centerX) * (180 / Math.PI) - 90

  // Convert to percentages for responsive positioning
  const cardXPercent = (cardX / tableWidth) * 100
  const cardYPercent = (cardY / tableHeight) * 100
  const badgeXPercent = (badgeX / tableWidth) * 100
  const badgeYPercent = (badgeY / tableHeight) * 100

  return (
    <>
      {/* Player name badge - positioned outside table, always readable */}
      <motion.div
        className={cn('absolute flex items-center justify-center', className)}
        initial={{ opacity: 0, scale: 0 }}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.1 }}
        style={{
          left: `${badgeXPercent}%`,
          top: `${badgeYPercent}%`,
          translate: '-50% -50%',
        }}
      >
        <div
          className={cn(
            'px-3 py-1.5 rounded-lg shadow-lg',
            isCurrentPlayer
              ? 'bg-yellow-600 text-amber-900'
              : 'bg-amber-800 text-yellow-100',
            isTurn && 'ring-4 ring-yellow-400 animate-pulse',
          )}
        >
          <div className="flex items-center gap-1">
            <span className="font-bold text-xs">{nickname}</span>
            {isCurrentPlayer && (
              <span className="text-xs bg-yellow-400 text-amber-900 px-1 rounded font-semibold">
                YOU
              </span>
            )}
            {isHost && (
              <span className="text-xs bg-amber-900 text-yellow-300 px-1 rounded">
                HOST
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Cards container - positioned at table edge, rotated to face center */}
      <motion.div
        className="absolute flex gap-0.5"
        initial={{ opacity: 0, scale: 0, rotate: angleFromCenter }}
        animate={{
          opacity: 1,
          scale: 1,
          rotate: angleFromCenter,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          left: `${cardXPercent}%`,
          top: `${cardYPercent}%`,
          translate: '-50% -50%',
        }}
      >
        {cards.map((card, index) => (
          <motion.div
            key={index}
            className="relative"
            style={{
              transform: `rotate(${index * 5 - (cards.length - 1) * 2.5}deg)`,
              marginLeft: index === 0 ? 0 : '-15px',
            }}
            whileHover={onCardClick ? { scale: 1.1, zIndex: 10 } : {}}
            whileTap={onCardClick ? { scale: 0.95 } : {}}
          >
            <AnimatedCard
              value={card.value}
              suit={card.suit}
              isFaceDown={card.isFaceDown}
              className="h-16 w-11" // 7:5 ratio - height:width
              animationDelay={index * 0.1}
              onClick={onCardClick ? () => onCardClick(index) : undefined}
            />
          </motion.div>
        ))}

        {/* Placeholder if no cards - just show empty spot */}
        {cards.length === 0 && (
          <div className="h-16 w-11 border border-dashed border-white/20 rounded" />
        )}
      </motion.div>
    </>
  )
}

export default PlayerSpot
