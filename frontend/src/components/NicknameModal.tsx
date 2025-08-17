import { useState } from 'react'
import { useUserStore, useUiStore } from '../stores'
import { useCreateSession } from '../api'

export function NicknameModal() {
  const [nickname, setNickname] = useState('')
  const { setUserData } = useUserStore()
  const { closeModal, setError, error } = useUiStore()
  const createSessionMutation = useCreateSession()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    try {
      const sessionData = await createSessionMutation.mutateAsync({
        nickname: nickname.trim()
      })
      
      // Update user store with session data
      setUserData(sessionData.nickname, sessionData.user_id)
      closeModal()
      setError(null)
    } catch (error) {
      console.error('Failed to create session:', error)
      setError(error instanceof Error ? error.message : 'Failed to create session')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Choose Your Nickname</h2>
        <p className="text-gray-600 mb-4">
          Please enter a nickname to continue playing Cabo!
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your nickname"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            autoFocus
            maxLength={20}
            required
          />
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
            disabled={!nickname.trim() || createSessionMutation.isPending}
          >
            {createSessionMutation.isPending ? 'Creating...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}