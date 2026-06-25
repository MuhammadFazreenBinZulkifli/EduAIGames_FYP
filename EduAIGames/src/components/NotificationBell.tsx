import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { useAuth } from '../context/AuthContext'
import { usePanelUI } from '../context/PanelUIContext'
import { formatTimeAgo, isToday } from '../utils/formatTimeAgo'
import { notificationTargetPath } from '../utils/notificationNavigation'
import './App_CSS/NotificationBell_CSS.css'

export type NotificationType =
  | 'student_joined'
  | 'quiz_completed'
  | 'quiz_failed'
  | 'quiz_published'
  | 'quiz_reminder'
  | 'game_published'
  | 'content_published'
  | 'announcement_published'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  body: string
  metadata?: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

// Maps server notification types to the emoji shown in the dropdown list.
function iconForType(type: NotificationType): string {
  switch (type) {
    case 'student_joined':
      return '👤'
    case 'quiz_completed':
      return '✅'
    case 'quiz_failed':
      return '⚠️'
    case 'quiz_published':
      return '📝'
    case 'quiz_reminder':
      return '⏰'
    case 'game_published':
      return '🎮'
    case 'content_published':
      return '📄'
    case 'announcement_published':
      return '📢'
    default:
      return '🔔'
  }
}

interface NotificationBellProps {
  userId: number
}

// Dropdown bell that polls notifications and navigates on click.
export default function NotificationBell({ userId }: NotificationBellProps) {
  const { user } = useAuth()
  const { confirm } = usePanelUI()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Polls the user's notification feed and unread badge count.
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/user/${userId}`)
      if (!res.ok) return
      const data = (await res.json()) as {
        notifications: AppNotification[]
        unreadCount: number
      }
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      /* ignore network errors */
    }
  }, [userId])

  useEffect(() => {
    void fetchNotifications()
    const interval = window.setInterval(() => {
      void fetchNotifications()
    }, 45000)
    return () => window.clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void fetchNotifications().finally(() => setLoading(false))
  }, [open, fetchNotifications])

  useEffect(() => {
    if (!open || !btnRef.current) return
    const place = () => {
      const rect = btnRef.current!.getBoundingClientRect()
      const width = Math.min(340, window.innerWidth - 16)
      let left = rect.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width,
        right: 'auto',
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Marks every notification as read without deleting history.
  const markAllRead = async () => {
    if (unreadCount === 0) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/notifications/user/${userId}/mark-read`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      )
      if (!res.ok) return
      const data = (await res.json()) as { unreadCount: number }
      setUnreadCount(data.unreadCount ?? 0)
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
      )
    } catch {
      /* ignore */
    }
  }

  // Marks a single item read when the user opens its deep link.
  const markOneRead = async (notificationId: number) => {
    try {
      await fetch(
        `${API_BASE_URL}/api/notifications/user/${userId}/mark-read`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notification_ids: [notificationId] }),
        }
      )
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n
        )
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      /* ignore */
    }
  }

  // Permanently removes all notifications after user confirmation.
  const clearHistory = async () => {
    if (notifications.length === 0) return
    const ok = await confirm({
      message: 'Clear all notifications? This cannot be undone.',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/notifications/user/${userId}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) return
      setNotifications([])
      setUnreadCount(0)
    } catch {
      /* ignore */
    }
  }

  // Marks read, closes the panel, and routes to the relevant student/instructor page.
  const handleNotificationClick = (n: AppNotification) => {
    const role = user?.role === 'Instructor' ? 'Instructor' : user?.role === 'Student' ? 'Student' : ''
    const path = role ? notificationTargetPath(n.type, n.metadata, role) : null
    void markOneRead(n.id)
    setOpen(false)
    if (path) navigate(path)
  }

  const todayItems = notifications.filter((n) => isToday(n.created_at))
  const earlierItems = notifications.filter((n) => !isToday(n.created_at))

  const renderList = (items: AppNotification[]) => (
    <ul className="notification-list">
      {items.map((n) => {
        const role = user?.role === 'Instructor' ? 'Instructor' : user?.role === 'Student' ? 'Student' : ''
        const clickable = role ? notificationTargetPath(n.type, n.metadata, role) != null : false
        return (
          <li key={n.id}>
            <button
              type="button"
              className={`notification-item${n.read_at ? '' : ' unread'}${clickable ? ' notification-item--clickable' : ''}`}
              onClick={() => handleNotificationClick(n)}
              disabled={!clickable}
            >
              <span className="notification-item-icon" aria-hidden>
                {iconForType(n.type)}
              </span>
              <div className="notification-item-content">
                <p className="notification-item-title">{n.title}</p>
                <p className="notification-item-body">{n.body}</p>
                <span className="notification-item-time">{formatTimeAgo(n.created_at)}</span>
                {clickable && <span className="notification-item-action">Open →</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="notification-bell-btn"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-live="polite">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="notification-panel"
          role="dialog"
          aria-label="Notifications"
          style={panelStyle}
        >
          <div className="notification-panel-header">
            <h3>Notifications</h3>
            <div className="notification-panel-actions">
              <button
                type="button"
                className="notification-mark-all"
                disabled={unreadCount === 0}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
              <button
                type="button"
                className="notification-clear-all"
                disabled={notifications.length === 0}
                onClick={() => void clearHistory()}
              >
                Clear history
              </button>
            </div>
          </div>
          <div className="notification-panel-body">
            {loading && notifications.length === 0 ? (
              <p className="notification-loading">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="notification-empty">No notifications yet.</p>
            ) : (
              <>
                {todayItems.length > 0 && (
                  <>
                    <div className="notification-section-label">Today</div>
                    {renderList(todayItems)}
                  </>
                )}
                {earlierItems.length > 0 && (
                  <>
                    <div className="notification-section-label">Earlier</div>
                    {renderList(earlierItems)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
