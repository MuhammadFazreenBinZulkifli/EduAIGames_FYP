import { useState } from 'react'
import './App_CSS/QuizPreview_CSS.css'

interface Question {
  id: string
  type: 'multiple-choice' | 'true-false'
  question: string
  options?: string[]
  correctAnswer: string
}

interface Quiz {
  id: string
  title: string
  description: string
  questions: Question[]
  createdAt: string
}

interface QuizPreviewProps {
  quiz: Quiz
  onBack: () => void
}

// Read-only preview of a quiz with expandable question details.
function QuizPreview({ quiz, onBack }: QuizPreviewProps) {
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions)
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId)
    } else {
      newExpanded.add(questionId)
    }
    setExpandedQuestions(newExpanded)
  }

  const renderOption = (label: string, text: string, isCorrect: boolean) => (
    <div
      key={label}
      className={`quiz-preview__option${isCorrect ? ' quiz-preview__option--correct' : ''}`}
    >
      <span className={`quiz-preview__option-letter${isCorrect ? ' quiz-preview__option-letter--correct' : ''}`}>
        {label}
      </span>
      <span className={`quiz-preview__option-text${isCorrect ? ' quiz-preview__option-text--correct' : ''}`}>
        {text}
      </span>
      {isCorrect && (
        <span className="quiz-preview__correct-badge">✓ Correct</span>
      )}
    </div>
  )

  return (
    <div className="quiz-preview__page">
      <div className="quiz-preview__container">
        <div className="quiz-preview__header">
          <button type="button" className="quiz-preview__back-btn" onClick={onBack}>
            ← Back to Quizzes
          </button>
        </div>

        <div className="quiz-preview__card">
          <div className="quiz-preview__quiz-header">
            <h1 className="quiz-preview__title">{quiz.title}</h1>
            {quiz.description && (
              <p className="quiz-preview__description">{quiz.description}</p>
            )}
            <div className="quiz-preview__meta-row">
              <div className="quiz-preview__meta-badge">
                <span className="quiz-preview__meta-icon">📝</span>
                <span>{quiz.questions.length} {quiz.questions.length === 1 ? 'Question' : 'Questions'}</span>
              </div>
              <div className="quiz-preview__meta-badge quiz-preview__meta-badge--date">
                <span className="quiz-preview__meta-icon">📅</span>
                <span>{quiz.createdAt}</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="quiz-preview__section-title">Questions Overview</h2>

            {quiz.questions.length === 0 ? (
              <div className="quiz-preview__empty">
                <p className="quiz-preview__empty-text">No questions in this quiz.</p>
              </div>
            ) : (
              <div className="quiz-preview__questions-list">
                {quiz.questions.map((question, index) => {
                  const isExpanded = expandedQuestions.has(question.id)
                  return (
                    <div
                      key={question.id}
                      className={`quiz-preview__question-item${isExpanded ? ' quiz-preview__question-item--expanded' : ''}`}
                    >
                      <div
                        className={`quiz-preview__question-header${isExpanded ? ' quiz-preview__question-header--expanded' : ''}`}
                        onClick={() => toggleQuestion(question.id)}
                      >
                        <div className="quiz-preview__question-body">
                          <div className="quiz-preview__question-num-row">
                            <span className="quiz-preview__question-num">{index + 1}</span>
                            <h4 className="quiz-preview__question-title">{question.question}</h4>
                          </div>
                          <p className="quiz-preview__question-type">
                            {question.type === 'multiple-choice' ? '🔘 Multiple Choice' : '✓✗ True/False'}
                          </p>
                        </div>
                        <span className={`quiz-preview__chevron${isExpanded ? ' quiz-preview__chevron--expanded' : ''}`}>
                          ▼
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="quiz-preview__details">
                          <p className="quiz-preview__options-label">Answer Options</p>
                          <div className="quiz-preview__options-list">
                            {question.type === 'multiple-choice'
                              ? question.options?.map((option, idx) =>
                                  renderOption(String.fromCharCode(65 + idx), option, option === question.correctAnswer)
                                )
                              : (
                                <>
                                  {renderOption('A', 'True', question.correctAnswer === 'true')}
                                  {renderOption('B', 'False', question.correctAnswer === 'false')}
                                </>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="quiz-preview__footer">
            <button type="button" className="quiz-preview__footer-btn" onClick={onBack}>
              ← Back to Quizzes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuizPreview
