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
    const isMe = stackCaller.playerId === currentUserId
    statuses.push({
      key: 'stack',
      type: 'stack',
      title: isMe ? '🔥 Your Stack Call!' : `🔥 ${stackCaller.nickname} Called Stack!`,
      message: isMe 
        ? 'Quick! Select a card that matches the rank of the played card to discard it, or select an opponent\'s matching card to give them one of yours!'
        : `${stackCaller.nickname} is trying to match the played card. Watch and see if they succeed!`,
      color: 'bg-red-50 border-red-400',
      titleColor: 'text-red-800',
      messageColor: 'text-red-700'
    })
  }
  
  // Special action
  if (specialAction && !specialAction.isComplete) {
    const actionPlayer = getPlayerById(specialAction.playerId)
    const isMe = specialAction.playerId === currentUserId
    
    let title = ''
    let message = ''
    let color = 'bg-yellow-50 border-yellow-400'
    
    switch (specialAction.type) {
      case 'VIEW_OWN':
        title = isMe ? '👁️ View Your Card' : `👁️ ${actionPlayer?.nickname} is Peeking`
        message = isMe 
          ? 'Click on one of your face-down cards to secretly view it. Remember what you see!'
          : `${actionPlayer?.nickname} is looking at one of their own cards.`
        color = 'bg-blue-50 border-blue-400'
        break
      
      case 'VIEW_OPPONENT':
        title = isMe ? '👁️ Spy on Opponent' : `👁️ ${actionPlayer?.nickname} is Spying`
        message = isMe 
          ? 'Click on any opponent\'s card to secretly view it. Use this knowledge wisely!'
          : `${actionPlayer?.nickname} is peeking at someone else\'s card. Hope it\'s not yours!`
        color = 'bg-blue-50 border-blue-400'
        break
      
      case 'SWAP_CARDS':
        title = isMe ? '🔄 Swap Time!' : `🔄 ${actionPlayer?.nickname} is Swapping`
        message = isMe 
          ? 'Select any two cards to swap them - yours, opponents\', or one of each. Click two cards to make the swap!'
          : `${actionPlayer?.nickname} is swapping cards around. Your cards might move!`
        color = 'bg-purple-50 border-purple-400'
        break
      
      case 'KING_VIEW':
        title = isMe ? '👑 King\'s Vision' : `👑 ${actionPlayer?.nickname}'s Royal Decree`
        message = isMe 
          ? 'The King lets you see ANY card! Click on any card on the table to reveal it to yourself.'
          : `${actionPlayer?.nickname} played a King and is using its power to view any card.`
        color = 'bg-red-50 border-red-400'
        break
      
      case 'KING_SWAP':
        title = isMe ? '👑 King\'s Exchange' : `👑 ${actionPlayer?.nickname}'s Royal Swap`
        message = isMe 
          ? 'Now swap any two cards! You can swap with the card you just viewed or choose different ones. Click two cards!'
          : `${actionPlayer?.nickname} is using the King to rearrange the table. Hold tight!`
        color = 'bg-red-50 border-red-400'
        break
    }
    
    statuses.push({
      key: 'special',
      type: 'special',
      title,
      message,
      color,
      titleColor: color.includes('blue') ? 'text-blue-800' : 
                  color.includes('purple') ? 'text-purple-800' : 
                  color.includes('red') ? 'text-red-800' : 'text-yellow-800',
      messageColor: color.includes('blue') ? 'text-blue-700' : 
                    color.includes('purple') ? 'text-purple-700' : 
                    color.includes('red') ? 'text-red-700' : 'text-yellow-700'
    })
  }
  
  // Cabo called
  if (caboPlayer) {
    const isMe = caboPlayer.id === currentUserId
    statuses.push({
      key: 'cabo',
      type: 'cabo',
      title: isMe ? '🏁 You Called CABO!' : `🏁 ${caboPlayer.nickname} Called CABO!`,
      message: isMe 
        ? 'You\'re locked in! Your cards are safe from effects. One more round for everyone else!'
        : `This is the final round! ${caboPlayer.nickname} thinks they have the lowest score. Make your last moves count!`,
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