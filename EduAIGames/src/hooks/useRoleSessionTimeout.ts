import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routes/paths'
import { useSessionTimeout } from './useSessionTimeout'

/** Applies 15-minute inactivity / hidden-tab timeout for instructors and students. */
export function useRoleSessionTimeout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const enabled = user?.role === 'Instructor' || user?.role === 'Student'

  const onTimeout = useCallback(() => {
    logout()
    navigate(ROUTES.home, { replace: true })
  }, [logout, navigate])

  useSessionTimeout(enabled, onTimeout)
}
