/** Tracks recently visited pages in the sidebar for quick-jump sub-nav.
 *  All keys are scoped to the current user ID so switching accounts never
 *  leaks another user's recents. */

export type SidebarRecentKey =
  | 'instructor-classes'
  | 'student-content'

export interface SidebarRecentItem {
  id: string | number
  label: string
  path: string
  timestamp: number
}

const MAX_RECENTS = 4
const STORAGE_PREFIX = 'eduai-recents-'
const EVENT_NAME = 'eduai-recents-updated'

/** Build a user-scoped localStorage key so multiple accounts don't share recents. */
function storageKey(key: SidebarRecentKey, userId: number | string): string {
  return `${STORAGE_PREFIX}${key}-u${userId}`
}

export function getRecents(key: SidebarRecentKey, userId: number | string): SidebarRecentItem[] {
  try {
    const raw = localStorage.getItem(storageKey(key, userId))
    if (!raw) return []
    return (JSON.parse(raw) as SidebarRecentItem[]).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

export function pushRecent(
  key: SidebarRecentKey,
  userId: number | string,
  item: Omit<SidebarRecentItem, 'timestamp'>,
): void {
  try {
    const existing = getRecents(key, userId).filter((r) => String(r.id) !== String(item.id))
    const next: SidebarRecentItem[] = [{ ...item, timestamp: Date.now() }, ...existing].slice(0, MAX_RECENTS)
    localStorage.setItem(storageKey(key, userId), JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key } }))
  } catch {
    /* non-critical */
  }
}

/** Wipe all sidebar recents for a user (call on logout). */
export function clearAllRecents(userId: number | string): void {
  const keys: SidebarRecentKey[] = ['instructor-classes', 'student-content']
  keys.forEach((k) => {
    try { localStorage.removeItem(storageKey(k, userId)) } catch { /* ignore */ }
  })
}

export const RECENTS_EVENT = EVENT_NAME
