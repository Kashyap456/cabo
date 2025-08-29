import { motion, AnimatePresence } from 'framer-motion'
import { useGamePlayStore, GamePhase } from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'

const GameStatus = () => {
  const { 
    phase, 
    specialAction, 
    stackCaller, 
    getCurrentPlayer, 
    getPlayerById,
    caboCalledBy,
    players
  } = useGamePlayStore()
  const currentUserId = useAuthStore(state => state.sessionId)
  const currentPlayer = getCurrentPlayer()
  
  // Check if cabo was called
  const caboPlayer = players.find(p => p.hasCalledCabo)
  
  // Collect all active statuses
  const statuses = []
  
  // Stack called
  if (stackCaller) {
    statuses.push({
      key: 'stack',
      type: 'stack',
      title: 'Stack Called!',
      message: `${stackCaller.nickname} called STACK!`,
      color: 'bg-red-50 border-red-400',
      titleColor: 'text-red-800',
      messageColor: 'text-red-700'
    })
  }
  
  // Special action
  if (specialAction && !specialAction.isComplete) {
    const actionPlayer = getPlayerById(specialAction.playerId)
    const actionDescriptions = {
      'VIEW_OWN': 'viewing their card',
      'VIEW_OPPONENT': 'viewing an opponent\'s card',
      'SWAP_CARDS': 'swapping cards',
      'KING_VIEW': 'using King to view a card',
      'KING_SWAP': 'using King to swap cards'
    }
    
    statuses.push({
      key: 'special',
      type: 'special',
      title: 'Special Action in Progress',
      message: `${actionPlayer?.nickname || 'Unknown'} is ${actionDescriptions[specialAction.type] || specialAction.type}`,
      color: 'bg-yellow-50 border-yellow-400',
      titleColor: 'text-yellow-800',
      messageColor: 'text-yellow-700'
    })
  }
  
  // Cabo called
  if (caboPlayer) {
    statuses.push({
      key: 'cabo',
      type: 'cabo',
      title: 'CABO! Final Round',
      message: `${caboPlayer.nickname} called Cabo - last round!`,
      color: 'bg-orange-50 border-orange-400',
      titleColor: 'text-orange-800',
      messageColor: 'text-orange-700'
    })
  }
  
  // Current turn status (only show if no other critical statuses)
  if (statuses.length === 0 && (phase === GamePhase.DRAW_PHASE || phase === GamePhase.CARD_DRAWN)) {
    const isMyTurn = currentPlayer?.id === currentUserId
    
    statuses.push({
      key: 'turn',
      type: 'turn',
      title: isMyTurn ? 'Your Turn' : `${currentPlayer?.nickname}'s Turn`,
      message: phase === GamePhase.DRAW_PHASE 
        ? (isMyTurn ? 'Draw a card or call Cabo' : 'Drawing a card...')
        : (isMyTurn ? 'Play or replace the card' : 'Deciding what to play...'),
      color: isMyTurn ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-400',
      titleColor: isMyTurn ? 'text-green-800' : 'text-gray-800',
      messageColor: isMyTurn ? 'text-green-700' : 'text-gray-700'
    })
  }
  
  if (statuses.length === 0) return null
  
  return (
    <div className="fixed top-4 left-4 z-50 space-y-3">
      <AnimatePresence>
        {statuses.map((status, index) => (
          <motion.div
            key={status.key}
            initial={{ y: -50, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.9 }}
            transition={{ 
              type: 'spring', 
              stiffness: 400, 
              damping: 30,
              delay: index * 0.05
            }}
            className={`${status.color} border-2 rounded-lg p-4 shadow-xl`}
          >
            <h3 className={`font-semibold ${status.titleColor} mb-2`}>
              {status.title}
            </h3>
            <p className={status.messageColor}>
              {status.message}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default GameStatus