import { useGamePlayStore } from '@/stores/game_play_state'
import { useAuthStore } from '@/stores/auth'

/**
 * Hook to determine if a card should be shown face-up
 * Takes into account game rules about card visibility
 */
export function useCardVisibility() {
  const { cardVisibility } = useGamePlayStore()
  const { sessionId } = useAuthStore()

  /**
   * Check if a card should be visible to the current player
   * @param playerId - The player who owns the card
   * @param cardIndex - The index of the card in the player's hand
   * @param card - The card object
   * @returns true if the card should be shown face-up
   */
  const isCardVisible = (playerId: string, cardIndex: number, card: any) => {
    // Simply check the isTemporarilyViewed flag
    // This flag should be properly maintained based on visibility rules
    return card.isTemporarilyViewed === true
  }

  return { isCardVisible }
}