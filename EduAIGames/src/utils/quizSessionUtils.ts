export interface PlayableQuestion {
  id?: number
  question_type: string
  question_text: string
  correct_answer: string
  explanation?: string
  options: string[]
}

export interface PlayableQuiz {
  id: number | string
  class_id?: number | null
  title: string
  description: string
  time_limit_minutes?: number | null
  shuffle_questions?: boolean
  shuffle_options?: boolean
  max_attempts?: number | null
  show_results_after?: 'immediate' | 'never'
  allow_late_submit?: boolean
  questions: PlayableQuestion[]
}

function shuffleCopy<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Applies instructor shuffle settings for a single student attempt. */
export function prepareQuizSession<T extends PlayableQuiz>(quiz: T): T {
  let questions = [...quiz.questions]
  if (quiz.shuffle_questions) {
    questions = shuffleCopy(questions)
  }
  if (quiz.shuffle_options) {
    questions = questions.map((q) => ({
      ...q,
      options: shuffleCopy([...q.options]),
    }))
  }
  return { ...quiz, questions }
}
