export type ChatbotRole = 'Guest' | 'Instructor' | 'Student'

const CHATBOT_HIDDEN_PATH_PREFIXES = [
  '/student/quiz',
  '/student/games',
  '/instructor/studio/maze',
  '/instructor/studio/snake',
]

export function shouldShowChatbot(
  pathname: string,
  loggedInUser: { role: string } | null,
  features?: { chatbot_enabled?: boolean; openai_enabled?: boolean }
): boolean {
  if (features?.chatbot_enabled === false || features?.openai_enabled === false) return false
  if (loggedInUser?.role === 'Admin' || loggedInUser?.role === 'SuperAdmin') return false
  if (CHATBOT_HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return false

  if (loggedInUser?.role === 'Instructor' || loggedInUser?.role === 'Student') {
    return true
  }

  return pathname === '/' || pathname === ''
}
