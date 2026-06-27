export type ChatbotRole = 'Guest' | 'Instructor' | 'Student'

// Pages where STUDENTS should not see the chatbot (during quizzes / live games).
// Instructors keep the chatbot everywhere — including game test-play — so it is
// available while they build, test, and answer their own content.
const STUDENT_CHATBOT_HIDDEN_PATH_PREFIXES = [
  '/student/quiz',
  '/student/games',
]

export function shouldShowChatbot(
  pathname: string,
  loggedInUser: { role: string } | null,
  features?: { chatbot_enabled?: boolean; openai_enabled?: boolean }
): boolean {
  if (features?.chatbot_enabled === false || features?.openai_enabled === false) return false
  if (loggedInUser?.role === 'Admin' || loggedInUser?.role === 'SuperAdmin') return false

  // Instructors always have the assistant available (test-play included).
  if (loggedInUser?.role === 'Instructor') return true

  if (loggedInUser?.role === 'Student') {
    if (STUDENT_CHATBOT_HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return false
    return true
  }

  return pathname === '/' || pathname === ''
}
