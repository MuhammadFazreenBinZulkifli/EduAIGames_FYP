import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import {
  loadChatSession,
  saveChatSession,
  type StoredChatMessage,
} from '../utils/chatSessionStorage'
import { getChatSuggestions, getChatWelcome } from '../utils/chatbotPrompts'
import ChatMessageBody from './ChatMessageBody'
import './App_CSS/AIChatbot_CSS.css'

export type ChatbotRole = 'Guest' | 'Instructor' | 'Student'

export interface AIChatbotProps {
  role?: ChatbotRole
  username?: string
  userId?: number
  hidden?: boolean
}

type ChatMessage = StoredChatMessage
type DragKind = 'panel' | 'launcher' | null

const LAUNCHER_SIZE = 52
const PANEL_W = 360
const PANEL_H = 480
const DRAG_THRESHOLD = 8
const LAUNCHER_POS_KEY = 'edubot-launcher-pos'

function MessageIcon() {
  return (
    <svg className="aichat-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14h-4.83l-.17.17-.17.17L12 19.17l-2.83-2.83-.17-.17L8.83 16H4V4h16v12z"
      />
      <path fill="currentColor" d="M7 9h10v2H7zm0-3h10v2H7z" />
    </svg>
  )
}

// Keeps the launcher/panel inside the viewport with a small margin.
function clampPosition(x: number, y: number, w: number, h: number) {
  const margin = 12
  const maxX = window.innerWidth - w - margin
  const maxY = window.innerHeight - h - margin
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, maxX)),
    y: Math.min(Math.max(margin, y), Math.max(margin, maxY)),
  }
}

function defaultLauncherPos() {
  // On mobile, place launcher at bottom-right above safe-area so it doesn't
  // overlap the top bar (mobile header is ~60px) or bottom safe-area.
  const bottomOffset = window.innerWidth < 980 ? 80 : 20
  return clampPosition(
    window.innerWidth - LAUNCHER_SIZE - 20,
    window.innerHeight - LAUNCHER_SIZE - bottomOffset,
    LAUNCHER_SIZE,
    LAUNCHER_SIZE
  )
}

// Opens the chat panel beside the launcher, flipping above if there is no room below.
function panelPosNearLauncher(lx: number, ly: number) {
  let x = lx + LAUNCHER_SIZE - PANEL_W
  let y = ly + LAUNCHER_SIZE + 10
  if (y + PANEL_H > window.innerHeight - 12) {
    y = ly - PANEL_H - 10
  }
  return clampPosition(x, y, PANEL_W, PANEL_H)
}

/** Bottom-sheet style panel position for phones. */
function mobilePanelPos() {
  const w = Math.min(PANEL_W, window.innerWidth - 16)
  const h = Math.min(PANEL_H, Math.floor(window.innerHeight * 0.72))
  return clampPosition(
    (window.innerWidth - w) / 2,
    Math.max(64, window.innerHeight - h - 20),
    w,
    h
  )
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 980
}

// Restores the last dragged launcher position from localStorage.
function loadLauncherPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(LAUNCHER_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { x?: number; y?: number }
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      return clampPosition(p.x, p.y, LAUNCHER_SIZE, LAUNCHER_SIZE)
    }
  } catch {
    /* ignore */
  }
  return null
}

// Rehydrates open state and message history for a signed-in user.
function initialChatState(userId?: number) {
  if (userId == null) return { messages: [] as ChatMessage[], open: false }
  const session = loadChatSession(userId)
  return {
    messages: session?.messages ?? [],
    open: session?.open ?? false,
  }
}

// Maps server/config errors to user-friendly EduBot unavailable messages.
function formatChatError(message: string, chatAvailable: boolean): string {
  if (!chatAvailable) {
    return 'EduBot is unavailable on this site right now. Ask your administrator to enable the chatbot and OpenAI integration.'
  }
  if (/OPENAI_API_KEY|not configured/i.test(message)) {
    return 'EduBot is not configured yet. The server needs an OpenAI API key.'
  }
  if (/403|Feature.*disabled/i.test(message)) {
    return 'EduBot has been turned off for this platform.'
  }
  return message
}

// Builds the contextual greeting shown when the chat opens or is cleared.
function makeWelcomeMessage(role: ChatbotRole, pathname: string, username?: string): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: getChatWelcome(role, pathname, username),
  }
}

// Floating EduBot chat widget with draggable launcher and session persistence.
export default function AIChatbot({
  role = 'Guest',
  username,
  userId,
  hidden = false,
}: AIChatbotProps) {
  const { pathname } = useLocation()
  const { features, loading: featuresLoading } = usePlatformFeatures()
  const chatAvailable = features.chatbot_enabled && features.openai_enabled

  const initial = initialChatState(userId)
  const [open, setOpen] = useState(initial.open)
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [launcherPos, setLauncherPos] = useState(defaultLauncherPos)
  const [panelPos, setPanelPos] = useState(() => panelPosNearLauncher(defaultLauncherPos().x, defaultLauncherPos().y))
  const [posReady, setPosReady] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    active: false,
    kind: null as DragKind,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  })
  const welcomedRef = useRef(initial.messages.length > 0)
  const launcherPosRef = useRef(launcherPos)
  const panelPosRef = useRef(panelPos)
  launcherPosRef.current = launcherPos
  panelPosRef.current = panelPos

  const suggestions = useMemo(
    () => getChatSuggestions(role, pathname),
    [role, pathname]
  )

  const hasUserMessages = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages]
  )

  const showSuggestions = chatAvailable && !loading && !hasUserMessages

  useEffect(() => {
    const saved = loadLauncherPos()
    const pos = saved ?? defaultLauncherPos()
    setLauncherPos(pos)
    setPanelPos(panelPosNearLauncher(pos.x, pos.y))
    setPosReady(true)
  }, [])

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('edugames:open-chatbot', handler)
    return () => window.removeEventListener('edugames:open-chatbot', handler)
  }, [])

  const persistLauncherPos = useCallback((pos: { x: number; y: number }) => {
    try {
      localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify(pos))
    } catch {
      /* ignore */
    }
  }, [])

  const resetPositions = useCallback(() => {
    const pos = defaultLauncherPos()
    setLauncherPos(pos)
    setPanelPos(isMobileViewport() ? mobilePanelPos() : panelPosNearLauncher(pos.x, pos.y))
    persistLauncherPos(pos)
  }, [persistLauncherPos])

  const toggleOpen = useCallback(() => {
    setOpen((v) => {
      const next = !v
      if (next) {
        setPanelPos(
          isMobileViewport()
            ? mobilePanelPos()
            : panelPosNearLauncher(launcherPosRef.current.x, launcherPosRef.current.y)
        )
      }
      return next
    })
  }, [])

  // Wipes conversation history but keeps the widget open with a fresh welcome.
  const clearChat = useCallback(() => {
    setError('')
    welcomedRef.current = true
    setMessages([makeWelcomeMessage(role, pathname, username)])
  }, [role, pathname, username])

  useEffect(() => {
    const onResize = () => {
      setLauncherPos((p) => {
        const next = clampPosition(p.x, p.y, LAUNCHER_SIZE, LAUNCHER_SIZE)
        persistLauncherPos(next)
        return next
      })
      const el = panelRef.current
      if (el) {
        setPanelPos((p) => clampPosition(p.x, p.y, el.offsetWidth, el.offsetHeight))
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persistLauncherPos])

  useEffect(() => {
    if (userId != null) {
      saveChatSession(userId, messages, open)
    }
  }, [userId, messages, open])

  useEffect(() => {
    if (!open) return
    if (!welcomedRef.current && messages.length === 0) {
      welcomedRef.current = true
      setMessages([makeWelcomeMessage(role, pathname, username)])
      return
    }
    if (!hasUserMessages) {
      setMessages([makeWelcomeMessage(role, pathname, username)])
    }
  }, [open, role, pathname, username, messages.length, hasUserMessages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, showSuggestions])

  // Begins dragging either the floating launcher or the open chat panel.
  const startDrag = (kind: DragKind, clientX: number, clientY: number) => {
    const origin = kind === 'launcher' ? launcherPosRef.current : panelPosRef.current
    dragRef.current = {
      active: true,
      kind,
      startX: clientX,
      startY: clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    }
  }

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      const d = dragRef.current
      if (!d.active || !d.kind) return

      const dx = clientX - d.startX
      const dy = clientY - d.startY
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      d.moved = true

      if (d.kind === 'launcher') {
        const next = clampPosition(d.originX + dx, d.originY + dy, LAUNCHER_SIZE, LAUNCHER_SIZE)
        setLauncherPos(next)
      } else {
        const el = panelRef.current
        const w = el?.offsetWidth ?? PANEL_W
        const h = el?.offsetHeight ?? PANEL_H
        setPanelPos(clampPosition(d.originX + dx, d.originY + dy, w, h))
      }
    }

    const endDrag = () => {
      const d = dragRef.current
      if (!d.active) return

      if (d.kind === 'launcher' && d.moved) {
        persistLauncherPos(launcherPosRef.current)
      }
      if (d.kind === 'launcher' && !d.moved) {
        toggleOpen()
      }

      dragRef.current = {
        active: false,
        kind: null,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        moved: false,
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d.active) return
      onMove(e.clientX, e.clientY)
      if (d.moved) e.preventDefault()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [persistLauncherPos, toggleOpen])

  // Posts the conversation (plus current page path) to /api/chat and appends the reply.
  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    if (!chatAvailable) {
      setError(formatChatError('', false))
      return
    }

    setError('')
    if (!overrideText) setInput('')

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    const nextMessages = [...messages.filter((m) => m.id !== 'welcome'), userMsg]
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    try {
      const apiRole = role === 'Guest' ? undefined : role
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          role: apiRole,
          username,
          pathname,
          userId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
      }

      const reply = String((data as { reply?: string }).reply ?? '').trim()
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: reply || 'No response received.' },
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setError(formatChatError(msg, chatAvailable))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const onLauncherPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startDrag('launcher', e.clientX, e.clientY)
  }

  const onPanelHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    if (isMobileViewport()) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    startDrag('panel', e.clientX, e.clientY)
  }

  const mobileOpen = open && isMobileViewport()

  if (!posReady) return null

  return (
    <div
      className={`aichat-root${hidden ? ' aichat-root--hidden' : ''}`}
      aria-live="polite"
      aria-hidden={hidden}
    >
      {mobileOpen && (
        <button
          type="button"
          className="aichat-backdrop"
          aria-label="Close EduBot chat"
          onClick={() => setOpen(false)}
        />
      )}

      <button
        type="button"
        className={`aichat-launcher ${open ? 'aichat-launcher--open' : ''} ${dragRef.current.kind === 'launcher' && dragRef.current.moved ? 'aichat-launcher--dragging' : ''}`}
        style={{ left: launcherPos.x, top: launcherPos.y, width: LAUNCHER_SIZE, height: LAUNCHER_SIZE }}
        onPointerDown={onLauncherPointerDown}
        aria-expanded={open}
        aria-controls="aichat-panel"
        aria-label={open ? 'Close EduBot chat' : 'Open EduBot chat'}
        title="Drag to move · Tap to open chat"
      >
        <MessageIcon />
        {!open && <span className="aichat-launcher-pulse" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id="aichat-panel"
          ref={panelRef}
          className={`aichat-panel${isMobileViewport() ? ' aichat-panel--mobile' : ''}`}
          style={isMobileViewport() ? undefined : { left: panelPos.x, top: panelPos.y }}
          role="dialog"
          aria-labelledby="aichat-title"
          aria-modal="false"
        >
          <header
            className="aichat-header"
            onPointerDown={onPanelHeaderPointerDown}
          >
            {isMobileViewport() && <span className="aichat-mobile-handle" aria-hidden="true" />}
            <div className="aichat-header-info">
              <span className="aichat-avatar" aria-hidden="true">
                <MessageIcon />
              </span>
              <div className="aichat-header-text">
                <h2 id="aichat-title" className="aichat-title">
                  EduBot
                </h2>
                <p className="aichat-subtitle">Site help & study assistant</p>
              </div>
            </div>
            <div className="aichat-header-actions">
              <button
                type="button"
                className="aichat-icon-btn"
                onClick={clearChat}
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <span className="aichat-icon-btn-glyph" aria-hidden="true">⌫</span>
              </button>
              <button
                type="button"
                className="aichat-icon-btn"
                onClick={resetPositions}
                title="Reset icon position"
                aria-label="Reset icon position"
              >
                <span className="aichat-icon-btn-glyph" aria-hidden="true">↺</span>
              </button>
              <button
                type="button"
                className="aichat-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <span className="aichat-icon-btn-glyph" aria-hidden="true">×</span>
              </button>
            </div>
          </header>

          <div className="aichat-messages" ref={listRef}>
            {!chatAvailable && !featuresLoading && (
              <div className="aichat-unavailable">
                <p>EduBot is unavailable on this deployment.</p>
                <p className="aichat-unavailable-hint">
                  Enable the chatbot and OpenAI integration in platform settings to use AI help.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`aichat-bubble-wrap ${m.role === 'user' ? 'aichat-bubble-wrap--user' : ''}`}
              >
                <div className={`aichat-bubble aichat-bubble--${m.role}`}>
                  {m.role === 'assistant' ? (
                    <ChatMessageBody content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="aichat-bubble-wrap">
                <div className="aichat-bubble aichat-bubble--assistant aichat-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {showSuggestions && (
              <div className="aichat-suggestions" aria-label="Suggested questions">
                <p className="aichat-suggestions-label">Try asking</p>
                <div className="aichat-suggestions-list">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="aichat-suggestion-chip"
                      onClick={() => void sendMessage(s.prompt)}
                      disabled={loading}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="aichat-error" role="alert">
              {error}
            </p>
          )}

          <footer className="aichat-footer">
            <textarea
              className="aichat-input"
              rows={1}
              placeholder={
                chatAvailable
                  ? 'Ask about EduAIGames or any study topic…'
                  : 'EduBot is unavailable'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || !chatAvailable}
              aria-label="Message EduBot"
            />
            <button
              type="button"
              className="aichat-send"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim() || !chatAvailable}
              aria-label="Send message"
            >
              Send
            </button>
          </footer>
        </div>
      )}
    </div>
  )
}
