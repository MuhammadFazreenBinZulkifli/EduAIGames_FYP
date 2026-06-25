const PREFIX = 'eduai-quiz-progress'
const SUBMITTED_PREFIX = 'eduai-quiz-submitted'

export interface SavedQuizProgress {
  quizId: number | string
  classId: number | null
  currentQuestionIndex: number
  answers: Record<string, string>
  confirmedIndices: number[]
  updatedAt: string
  elapsedSeconds?: number
  sessionQuestions?: Array<{
    question_type: string
    question_text: string
    correct_answer: string
    explanation?: string
    options: string[]
  }>
}

export function progressStorageKey(studentId: number, quizId: number | string): string {
  return `${PREFIX}-${studentId}-${quizId}`
}

function submittedStorageKey(studentId: number, quizId: number | string): string {
  return `${SUBMITTED_PREFIX}-${studentId}-${quizId}`
}

export function saveQuizProgress(studentId: number, data: SavedQuizProgress): void {
  if (isQuizSubmitted(studentId, data.quizId)) return
  try {
    localStorage.setItem(progressStorageKey(studentId, data.quizId), JSON.stringify(data))
  } catch {
    /* storage full or unavailable */
  }
}

export function loadQuizProgress(studentId: number, quizId: number | string): SavedQuizProgress | null {
  if (isQuizSubmitted(studentId, quizId)) return null
  try {
    const raw = localStorage.getItem(progressStorageKey(studentId, quizId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedQuizProgress
    if (!parsed || String(parsed.quizId) !== String(quizId)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearQuizProgress(studentId: number, quizId: number | string): void {
  try {
    localStorage.removeItem(progressStorageKey(studentId, quizId))
  } catch {
    /* ignore */
  }
}

export function markQuizSubmitted(studentId: number, quizId: number | string): void {
  try {
    clearQuizProgress(studentId, quizId)
    localStorage.setItem(submittedStorageKey(studentId, quizId), new Date().toISOString())
  } catch {
    /* ignore */
  }
}

export function isQuizSubmitted(studentId: number, quizId: number | string): boolean {
  try {
    return localStorage.getItem(submittedStorageKey(studentId, quizId)) !== null
  } catch {
    return false
  }
}

export function clearQuizSubmitted(studentId: number, quizId: number | string): void {
  try {
    localStorage.removeItem(submittedStorageKey(studentId, quizId))
  } catch {
    /* ignore */
  }
}

export function hasQuizProgress(studentId: number, quizId: number | string): boolean {
  return loadQuizProgress(studentId, quizId) !== null
}

/** Remove saved in-progress data for quizzes the student has already submitted. */
export function clearProgressForQuizzes(
  studentId: number,
  quizIds: Array<number | string>
): void {
  for (const quizId of quizIds) {
    markQuizSubmitted(studentId, quizId)
  }
}

/** Quiz IDs (as strings) that have unsaved-in-progress attempts for this student. */
export function getInProgressQuizIds(studentId: number): Set<string> {
  const ids = new Set<string>()
  const prefix = `${PREFIX}-${studentId}-`
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const quizId = key.slice(prefix.length)
        if (!isQuizSubmitted(studentId, quizId)) ids.add(quizId)
      }
    }
  } catch {
    /* ignore */
  }
  return ids
}
