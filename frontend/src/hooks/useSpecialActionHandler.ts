import { useEffect } from 'react'
import { useGamePlayStore, GamePhase } from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'
import { useGameWebSocket } from '@/api/game_ws'

export function useSpecialActionHandler() {
  const {
    phase,
    specialAction,
    selectedCards,
    currentPlayerId,
    clearSelectedCards
  } = useGamePlayStore()
  
  const { sessionId } = useAuthStore()
  const { sendMessage } = useGameWebSocket()
  
  useEffect(() => {
    // Only proceed if we have a special action and it's our action
    if (!specialAction || specialAction.playerId !== sessionId) {
      return
    }
    
    // Check if we have enough selections to execute the action
    const canExecute = checkCanExecuteAction()
    
    if (canExecute) {
      executeSpecialAction()
    }
    
    function checkCanExecuteAction(): boolean {
      switch (specialAction.type) {
        case 'VIEW_OWN':
          // Need exactly 1 own card selected
          return selectedCards.length === 1 && 
                 selectedCards[0].playerId === sessionId
                 
        case 'VIEW_OPPONENT':
          // Need exactly 1 opponent card selected
          return selectedCards.length === 1 && 
                 selectedCards[0].playerId !== sessionId
                 
        case 'SWAP_CARDS':
          // Need exactly 2 cards: 1 own, 1 opponent
          if (selectedCards.length !== 2) return false
          const ownCard = selectedCards.find(s => s.playerId === sessionId)
          const oppCard = selectedCards.find(s => s.playerId !== sessionId)
          return !!ownCard && !!oppCard
          
        case 'KING_VIEW':
          // Need exactly 1 card selected (any player)
          return selectedCards.length === 1
          
        case 'KING_SWAP':
          // Need exactly 2 cards selected (can be from any players)
          return selectedCards.length === 2
          
        default:
          return false
      }
    }
    
    function executeSpecialAction() {
      switch (specialAction.type) {
        case 'VIEW_OWN':
          sendMessage({
            type: 'view_own_card',
            card_index: selectedCards[0].cardIndex
          })
          break
          
        case 'VIEW_OPPONENT':
          sendMessage({
            type: 'view_opponent_card',
            target_player_id: selectedCards[0].playerId,
            card_index: selectedCards[0].cardIndex
          })
          break
          
        case 'SWAP_CARDS': {
          const ownCard = selectedCards.find(s => s.playerId === sessionId)!
          const oppCard = selectedCards.find(s => s.playerId !== sessionId)!
          sendMessage({
            type: 'swap_cards',
            own_index: ownCard.cardIndex,
            target_player_id: oppCard.playerId,
            target_index: oppCard.cardIndex
          })
          break
        }
          
        case 'KING_VIEW':
          sendMessage({
            type: 'king_view_card',
            target_player_id: selectedCards[0].playerId,
            card_index: selectedCards[0].cardIndex
          })
          break
          
        case 'KING_SWAP': {
          // For king swap, first card should be own, second should be target
          // But if both are from same player, treat first as own
          let ownSelection = selectedCards[0]
          let targetSelection = selectedCards[1]
          
          // If first selection is not ours, swap them
          if (ownSelection.playerId !== sessionId && targetSelection.playerId === sessionId) {
            [ownSelection, targetSelection] = [targetSelection, ownSelection]
          }
          
          sendMessage({
            type: 'king_swap_cards',
            own_index: ownSelection.cardIndex,
            target_player_id: targetSelection.playerId,
            target_index: targetSelection.cardIndex
          })
          break
        }
      }
      
      // Clear selections after executing
      clearSelectedCards()
    }
  }, [selectedCards, specialAction, sessionId, phase, sendMessage, clearSelectedCards])
}