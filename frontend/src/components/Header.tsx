import { Link } from '@tanstack/react-router'
import { useUserStore } from '../stores'

export default function Header() {
  const { nickname, clearUserData } = useUserStore()

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link to="/" className="text-2xl font-bold text-blue-600 hover:text-blue-700">
              CABO
            </Link>
          </div>
          
          {nickname && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Playing as: <span className="font-medium text-gray-900">{nickname}</span>
              </span>
              <button
                onClick={clearUserData}
                className="text-sm text-red-600 hover:text-red-700 underline"
              >
                Change Nickname
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
