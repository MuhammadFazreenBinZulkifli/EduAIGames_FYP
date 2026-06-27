import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPut } from '../api/client'
import { useAuth } from '../context/AuthContext'

export interface UserPreferences {
  /** Per-game "How to Play" disable flags, keyed by game id (e.g. "snake"). */
  gameHowToDisabled?: Record<string, boolean>
  /** Whether the user has already seen the website "How it works" guide. */
  guideSeen?: boolean
  [key: string]: unknown
}

function cacheKey(userId: number): string {
  return `eduai:prefs:${userId}`
}

function readCache(userId: number): UserPreferences {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as UserPreferences) : {}
  } catch {
    return {}
  }
}

function writeCache(userId: number, prefs: UserPreferences): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(prefs))
  } catch {
    /* ignore quota / serialization issues */
  }
}

export async function fetchPreferences(userId: number): Promise<UserPreferences> {
  const data = await apiGet<{ preferences: UserPreferences }>(`/api/profile/${userId}/preferences`)
  const prefs = data.preferences || {}
  writeCache(userId, prefs)
  return prefs
}

export async function updatePreferences(
  userId: number,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const data = await apiPut<{ preferences: UserPreferences }>(
    `/api/profile/${userId}/preferences`,
    patch,
  )
  const prefs = data.preferences || {}
  writeCache(userId, prefs)
  return prefs
}

/**
 * Account-synced per-game "How to Play" preference. Seeds instantly from a
 * local cache (so the modal never flashes the wrong state), then refreshes from
 * the server. Toggling persists to the user's account and updates every device.
 */
export function useGameHowTo(gameKey: string) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [disabled, setDisabledState] = useState<boolean>(() => {
    if (userId == null) return false
    return !!readCache(userId).gameHowToDisabled?.[gameKey]
  })
  const [loaded, setLoaded] = useState<boolean>(userId == null)

  useEffect(() => {
    let active = true
    if (userId == null) {
      setLoaded(true)
      return
    }
    setDisabledState(!!readCache(userId).gameHowToDisabled?.[gameKey])
    fetchPreferences(userId)
      .then((prefs) => {
        if (!active) return
        setDisabledState(!!prefs.gameHowToDisabled?.[gameKey])
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [userId, gameKey])

  const setDisabled = useCallback(
    (val: boolean) => {
      setDisabledState(val)
      if (userId == null) return
      const cur = readCache(userId)
      writeCache(userId, {
        ...cur,
        gameHowToDisabled: { ...(cur.gameHowToDisabled || {}), [gameKey]: val },
      })
      void updatePreferences(userId, { gameHowToDisabled: { [gameKey]: val } }).catch(() => {})
    },
    [userId, gameKey],
  )

  return { disabled, loaded, setDisabled }
}
