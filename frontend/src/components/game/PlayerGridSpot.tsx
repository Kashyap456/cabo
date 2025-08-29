import { AnimatePresence, motion } from 'framer-motion'
import AnimatedCard from './AnimatedCard'
import { cn } from '@/lib/utils'

interface PlayerGridSpotProps {
  playerId: string
  nickname: string
  isHost?: boolean
  isCurrentPlayer?: boolean
  isTurn?: boolean
  cards?: Array<{
    id?: string // Card ID for animations
    value?: number | string
    suit?: string
    isFaceDown: boolean
    isSelected?: boolean
    isSelectable?: boolean
  }>
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

// Cards are laid out in a 2-column flexbox that wraps
// This creates a natural 2x3 grid for up to 6 cards

const PlayerGridSpot = ({
  playerId,
  nickname,
  isHost = false,
  isCurrentPlayer = false,
  isTurn = false,
  cards = [],
  position,
  tableDimensions,
  className,
  onCardClick,
}: PlayerGridSpotProps) => {
  const { width: tableWidth, height: tableHeight } = tableDimensions
  const centerX = tableWidth / 2
  const centerY = tableHeight / 2

  // Use provided badge and card positions
  const cardX = position.cardX || position.x
  const cardY = position.cardY || position.y
  const badgeX = position.badgeX || position.x
  const badgeY = position.badgeY || position.y

  // Calculate the angle from center (for card container orientation)
  const angleFromCenter =
    Math.atan2(cardY - centerY, cardX - centerX) * (180 / Math.PI) - 90

  // Convert to percentages for responsive positioning
  const cardXPercent = (cardX / tableWidth) * 100
  const cardYPercent = (cardY / tableHeight) * 100
  const badgeXPercent = (badgeX / tableWidth) * 100
  const badgeYPercent = (badgeY / tableHeight) * 100

  // Card dimensions - w-card = 3.5rem = 56px, h-card = 4.5rem = 72px
  const cardWidth = 64
  const cardHeight = 96
  const cardGap = 8

  return (
    <>
      {/* Debug: Badge position dot */}
      <div
        className="absolute w-3 h-3 bg-blue-500 rounded-full z-50"
        style={{
          left: `${badgeXPercent}%`,
          top: `${badgeYPercent}%`,
          translate: '-50% -50%',
        }}
      />

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

      {/* Debug: Card position dot */}
      <div
        className="absolute w-3 h-3 bg-green-500 rounded-full z-50"
        style={{
          left: `${cardXPercent}%`,
          top: `${cardYPercent}%`,
          translate: '-50% -50%',
        }}
      />

      {/* Cards container - grid layout */}
      <motion.div
        className="absolute"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          left: `${cardXPercent}%`,
          top: `${cardYPercent}%`,
          translate: '-50% -50%',
          rotate: angleFromCenter,
        }}
      >
        {/* Grid container for cards - 2x3 grid layout */}
        <div
          className={cn(
            'grid grid-cols-2 gap-2 place-items-center',
            cards.length <= 2 && 'grid-rows-1',
            cards.length > 2 && cards.length <= 4 && 'grid-rows-2',
            cards.length > 4 && 'grid-rows-3',
            cards.length > 6 && 'grid-rows-4',
            cards.length > 8 && 'grid-rows-5',
            cards.length > 10 && 'grid-rows-6',
            cards.length > 12 && 'grid-rows-7',
            cards.length > 14 && 'grid-rows-8',
            cards.length > 16 && 'grid-rows-9',
            cards.length > 18 && 'grid-rows-10',
            cards.length > 20 && 'grid-rows-11',
          )}
        >
          {cards.map((card, index) => {
            return (
              <AnimatePresence key={card.id}>
                <div className="relative">
                  <AnimatedCard
                    cardId={card.id} // Pass card ID for layoutId animations
                    value={card.value}
                    suit={card.suit}
                    isFaceDown={card.isFaceDown}
                    onClick={onCardClick ? () => onCardClick(index) : undefined}
                  />
                  {/* Selection indicator */}
                  {card.isSelected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-1.5 py-0.5 rounded text-xs font-bold"
                    >
                      SEL
                    </motion.div>
                  )}
                </div>
              </AnimatePresence>
            )
          })}
        </div>

        {/* Placeholder if no cards */}
        {cards.length === 0 && (
          <div className="h-14 w-11 border border-dashed border-white/20 rounded" />
        )}
      </motion.div>
    </>
  )
}

export default PlayerGridSpot
