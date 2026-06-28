/** Shared helpers so Maze Quest & Snake Quest support MC (2–4 opts) and true/false quizzes. */

export type GameQuestionType = 'multiple-choice' | 'true-false'

export interface RawQuizQuestion {
  id?: number
  question_text: string
  question_type: GameQuestionType
  correct_answer: string
  question_order?: number
  explanation?: string
  options?: { option_text: string; option_order?: number; id?: number }[]
}

export interface GamePlayOption {
  option_text: string
  is_correct: boolean
  option_order: number
}

export interface GamePlayQuestion {
  id: number
  question_text: string
  question_type: GameQuestionType
  correct_answer: string
  question_order: number
  explanation?: string
  options: GamePlayOption[]
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * True when a keyboard event originates from an editable field (input, textarea,
 * select, or contenteditable). Games listen on `window`, so without this guard
 * their WASD/arrow handlers would swallow keystrokes while an instructor types
 * in a text box (e.g. naming/saving a game in the content maker).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

/** Build playable options with is_correct for maze gates and snake fruits. */
export function getOptionsForQuestion(q: RawQuizQuestion): GamePlayOption[] {
  if (q.question_type === 'true-false') {
    if (!q.correct_answer?.trim()) return []
    const correct = norm(q.correct_answer)
    const isTrue = correct === 'true'
    const isFalse = correct === 'false'
    if (!isTrue && !isFalse) return []
    return [
      { option_text: 'True', option_order: 1, is_correct: isTrue },
      { option_text: 'False', option_order: 2, is_correct: isFalse },
    ]
  }

  const sorted = [...(q.options || [])].sort(
    (a, b) => (a.option_order ?? 0) - (b.option_order ?? 0)
  )
  const texts = sorted
    .map((o) => o.option_text?.trim())
    .filter((t): t is string => !!t)
  if (texts.length < 2 || texts.length > 4) return []

  const correct = norm(q.correct_answer)
  return texts.map((text, i) => ({
    option_text: text,
    option_order: i + 1,
    is_correct: norm(text) === correct,
  }))
}

export function isPlayableGameQuestion(q: RawQuizQuestion): boolean {
  if (!q.question_text?.trim() || !q.question_type || !q.correct_answer?.trim()) return false
  return getOptionsForQuestion(q).length >= 2
}

export function normalizeQuestionsForGame(questions: RawQuizQuestion[]): GamePlayQuestion[] {
  return questions
    .filter(isPlayableGameQuestion)
    .map((q, i) => ({
      id: q.id ?? i + 1,
      question_text: q.question_text,
      question_type: q.question_type,
      correct_answer: q.correct_answer,
      question_order: q.question_order ?? i + 1,
      explanation: q.explanation,
      options: getOptionsForQuestion(q),
    }))
    .sort((a, b) => a.question_order - b.question_order)
}

export function countPlayableQuestions(questions: RawQuizQuestion[]): number {
  return normalizeQuestionsForGame(questions).length
}
