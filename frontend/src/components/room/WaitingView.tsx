import { useRoomStore, useIsHost } from '../../stores/game_state'
import { useAuthStore } from '../../stores/auth'
import { useStartGame } from '../../api/rooms'
import GameTable from '../game/GameTable'
import PlayerSpot from '../game/PlayerSpot'
import WoodButton from '../ui/WoodButton'
import { calculatePlayerPositions } from '@/utils/tablePositions'
import { useEffect, useState, useRef } from 'react'

export default function WaitingView() {
  const { players, roomCode } = useRoomStore()
  const isHost = useIsHost()
  const { sessionId } = useAuthStore()
  const startGameMutation = useStartGame()
  const tableRef = useRef<HTMLDivElement>(null)
  const [tableDimensions, setTableDimensions] = useState({ width: 1000, height: 600 })

  useEffect(() => {
    const updateDimensions = () => {
      // Calculate table dimensions based on viewport
      const vw = window.innerWidth
      const vh = window.innerHeight
      
      // Match the CSS: w-[85vw] h-[75vh] max-w-[1200px] max-h-[700px]
      const width = Math.min(vw * 0.85, 1200)
      const height = Math.min(vh * 0.75, 700)
      
      setTableDimensions({ width, height })
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Find current player index
  const currentPlayerIndex = players.findIndex(p => p.id === sessionId)
  
  // Use actual table dimensions for positioning
  const positions = calculatePlayerPositions(
    players.length || 1, 
    currentPlayerIndex >= 0 ? currentPlayerIndex : 0,
    tableDimensions.width,
    tableDimensions.height
  )

  return (
    <GameTable>
      {/* Room info display - top right corner, outside table area */}
      <div className="fixed top-4 right-4 z-20">
        <div 
          className="border-4 border-yellow-500/80 px-4 py-3 rounded-lg shadow-wood-deep"
          style={{
            background: 'linear-gradient(180deg, #D2B48C 0%, #C19A6B 50%, #D2B48C 100%)',
          }}
        >
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-wood-darker font-bold text-xs uppercase">Room Code</p>
              <p className="text-yellow-100 font-black text-xl tracking-wider text-shadow-painted">
                {roomCode}
              </p>
            </div>
            <div className="border-t-2 border-wood-medium pt-2">
              <p className="text-yellow-100 font-bold text-sm">
                {players.length} / 8 Players
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Players positioned around the table */}
      <div className="absolute inset-0">
        {players.map((player, index) => (
          <PlayerSpot
            key={player.id}
            nickname={player.nickname}
            isHost={player.isHost}
            isCurrentPlayer={player.id === sessionId}
            position={positions[index]}
            tableDimensions={tableDimensions}
            cards={[]} // No cards in waiting room
          />
        ))}
        
      </div>

      {/* Center content - waiting message or start button */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        {players.length < 2 ? (
          <div className="text-center">
            <p className="text-white/80 text-lg font-semibold mb-2">
              Waiting for players...
            </p>
            <p className="text-white/60 text-sm">
              Need at least {2 - players.length} more player{2 - players.length > 1 ? 's' : ''}
            </p>
          </div>
        ) : isHost ? (
          <WoodButton
            variant="large"
            onClick={() => startGameMutation.mutate(roomCode)}
            disabled={startGameMutation.isPending}
            className="min-w-[200px]"
          >
            {startGameMutation.isPending ? 'Starting...' : 'Start Game'}
          </WoodButton>
        ) : (
          <div className="text-center">
            <p className="text-white/80 text-lg font-semibold">
              Waiting for host to start
            </p>
          </div>
        )}
      </div>

    </GameTable>
  )
}