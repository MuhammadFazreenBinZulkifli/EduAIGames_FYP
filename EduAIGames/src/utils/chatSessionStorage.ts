export type StoredChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type ChatSession = {
  messages: StoredChatMessage[]
  open?: boolean
}

function sessionKey(userId: number) {
  return `edubot-chat-session-${userId}`
}

function isValidMessage(m: unknown): m is StoredChatMessage {
  if (!m || typeof m !== 'object') return false
  const msg = m as StoredChatMessage
  return (
    typeof msg.id === 'string' &&
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  )
}

// Chat history is stored in localStorage (not sessionStorage) so it survives
// page reloads, tab closes, and sidebar expand/collapse. It is kept per-user and
// is cleared on logout (see AuthContext.logout -> clearChatSession), so a chat
// lasts for as long as the user stays signed in.
export function loadChatSession(userId: number): ChatSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChatSession
    if (!parsed || !Array.isArray(parsed.messages)) return null
    return {
      messages: parsed.messages.filter(isValidMessage),
      open: Boolean(parsed.open),
    }
  } catch {
    return null
  }
}

export function saveChatSession(userId: number, messages: StoredChatMessage[], open: boolean) {
  try {
    const payload: ChatSession = { messages, open }
    localStorage.setItem(sessionKey(userId), JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearChatSession(userId: number) {
  try {
    localStorage.removeItem(sessionKey(userId))
  } catch {
    /* ignore */
  }
}
