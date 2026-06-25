export type AttemptMode = 'latest' | 'best' | 'all'

export interface PerformanceGrade {
  attempt_id?: number
  student_id: number
  username: string
  quiz_id?: number
  quiz_title: string
  score: number
  correct_answers: number
  total_questions: number
  completed_at: string
  responses?: Record<string, string> | null
  due_date?: string | null
  allow_late_submit?: boolean | null
}

export interface PublishedQuizMeta {
  id: number
  title: string
  due_date: string | null
  allow_late_submit: boolean | null
  max_attempts: number | null
}

function gradeKey(grade: PerformanceGrade): string {
  return `${grade.student_id}-${grade.quiz_id ?? grade.quiz_title}`
}

export function aggregateGrades(
  grades: PerformanceGrade[],
  mode: AttemptMode
): PerformanceGrade[] {
  if (mode === 'all') return [...grades]

  const grouped = new Map<string, PerformanceGrade[]>()
  for (const grade of grades) {
    const key = gradeKey(grade)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(grade)
  }

  const result: PerformanceGrade[] = []
  for (const attempts of grouped.values()) {
    const sorted = [...attempts].sort(
      (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    )
    if (mode === 'latest') {
      result.push(sorted[0])
      continue
    }
    const best = [...attempts].sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    )
    result.push(best[0])
  }

  return result.sort(
    (a, b) =>
      a.username.localeCompare(b.username) ||
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  )
}

export function isSubmissionLate(grade: PerformanceGrade): boolean {
  if (!grade.due_date) return false
  return new Date(grade.completed_at).getTime() > new Date(grade.due_date).getTime()
}

export function formatDueDate(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null
  const date = new Date(dueDate)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function isDueDatePast(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  return new Date(dueDate).getTime() < Date.now()
}
