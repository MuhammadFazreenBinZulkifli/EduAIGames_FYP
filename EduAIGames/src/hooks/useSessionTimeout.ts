import { useCallback, useEffect, useRef } from 'react'

/** 15 minutes — instructor & student session limit */
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000

/** Background check interval (not shown in UI) */
const TICK_MS = 30_000

export const SESSION_ACTIVITY_STORAGE_KEY = 'eduai-session-last-activity'

function readSharedActivity(): number {
  try {
    const raw = localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? n : Date.now()
  } catch {
    return Date.now()
  }
}

function writeSharedActivity(ts: number) {
  try {
    localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, String(ts))
  } catch {
    /* ignore */
  }
}

export function clearSessionActivityMarker() {
  try {
    localStorage.removeItem(SESSION_ACTIVITY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Ends the session after 15 minutes of either:
 * - no user activity while the tab is visible, or
 * - the tab/document staying hidden (switched away or minimized).
 */
export function useSessionTimeout(enabled: boolean, onTimeout: () => void) {
  const lastActivityRef = useRef(readSharedActivity())
  const hiddenSinceRef = useRef<number | null>(
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
      ? Date.now()
      : null
  )
  const firedRef = useRef(false)
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  const fireTimeout = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    clearSessionActivityMarker()
    onTimeoutRef.current()
  }, [])

  const bumpActivity = useCallback(() => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    lastActivityRef.current = now
    writeSharedActivity(now)
  }, [])

  useEffect(() => {
    if (!enabled) return

    firedRef.current = false
    lastActivityRef.current = readSharedActivity()
    hiddenSinceRef.current =
      document.visibilityState === 'hidden' ? Date.now() : null

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now()
      } else {
        hiddenSinceRef.current = null
        const shared = readSharedActivity()
        lastActivityRef.current = Math.max(lastActivityRef.current, shared)
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_ACTIVITY_STORAGE_KEY || !e.newValue) return
      const n = parseInt(e.newValue, 10)
      if (Number.isFinite(n)) {
        lastActivityRef.current = Math.max(lastActivityRef.current, n)
      }
    }

    const passiveEvents = ['mousedown', 'keydown', 'click', 'scroll', 'touchstart'] as const
    passiveEvents.forEach((ev) =>
      document.addEventListener(ev, bumpActivity, { passive: true })
    )

    let moveCooldown: ReturnType<typeof setTimeout> | null = null
    const onMouseMove = () => {
      if (moveCooldown) return
      moveCooldown = setTimeout(() => {
        moveCooldown = null
      }, 1000)
      bumpActivity()
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('storage', onStorage)

    const tick = () => {
      const now = Date.now()

      if (document.visibilityState === 'hidden') {
        const hiddenSince = hiddenSinceRef.current ?? now
        if (now - hiddenSince >= SESSION_TIMEOUT_MS) {
          fireTimeout()
        }
        return
      }

      const shared = readSharedActivity()
      const lastActive = Math.max(lastActivityRef.current, shared)
      lastActivityRef.current = lastActive

      if (now - lastActive >= SESSION_TIMEOUT_MS) {
        fireTimeout()
      }
    }

    const intervalId = window.setInterval(tick, TICK_MS)
    tick()

    return () => {
      window.clearInterval(intervalId)
      passiveEvents.forEach((ev) =>
        document.removeEventListener(ev, bumpActivity)
      )
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('storage', onStorage)
      if (moveCooldown) clearTimeout(moveCooldown)
    }
  }, [enabled, bumpActivity, fireTimeout])
}
