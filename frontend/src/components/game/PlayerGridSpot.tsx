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
            'grid grid-rows-2 gap-2 place-items-center',
            cards.length <= 2 && 'grid-cols-1',
            cards.length > 2 && cards.length <= 4 && 'grid-cols-2',
            cards.length > 4 && 'grid-cols-3',
            cards.length > 6 && 'grid-cols-4',
            cards.length > 8 && 'grid-cols-5',
            cards.length > 10 && 'grid-cols-6',
            cards.length > 12 && 'grid-cols-7',
            cards.length > 14 && 'grid-cols-8',
            cards.length > 16 && 'grid-cols-9',
            cards.length > 18 && 'grid-cols-10',
            cards.length > 20 && 'grid-cols-11',
          )}
        >
          {cards.map((card, index) => {
            return (
              <AnimatePresence key={card.id}>
                <motion.div
                  className={cn(
                    'relative transition-all duration-200',
                    card.isSelected && 'scale-110 z-20',
                    card.isSelectable &&
                      !card.isSelected &&
                      'hover:scale-105 cursor-pointer',
                    !card.isSelectable && 'cursor-default',
                  )}
                  whileHover={card.isSelectable && !card.isSelected ? { scale: 1.05 } : {}}
                  whileTap={card.isSelectable ? { scale: 0.95 } : {}}
                >
                  {/* Selection ring */}
                  {card.isSelected && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute inset-0 ring-4 ring-yellow-400 rounded-lg z-10 pointer-events-none"
                    />
                  )}

                  {/* Selectable hint ring */}
                  {card.isSelectable && !card.isSelected && (
                    <div className="absolute inset-0 ring-2 ring-blue-400/50 rounded-lg pointer-events-none" />
                  )}

                  <AnimatedCard
                    cardId={card.id} // Pass card ID for layoutId animations
                    value={card.value}
                    suit={card.suit}
                    isFaceDown={card.isFaceDown}
                    isSelected={card.isSelected}
                    isSelectable={card.isSelectable}
                    onClick={onCardClick ? () => onCardClick(index) : undefined}
                  />

                  {/* Selection badge */}
                  {card.isSelected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0, y: 10 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-2 py-1 rounded-full text-xs font-bold shadow-lg"
                    >
                      SELECTED
                    </motion.div>
                  )}
                </motion.div>
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
