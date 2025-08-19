import { useRoomStore, useIsHost } from '../../stores/game_state'
import { useAuthStore } from '../../stores/auth'

export default function WaitingView() {
  const { players } = useRoomStore()
  const isHost = useIsHost()
  const { nickname: currentNickname } = useAuthStore()

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
        <div className="space-y-3">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-medium">
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{player.nickname}</span>
                <div className="flex gap-2">
                  {player.nickname === currentNickname && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      You
                    </span>
                  )}
                  {player.isHost && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                      Host
                    </span>
                  )}
                </div>
              </div>
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            </div>
          ))}
          {players.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>Waiting for players to join...</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-3">Game Settings</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>" Minimum players: 2</p>
          <p>" Maximum players: 8</p>
          <p>" Game type: Standard Cabo</p>
        </div>
      </div>

      {isHost && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-3">Host Controls</h3>
          <button
            disabled={players.length < 2}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {players.length < 2 ? 'Need at least 2 players' : 'Start Game'}
          </button>
        </div>
      )}

      {!isHost && (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-600">Waiting for host to start the game...</p>
        </div>
      )}
    </div>
  )
}