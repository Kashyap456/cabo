interface CardProps {
  card: {
    rank: string | number | '?'
    suit: string | null | '?'
    isFaceUp?: boolean
    value?: number
  }
  size?: 'small' | 'medium' | 'large'
  onClick?: () => void
  className?: string
  isSelected?: boolean
  isSelectable?: boolean
  showValue?: boolean
}

export default function Card({
  card,
  size = 'medium',
  onClick,
  className = '',
  isSelected = false,
  isSelectable = false,
  showValue = false,
}: CardProps) {
  // Determine card dimensions based on size
  const sizeClasses = {
    small: 'w-12 h-18 text-base',
    medium: 'w-16 h-24 text-xl',
    large: 'w-20 h-30 text-2xl',
  }

  // Determine if the card is face up
  const isFaceUp = card.isFaceUp !== false && card.rank !== '?'

  // Get suit symbol
  const getSuitSymbol = (suit: string | null | '?') => {
    if (!suit || suit === '?') return ''
    switch (suit.toLowerCase()) {
      case 'hearts': return '♥'
      case 'diamonds': return '♦'
      case 'clubs': return '♣'
      case 'spades': return '♠'
      default: return ''
    }
  }

  // Get rank display
  const getRankDisplay = (rank: string | number | '?') => {
    if (rank === '?' || rank === undefined) return '?'
    
    // Convert string numbers to actual numbers for comparison
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

  // Get suit color
  const getSuitColor = () => {
    if (!isFaceUp || !card.suit) return ''
    const suit = card.suit.toLowerCase()
    if (suit === 'hearts' || suit === 'diamonds') {
      return 'text-red-500'
    }
    if (suit === 'clubs' || suit === 'spades') {
      return 'text-gray-900'
    }
    return ''
  }

  // Check if it's a joker
  const isJoker = card.rank === 'JOKER' || card.rank === 0

  // Get the display content
  const rankDisplay = getRankDisplay(card.rank)
  const suitDisplay = getSuitSymbol(card.suit)

  // Build card classes
  const cardClasses = `
    ${sizeClasses[size]}
    ${isFaceUp ? 'bg-white' : 'bg-gradient-to-br from-blue-600 to-blue-700'}
    ${isSelected ? 'ring-4 ring-yellow-400 scale-105' : ''}
    ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
    ${onClick ? 'cursor-pointer' : ''}
    border-2 border-gray-300 rounded-lg
    flex flex-col items-center justify-center
    font-bold shadow-lg
    transition-all duration-200
    ${getSuitColor()}
    ${className}
  `

  // Special styling for red kings (worth -1)
  const isRedKing = (card.rank === 'KING' || card.rank === 13) && 
    (card.suit === 'hearts' || card.suit === 'diamonds')

  return (
    <div className="relative">
      <div onClick={onClick} className={cardClasses}>
        {isFaceUp ? (
          isJoker ? (
            // Special rendering for Joker
            <div className="text-4xl">🃏</div>
          ) : (
            // Regular card rendering
            <div className="flex flex-col items-center justify-center">
              <div className={`font-bold ${isRedKing ? 'text-red-600' : ''}`}>
                {rankDisplay}
              </div>
              {suitDisplay && (
                <div className={`-mt-1 ${size === 'large' ? 'text-3xl' : size === 'small' ? 'text-lg' : 'text-2xl'}`}>
                  {suitDisplay}
                </div>
              )}
            </div>
          )
        ) : (
          // Card back
          <div className="flex flex-col items-center justify-center">
            <div className="text-white text-xs font-bold mb-1">CABO</div>
            <div className="text-white opacity-80">?</div>
          </div>
        )}
      </div>
      
      {/* Show card value if requested (for endgame) */}
      {showValue && isFaceUp && card.value !== undefined && (
        <div className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 
          ${card.value < 0 ? 'bg-green-600' : card.value === 0 ? 'bg-blue-600' : 'bg-gray-800'} 
          text-white text-xs px-2 py-1 rounded font-medium`}>
          {card.value > 0 ? `+${card.value}` : card.value === 0 ? '0' : card.value}
        </div>
      )}
    </div>
  )
}