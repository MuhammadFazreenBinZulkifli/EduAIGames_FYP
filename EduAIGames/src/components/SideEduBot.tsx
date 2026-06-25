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
import type { ChatbotRole } from './AIChatbot'
import './App_CSS/SideEduBot_CSS.css'

type ChatMessage = StoredChatMessage

export interface SideEdubotProps {
  role?: ChatbotRole
  username?: string
  userId?: number
}

function MessageIcon() {
  return (
    <svg className="side-edubot__icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14h-4.83l-.17.17-.17.17L12 19.17l-2.83-2.83-.17-.17L8.83 16H4V4h16v12z"
      />
      <path fill="currentColor" d="M7 9h10v2H7zm0-3h10v2H7z" />
    </svg>
  )
}

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

function makeWelcomeMessage(
  role: ChatbotRole,
  pathname: string,
  username?: string
): ChatMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: getChatWelcome(role, pathname, username),
  }
}

// Static side-panel EduBot for the desktop collapsed-sidebar layout.
// Renders as the 3rd grid column; shares the same sessionStorage key as the
// floating AIChatbot so chat history survives sidebar expand/collapse and
// page navigation.
export default function SideEduBot({ role = 'Guest', username, userId }: SideEdubotProps) {
  const { pathname } = useLocation()
  const { features, loading: featuresLoading } = usePlatformFeatures()
  const chatAvailable = features.chatbot_enabled && features.openai_enabled

  // Load from the shared session key so history from the floating bot is preserved.
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (userId == null) return []
    return loadChatSession(userId)?.messages ?? []
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const listRef = useRef<HTMLDivElement>(null)
  // Track whether the initial welcome has already been shown.
  const welcomedRef = useRef(messages.length > 0)

  const suggestions = useMemo(
    () => getChatSuggestions(role, pathname),
    [role, pathname]
  )

  const hasUserMessages = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages]
  )

  const showSuggestions = chatAvailable && !loading && !hasUserMessages

  // Show a contextual welcome the first time the side panel opens.
  useEffect(() => {
    if (!welcomedRef.current) {
      welcomedRef.current = true
      setMessages([makeWelcomeMessage(role, pathname, username)])
    }
    // intentionally only runs on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update welcome text when the page changes (only when no user messages exist).
  useEffect(() => {
    if (!hasUserMessages) {
      setMessages([makeWelcomeMessage(role, pathname, username)])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Auto-scroll to the latest message.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, showSuggestions])

  // Persist messages to the shared sessionStorage key (same as floating AIChatbot).
  useEffect(() => {
    if (userId != null) {
      saveChatSession(userId, messages, true)
    }
  }, [userId, messages])

  const clearChat = useCallback(() => {
    setError('')
    welcomedRef.current = true
    setMessages([makeWelcomeMessage(role, pathname, username)])
  }, [role, pathname, username])

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
        throw new Error(
          (data as { error?: string }).error || `Request failed (${res.status})`
        )
      }
      const reply = String((data as { reply?: string }).reply ?? '').trim()
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: reply || 'No response received.',
        },
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

  return (
    <div className="side-edubot" role="complementary" aria-label="EduBot chat assistant">
      <header className="side-edubot__header">
        <div className="side-edubot__header-info">
          <span className="side-edubot__avatar" aria-hidden="true">
            <MessageIcon />
          </span>
          <div className="side-edubot__header-text">
            <h2 className="side-edubot__title">EduBot</h2>
            <p className="side-edubot__subtitle">Study assistant</p>
          </div>
        </div>
        <button
          type="button"
          className="side-edubot__clear-btn"
          onClick={clearChat}
          title="Clear conversation"
          aria-label="Clear conversation"
        >
          ⌫
        </button>
      </header>

      <div className="side-edubot__messages" ref={listRef}>
        {!chatAvailable && !featuresLoading && (
          <div className="side-edubot__unavailable">
            <p>EduBot is unavailable on this deployment.</p>
            <p className="side-edubot__unavailable-hint">
              Enable the chatbot and OpenAI integration in platform settings.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`aichat-bubble-wrap${m.role === 'user' ? ' aichat-bubble-wrap--user' : ''}`}
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
        <p className="aichat-error side-edubot__error" role="alert">
          {error}
        </p>
      )}

      <footer className="side-edubot__footer">
        <div className="side-edubot__compose">
          <textarea
            className="side-edubot__input"
            rows={1}
            placeholder={
              chatAvailable
                ? 'Ask about EduAIGames or study topics…'
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
            className="side-edubot__send"
            onClick={() => void sendMessage()}
            disabled={loading || !input.trim() || !chatAvailable}
            aria-label="Send message"
            title="Send message"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}
