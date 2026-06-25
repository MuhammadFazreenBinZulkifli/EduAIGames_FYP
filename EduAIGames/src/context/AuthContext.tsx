import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  clearSessionActivityMarker,
  SESSION_ACTIVITY_STORAGE_KEY,
} from '../hooks/useSessionTimeout'
import { clearChatSession } from '../utils/chatSessionStorage'
import type { User, UserRole } from '../types/user'

const USER_STORAGE_KEY = 'user'

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    if (!parsed?.email || !parsed?.role) return null
    return parsed
  } catch {
    return null
  }
}

interface AuthContextValue {
  user: User | null
  login: (user: User) => void
  logout: () => void
  updateUser: (partial: Partial<User>) => void
  isRole: (role: UserRole) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadStoredUser())

  const login = useCallback((next: User) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
    clearSessionActivityMarker()
    if (next.role === 'Instructor' || next.role === 'Student') {
      try {
        localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, String(Date.now()))
      } catch {
        /* ignore */
      }
    }
    setUser(next)
  }, [])

  const logout = useCallback(() => {
    setUser((current) => {
      if (current?.id != null) {
        clearChatSession(current.id)
      }
      return null
    })
    localStorage.removeItem(USER_STORAGE_KEY)
    clearSessionActivityMarker()
  }, [])

  const isRole = useCallback((role: UserRole) => user?.role === role, [user])

  const updateUser = useCallback((partial: Partial<User>) => {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, ...partial }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ user, login, logout, updateUser, isRole }),
    [user, login, logout, updateUser, isRole]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
