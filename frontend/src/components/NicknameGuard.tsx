import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useUserStore, useUiStore } from '../stores'
import { useValidateSession } from '../api'

interface NicknameGuardProps {
  children: ReactNode
}

export function NicknameGuard({ children }: NicknameGuardProps) {
  const { hasValidSession, setUserData, setSessionValid } = useUserStore()
  const { openModal } = useUiStore()
  const { data: sessionData, isLoading, error } = useValidateSession()

  useEffect(() => {
    if (sessionData) {
      // Valid session found
      setUserData(sessionData.nickname, sessionData.user_id)
    } else if (error && !isLoading) {
      // No valid session, prompt for nickname
      setSessionValid(false)
      if (!hasValidSession()) {
        openModal('nickname-prompt')
      }
    }
  }, [sessionData, error, isLoading, setUserData, setSessionValid, hasValidSession, openModal])

  return <>{children}</>
}