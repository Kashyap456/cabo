import { useNavigate } from '@tanstack/react-router'
import { useStartGame, useLeaveRoom } from '../api'
import { useUserStore, useGameStore } from '../stores'
import type { GameRoom, Player } from '../api/types'

interface WaitingViewProps {
  room: GameRoom
  players: Player[]
}

export function WaitingView({ room, players }: WaitingViewProps) {
  const navigate = useNavigate()
  const { nickname } = useUserStore()
  const {} = useGameStore()
  const startGameMutation = useStartGame()
  const leaveRoomMutation = useLeaveRoom()

  const isCurrentUserHost =
    room.host_session_id &&
    players.some(
      (player) =>
        player.nickname === nickname && player.user_id === room.host_session_id,
    )

  const canStartGame = players.length >= 2 && isCurrentUserHost

  const handleStartGame = async () => {
    try {
      await startGameMutation.mutateAsync(room.room_code)
    } catch (error) {
      console.error('Failed to start game:', error)
    }
  }

  const handleLeaveRoom = async () => {
    try {
      await leaveRoomMutation.mutateAsync(room.room_code)
      navigate({ to: '/' })
    } catch (error) {
      console.error('Failed to leave room:', error)
    }
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.room_code)
    // TODO: Add toast notification
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 text-black">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Game Lobby</h1>
          <div className="flex items-center justify-center space-x-4">
            <div className="bg-white bg-opacity-20 rounded-lg px-6 py-3">
              <span className="text-sm text-gray-800">Room Code:</span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-mono font-bold">
                  {room.room_code}
                </span>
                <button
                  onClick={copyRoomCode}
                  className="text-yellow-400 hover:text-yellow-300 text-sm"
                  title="Copy room code"
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Game Configuration */}
        {room.config && (
          <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-8 max-w-md mx-auto">
            <h3 className="text-lg font-semibold mb-4">Game Settings</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Max Players:</span>
                <span>{room.config.maxPlayers || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span>Game Mode:</span>
                <span className="capitalize">
                  {room.config.gameMode || 'Classic'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Players List */}
        <div className="max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl font-bold mb-4 text-center">
            Players ({players.length}/{room.config?.maxPlayers || 6})
          </h2>
          <div className="grid gap-3">
            {players.map((player) => (
              <div
                key={player.user_id}
                className="bg-white bg-opacity-20 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-3 h-3 rounded-full ${player.is_active ? 'bg-green-400' : 'bg-gray-400'}`}
                  />
                  <span className="font-medium">{player.nickname}</span>
                  {player.user_id === room.host_session_id && (
                    <span className="bg-yellow-500 text-yellow-900 px-2 py-1 rounded-full text-xs font-bold">
                      HOST
                    </span>
                  )}
                  {player.nickname === nickname && (
                    <span className="bg-blue-500 text-blue-900 px-2 py-1 rounded-full text-xs font-bold">
                      YOU
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Waiting Message */}
        <div className="text-center mb-8">
          {players.length < 2 ? (
            <div className="bg-yellow-500 bg-opacity-20 border border-yellow-500 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-yellow-200">
                Waiting for more players to join. At least 2 players are needed
                to start the game.
              </p>
            </div>
          ) : isCurrentUserHost ? (
            <div className="bg-green-500 bg-opacity-20 border border-green-500 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-green-200">
                Ready to start! Click the button below to begin the game.
              </p>
            </div>
          ) : (
            <div className="bg-blue-500 bg-opacity-20 border border-blue-500 rounded-lg p-4 max-w-md mx-auto">
              <p className="text-blue-200">
                Waiting for the host to start the game...
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4">
          {isCurrentUserHost && (
            <button
              onClick={handleStartGame}
              disabled={!canStartGame || startGameMutation.isPending}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-3 px-8 rounded-xl text-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              {startGameMutation.isPending ? 'Starting...' : 'Start Game'}
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            disabled={leaveRoomMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl text-lg transition-colors duration-200"
          >
            {leaveRoomMutation.isPending ? 'Leaving...' : 'Leave Room'}
          </button>
        </div>

        {/* Game Rules */}
        <div className="max-w-3xl mx-auto mt-12">
          <h3 className="text-xl font-bold mb-4 text-center">
            How to Play Cabo
          </h3>
          <div className="bg-white bg-opacity-10 rounded-lg p-6">
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-semibold mb-2">🎯 Objective</h4>
                <p className="text-gray-800">
                  Get the lowest total card value by the end of the game.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">🧠 Strategy</h4>
                <p className="text-gray-800">
                  Remember your cards and make smart swaps with the deck.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">📋 Setup</h4>
                <p className="text-gray-800">
                  Each player starts with 4 hidden cards. Look at your corner
                  cards only!
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">🏁 Ending</h4>
                <p className="text-gray-800">
                  Call "Cabo" when you think you have the lowest total.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
