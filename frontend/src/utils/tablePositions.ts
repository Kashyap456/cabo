interface Position {
  x: number
  y: number
  rotation: number
  badgeX?: number
  badgeY?: number
  cardX?: number
  cardY?: number
}

/**
 * Calculate positions around an oval table
 * Current player is always at the bottom (index 0)
 * Other players are distributed evenly around the table
 * 
 * Returns positions for:
 * - badges: outside the wooden border
 * - cards: on an inner ellipse for consistent hand positioning
 */
export function calculatePlayerPositions(
  totalPlayers: number,
  currentPlayerIndex: number,
  tableWidth: number = 600,
  tableHeight: number = 400
): Position[] {
  const positions: Position[] = []
  const centerX = tableWidth / 2
  const centerY = tableHeight / 2
  
  // Three layers of positioning:
  // The GameTable component has a 12px (p-3) wooden border, so we need to account for that
  const woodenBorderWidth = 12 // matches the p-3 in GameTable
  
  // 1. Badge radius: outside the entire table component (including wooden border)
  // Badges should be about 60px outside the table edge to be clearly visible
  const badgeRadiusX = tableWidth / 2 + 60
  const badgeRadiusY = tableHeight / 2 + 60
  
  // 2. Table surface edge: inside the wooden border (the blue felt area)
  // This is the actual playable area
  const tableRadiusX = tableWidth / 2 - woodenBorderWidth
  const tableRadiusY = tableHeight / 2 - woodenBorderWidth
  
  // 3. Card radius: inner ellipse for hand positioning
  // Match the visual guide: 80% of table dimensions means 40% reduction in radius (since 80% width = 80% of diameter)
  const cardRadiusX = tableRadiusX * 0.75  // Slightly smaller to ensure cards are well inside
  const cardRadiusY = tableRadiusY * 0.75

  // Calculate angle step between players
  const angleStep = (2 * Math.PI) / totalPlayers
  
  // Start angle at bottom (90 degrees in standard positioning, but we use -90 for bottom)
  const startAngle = Math.PI / 2

  for (let i = 0; i < totalPlayers; i++) {
    // Calculate which player this is relative to current player
    // Current player should be at position 0 (bottom)
    const relativeIndex = (i - currentPlayerIndex + totalPlayers) % totalPlayers
    const angle = startAngle + relativeIndex * angleStep

    // Calculate badge position (outside table)
    const badgeX = centerX + badgeRadiusX * Math.cos(angle)
    const badgeY = centerY + badgeRadiusY * Math.sin(angle)
    
    // Calculate card position (inner ellipse)
    const cardX = centerX + cardRadiusX * Math.cos(angle)
    const cardY = centerY + cardRadiusY * Math.sin(angle)
    
    // For backward compatibility, x and y are the card positions
    const x = cardX
    const y = cardY
    
    // Calculate rotation so players face the center
    const rotation = (angle * 180 / Math.PI) - 90

    positions.push({ 
      x, 
      y, 
      rotation,
      badgeX,
      badgeY,
      cardX,
      cardY
    })
  }

  return positions
}

/**
 * Get optimal table dimensions based on viewport
 */
export function getTableDimensions(viewportWidth: number, viewportHeight: number) {
  const maxWidth = Math.min(viewportWidth * 0.8, 900)
  const maxHeight = Math.min(viewportHeight * 0.7, 600)
  
  // Maintain aspect ratio
  const aspectRatio = 3 / 2
  let width = maxWidth
  let height = width / aspectRatio
  
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }
  
  return { width, height }
}