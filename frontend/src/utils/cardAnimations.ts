import { Variants } from 'framer-motion'

export const dealingAnimation: Variants = {
  initial: {
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
  },
  dealing: (custom: { targetX: number; targetY: number; delay: number }) => ({
    x: custom.targetX,
    y: custom.targetY,
    rotate: 360,
    transition: {
      duration: 0.8,
      delay: custom.delay,
      ease: "easeOut",
    },
  }),
  dealt: {
    scale: 1,
    transition: {
      duration: 0.2,
    },
  },
}

export const flipAnimation: Variants = {
  faceDown: {
    rotateY: 0,
  },
  faceUp: {
    rotateY: 180,
    transition: {
      duration: 0.6,
      ease: "easeInOut",
    },
  },
}

export const drawAnimation: Variants = {
  initial: {
    scale: 1,
  },
  drawing: {
    scale: 1.2,
    y: -20,
    transition: {
      duration: 0.2,
    },
  },
  drawn: (custom: { targetX: number; targetY: number }) => ({
    x: custom.targetX,
    y: custom.targetY,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  }),
}

export const playAnimation: Variants = {
  inHand: {
    scale: 1,
  },
  playing: {
    scale: 1.3,
    y: -30,
    transition: {
      duration: 0.2,
    },
  },
  played: (custom: { targetX: number; targetY: number }) => ({
    x: custom.targetX,
    y: custom.targetY,
    scale: 1,
    rotate: Math.random() * 20 - 10,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  }),
}

/**
 * Calculate the delay for dealing cards in sequence
 */
export function getDealingDelay(
  playerIndex: number,
  cardIndex: number,
  totalPlayers: number,
  cardsPerPlayer: number
): number {
  // Deal one card to each player before dealing the next card
  const round = cardIndex
  const orderInRound = playerIndex
  return (round * totalPlayers + orderInRound) * 0.15
}

/**
 * Get a spring animation config
 */
export function getSpringConfig(type: 'gentle' | 'bouncy' | 'stiff' = 'gentle') {
  const configs = {
    gentle: { stiffness: 300, damping: 30 },
    bouncy: { stiffness: 400, damping: 15 },
    stiff: { stiffness: 500, damping: 40 },
  }
  return configs[type]
}