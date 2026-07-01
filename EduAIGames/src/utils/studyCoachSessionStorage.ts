// Persists AI Study Coach state to localStorage, keyed by student ID.
// Content survives navigation and page refreshes for as long as the user stays
// signed in. It is cleared on explicit logout (AuthContext -> clearStudyCoachSession).

type QuestionFormat = 'multiple-choice' | 'true-false' | 'short-answer' | 'essay' | 'fill-blank'
type TabId = 'insights' | 'review' | 'practice' | 'create' | 'ask'

interface StoredStudyCoachSession {
  classId: number | ''
  tab: TabId
  insights: unknown | null
  insightsEmpty: string
  mistakes: unknown[]
  explanations: Record<string, unknown>
  practiceSet: unknown | null
  practiceAnswers: Record<number, string>
  practiceRevealed: number[]
  createTopic: string
  createFormat: QuestionFormat
  createCount: number
  createDifficulty: 'easy' | 'normal' | 'hard'
  createSet: unknown | null
  createRevealed: number[]
  chatMessages: unknown[]
}

function sessionKey(studentId: number) {
  return `study-coach-session-${studentId}`
}

export function loadStudyCoachSession(studentId: number): StoredStudyCoachSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(studentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredStudyCoachSession>
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as StoredStudyCoachSession
  } catch {
    return null
  }
}

export function saveStudyCoachSession(studentId: number, data: StoredStudyCoachSession) {
  try {
    localStorage.setItem(sessionKey(studentId), JSON.stringify(data))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStudyCoachSession(studentId: number) {
  try {
    localStorage.removeItem(sessionKey(studentId))
  } catch {
    /* ignore */
  }
}
