import { useEffect, useState, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useRoomStore } from '../../stores/game_state'
import { useGamePlayStore } from '../../stores/game_play_state'
import Card from '../game/Card'

interface PlayerScore {
  player_id: string
  name: string
  score: number
}

interface PlayerHand {
  rank: string
  suit: string | null
  value: number
}

export default function EndGameView() {
  const navigate = useNavigate()
  const { players, currentUserId } = useRoomStore()
  const { endGameData } = useGamePlayStore()
  const [countdown, setCountdown] = useState(30)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastServerUpdate = useRef<number>(30)

  useEffect(() => {
    // Set initial countdown and start client-side timer
    if (endGameData?.countdownSeconds) {
      setCountdown(endGameData.countdownSeconds)
      lastServerUpdate.current = endGameData.countdownSeconds
    }

    // Start client-side countdown timer
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        const newValue = Math.max(0, prev - 1)
        // Navigate to home when countdown reaches 0
        if (newValue === 0) {
          navigate({ to: '/' })
        }
        return newValue
      })
    }, 1000)

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [navigate, endGameData])

  useEffect(() => {
    // Subscribe to server updates for reconciliation
    const unsubscribe = useGamePlayStore.subscribe((state) => {
      if (state.endGameData?.countdownSeconds !== undefined) {
        const serverTime = state.endGameData.countdownSeconds
        // Only update if server time is significantly different (reconciliation)
        if (Math.abs(serverTime - countdown) > 1) {
          setCountdown(serverTime)
          lastServerUpdate.current = serverTime
        }
      }
    })
    
    return unsubscribe
  }, [countdown])

  if (!endGameData) {
    return <div>Loading game results...</div>
  }

  const { winnerId, winnerName, finalScores, playerHands, caboCaller } = endGameData

  // Sort players by score for display
  const sortedScores = [...finalScores].sort((a, b) => a.score - b.score)

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Winner Announcement */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-4">Game Over!</h1>
          <div className="bg-yellow-400 rounded-lg p-6 inline-block shadow-2xl">
            <div className="text-6xl mb-2">🏆</div>
            <h2 className="text-3xl font-bold text-gray-900">
              {winnerName} Wins!
            </h2>
            <p className="text-xl text-gray-700 mt-2">
              Score: {sortedScores[0]?.score} points
            </p>
          </div>
        </div>

        {/* Player Results */}
        <div className="space-y-6">
          {sortedScores.map((playerScore, index) => {
            const isWinner = playerScore.player_id === winnerId
            const isCaboCaller = playerScore.player_id === caboCaller
            const playerData = players.find(p => p.playerId === playerScore.player_id)
            const hand = playerHands[playerScore.player_id] || []
            
            return (
              <div
                key={playerScore.player_id}
                className={`
                  bg-white rounded-lg p-6 shadow-lg
                  ${isWinner ? 'ring-4 ring-yellow-400 bg-gradient-to-r from-yellow-50 to-yellow-100' : ''}
                  ${index === 0 ? 'transform scale-105' : ''}
                  transition-all duration-500
                `}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {/* Place indicator */}
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl
                      ${index === 0 ? 'bg-yellow-400 text-gray-900' : 
                        index === 1 ? 'bg-gray-300 text-gray-700' :
                        index === 2 ? 'bg-orange-400 text-white' :
                        'bg-gray-200 text-gray-600'}
                    `}>
                      {index + 1}
                    </div>
                    
                    {/* Player info */}
                    <div>
                      <h3 className="text-2xl font-bold flex items-center gap-2">
                        {playerScore.name}
                        {isWinner && <span className="text-yellow-500">👑</span>}
                        {isCaboCaller && <span className="text-sm text-blue-600 font-normal">(Called Cabo)</span>}
                      </h3>
                      <p className="text-gray-600">
                        Score: <span className="font-bold text-xl">{playerScore.score}</span> points
                      </p>
                    </div>
                  </div>

                  {/* Current player indicator */}
                  {playerScore.player_id === currentUserId && (
                    <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                      You
                    </div>
                  )}
                </div>

                {/* Player's hand */}
                <div className="flex gap-3 flex-wrap">
                  {hand.map((card, cardIndex) => (
                    <Card
                      key={cardIndex}
                      card={{
                        rank: card.rank,
                        suit: card.suit,
                        isFaceUp: true,
                        value: card.value
                      }}
                      size="medium"
                      showValue={true}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Countdown Timer */}
        <div className="mt-8 text-center">
          <div className="bg-gray-800 text-white rounded-lg p-4 inline-block">
            <p className="text-lg">
              Returning to lobby in <span className="font-bold text-2xl text-yellow-400">{countdown}</span> seconds...
            </p>
            <div className="w-64 h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 transition-all duration-1000"
                style={{ width: `${(countdown / 30) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}