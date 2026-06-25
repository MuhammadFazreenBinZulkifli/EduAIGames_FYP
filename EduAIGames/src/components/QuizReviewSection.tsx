import React from 'react'
import './App_CSS/QuizReviewSection_CSS.css'

export interface ReviewQuestion {
  question_type: 'multiple-choice' | 'true-false'
  question_text: string
  options: string[]
  correct_answer: string
  explanation?: string
}

interface QuizReviewSectionProps {
  questions: ReviewQuestion[]
  /** Per-question selected answer (keys may be string indices from JSON). */
  answersByIndex: Record<string, string>
}

type ReviewState = 'review' | 'correct' | 'incorrect'

function stateSuffix(state: ReviewState): string {
  return state === 'review' ? '--review' : state === 'correct' ? '--correct' : '--incorrect'
}

/** Shared “Question Review” cards (same look as post-quiz results). */
// Renders a question-by-question review with correct answers and explanations.
export function QuizReviewSection({ questions, answersByIndex }: QuizReviewSectionProps) {
  const getAnswer = (i: number) => answersByIndex[String(i)]

  return (
    <>
      <div className="quiz-review__header-row">
        <h2 className="panel-section-title quiz-review__title">Question Review</h2>
        <span className="quiz-review__count-badge">
          {questions.length} questions
        </span>
      </div>

      {questions.map((q, i) => {
        const studentAns = getAnswer(i)
        const missing = !studentAns || String(studentAns).trim() === ''
        const answerKey = missing
        const isCorrect = !missing && studentAns === q.correct_answer
        const isTF = q.question_type === 'true-false'

        const state: ReviewState = answerKey ? 'review' : isCorrect ? 'correct' : 'incorrect'
        const sfx = stateSuffix(state)

        return (
          <div key={i} className={`quiz-review__card quiz-review__card${sfx}`}>
            <div className={`quiz-review__card-header quiz-review__card-header${sfx}`}>
              <div className="quiz-review__card-header-left">
                <span className="quiz-review__q-num">Q{i + 1}</span>
                <span className={`quiz-review__type-badge ${isTF ? 'quiz-review__type-badge--tf' : 'quiz-review__type-badge--mc'}`}>
                  {isTF ? 'TRUE / FALSE' : 'MULTIPLE CHOICE'}
                </span>
              </div>
              <span className={`quiz-review__status-badge quiz-review__status-badge${sfx}`}>
                {answerKey ? '📖 Review' : isCorrect ? '✓ Correct' : '✗ Incorrect'}
              </span>
            </div>

            <div className="quiz-review__card-body">
              <p className="quiz-review__question-text">
                {q.question_text}
              </p>

              <div className="quiz-review__options">
                {q.options.map((opt) => {
                  const isCorrectOpt = opt === q.correct_answer
                  const isStudentChoice = !missing && opt === studentAns
                  const isWrongChoice = isStudentChoice && !isCorrectOpt

                  let optionClass = 'quiz-review__option--default'
                  let textClass = 'quiz-review__option-text--muted'
                  let labelEl: React.ReactNode = null

                  if (answerKey && isCorrectOpt) {
                    optionClass = 'quiz-review__option--correct-key'
                    textClass = 'quiz-review__option-text--correct'
                    labelEl = <span className="quiz-review__option-label quiz-review__option-label--correct">Correct answer</span>
                  } else if (isCorrectOpt && isStudentChoice) {
                    optionClass = 'quiz-review__option--correct-strong'
                    textClass = 'quiz-review__option-text--correct'
                    labelEl = <span className="quiz-review__option-label quiz-review__option-label--correct">Your answer ✓</span>
                  } else if (isCorrectOpt) {
                    optionClass = 'quiz-review__option--correct'
                    textClass = 'quiz-review__option-text--correct'
                    labelEl = <span className="quiz-review__option-label quiz-review__option-label--correct">Correct ✓</span>
                  } else if (isWrongChoice) {
                    optionClass = 'quiz-review__option--wrong'
                    textClass = 'quiz-review__option-text--wrong'
                    labelEl = <span className="quiz-review__option-label quiz-review__option-label--wrong">Your answer ✗</span>
                  }

                  return (
                    <div key={opt} className={`quiz-review__option ${optionClass}`}>
                      <span className={`quiz-review__option-text ${textClass}`}>
                        {opt}
                      </span>
                      {labelEl}
                    </div>
                  )
                })}
              </div>

              {q.explanation ? (
                <div className="quiz-review__explanation">
                  <p className="quiz-review__explanation-kicker">
                    💡 Explanation
                  </p>
                  <p className="quiz-review__explanation-text">
                    {q.explanation}
                  </p>
                </div>
              ) : (
                <div className="quiz-review__no-explanation">
                  <p className="quiz-review__no-explanation-text">
                    No explanation available for this question.
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
