import { useState, useEffect } from 'react'
import { usePanelUI } from '../context/PanelUIContext'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import './App_CSS/EditQuiz_CSS.css'

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

interface EditQuizProps {
  quiz: Quiz
  onBack?: () => void
  onSave: (updatedQuiz: Quiz) => void
}

// Full-screen editor for adding, updating, and removing quiz questions.
function EditQuiz({ quiz, onBack, onSave }: EditQuizProps) {
  const { toast, alert: showAlert } = usePanelUI()
  const [quizTitle, setQuizTitle] = useState(quiz.title)
  const [quizDescription, setQuizDescription] = useState(quiz.description)
  const [questions, setQuestions] = useState<Question[]>(quiz.questions)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  /** When false, question is shown as a short summary with Edit to expand the full editor. */
  const [questionExpanded, setQuestionExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setQuestionExpanded(Object.fromEntries(quiz.questions.map((q) => [q.id, true])))
  }, [quiz.id, quiz.questions.length])

  // Inserts a blank question scaffold and expands it in the editor.
  const addQuestion = (type: 'multiple-choice' | 'true-false') => {
    const id = Date.now().toString()
    const newQuestion: Question = {
      id,
      type,
      question: '',
      options: type === 'multiple-choice' ? ['', '', '', ''] : undefined,
      correctAnswer: type === 'true-false' ? 'true' : ''
    }
    setQuestions([...questions, newQuestion])
    setQuestionExpanded((prev) => ({ ...prev, [id]: true }))
  }

  const updateQuestion = (id: string, field: string, value: any) => {
    setQuestions(questions.map(q =>
      q.id === id ? { ...q, [field]: value } : q
    ))
  }

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options) {
        const newOptions = [...q.options]
        newOptions[optionIndex] = value
        return { ...q, options: newOptions }
      }
      return q
    }))
  }

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options && q.options.length > 2) {
        return { ...q, options: q.options.filter((_, i) => i !== optionIndex) }
      }
      return q
    }))
  }

  const addOption = (questionId: string) => {
    setQuestions(questions.map(q => {
      if (q.id === questionId && q.options) {
        return { ...q, options: [...q.options, ''] }
      }
      return q
    }))
  }

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id))
    setQuestionExpanded((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // Validates the quiz and passes the updated version back to the parent.
  const saveQuiz = () => {
    if (!quizTitle.trim()) {
      void showAlert('Please enter a quiz title')
      return
    }

    if (questions.length === 0) {
      void showAlert('Please add at least one question')
      return
    }

    // Validate all questions are complete
    const allValid = questions.every(q => {
      if (!q.question.trim()) return false
      if (q.type === 'multiple-choice' && (!q.options || q.options.some(o => !o.trim()))) return false
      if (!q.correctAnswer) return false
      return true
    })

    if (!allValid) {
      void showAlert('Please fill in all question details')
      return
    }

    const updatedQuiz: Quiz = {
      id: quiz.id,
      title: quizTitle,
      description: quizDescription,
      questions,
      createdAt: quiz.createdAt
    }

    onSave(updatedQuiz)
    toast('Quiz updated successfully!', 'success')
    setShowSuccessMessage(true)
    setTimeout(() => {
      setShowSuccessMessage(false)
    }, 2000)
  }

  return (
    <div className="quiz-creation">
      <PanelBreadcrumbs items={[
        { label: 'Library', onClick: onBack },
        { label: 'Edit Quiz' },
      ]} />
      <div className="quiz-creation-header">
        <h1>Edit Quiz</h1>
      </div>

      <div className="quiz-creation-content">
        {showSuccessMessage && (
          <div className="success-message">
            ✓ Quiz updated successfully!
          </div>
        )}

        <div className="quiz-form-section">
          <h2>Quiz Details</h2>
          <div className="form-group">
            <label>Quiz Title *</label>
            <input
              type="text"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Enter quiz title"
            />
          </div>
          <div className="form-group">
            <label>Quiz Description</label>
            <textarea
              value={quizDescription}
              onChange={(e) => setQuizDescription(e.target.value)}
              placeholder="Enter quiz description (optional)"
            />
          </div>
        </div>

        <div className="quiz-form-section">
          <h2>Questions</h2>
          <div className="button-group">
            <button
              onClick={() => addQuestion('multiple-choice')}
              className="add-question-btn"
            >
              + Add Multiple Choice
            </button>
            <button
              onClick={() => addQuestion('true-false')}
              className="add-question-btn"
            >
              + Add True/False
            </button>
          </div>

          {questions.length === 0 ? (
            <p className="edit-quiz__empty-hint">
              No questions added yet. Click the buttons above to add questions.
            </p>
          ) : (
            questions.map((question, index) => {
              const expanded = questionExpanded[question.id] !== false
              return (
                <div key={question.id} className="question-card">
                <h4 className="edit-quiz__question-heading">
                  <span>
                    Question {index + 1}{' '}
                    <span className="edit-quiz__question-type">
                      ({question.type === 'multiple-choice' ? 'Multiple Choice' : 'True/False'})
                    </span>
                  </span>
                  <span className="edit-quiz__question-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setQuestionExpanded((prev) => ({
                          ...prev,
                          [question.id]: !expanded,
                        }))
                      }
                      className="add-question-btn edit-quiz__toggle-btn"
                    >
                      {expanded ? 'Collapse' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      className="remove-btn"
                    >
                      Remove
                    </button>
                  </span>
                </h4>

                {!expanded && (
                  <p className="edit-quiz__preview">
                    <strong>Preview:</strong>{' '}
                    {question.question.trim() || '(empty question)'} ·{' '}
                    <em>Answer:</em> {question.correctAnswer || '—'}
                  </p>
                )}

                {expanded && (
                <>
                <div className="form-group">
                  <label>Question Text *</label>
                  <input
                    type="text"
                    value={question.question}
                    onChange={(e) =>
                      updateQuestion(question.id, 'question', e.target.value)
                    }
                    placeholder="Enter question"
                  />
                </div>

                {question.type === 'multiple-choice' ? (
                  <>
                    <div className="edit-quiz__options-wrap">
                      <label className="edit-quiz__options-label">
                        Options *
                      </label>
                      {question.options?.map((option, optIndex) => (
                        <div key={optIndex} className="option-input">
                          <input
                            type="text"
                            value={option}
                            onChange={(e) =>
                              updateOption(question.id, optIndex, e.target.value)
                            }
                            placeholder={`Option ${optIndex + 1}`}
                          />
                          {question.options && question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(question.id, optIndex)}
                              className="remove-option-btn"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      {question.options && question.options.length < 6 && (
                        <button
                          type="button"
                          onClick={() => addOption(question.id)}
                          className="add-option-btn"
                        >
                          + Add Option
                        </button>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Correct Answer *</label>
                      <select
                        value={question.correctAnswer}
                        onChange={(e) =>
                          updateQuestion(question.id, 'correctAnswer', e.target.value)
                        }
                      >
                        <option value="">Select correct answer</option>
                        {question.options?.map((option, idx) => (
                          <option key={idx} value={option}>
                            Option {idx + 1}: {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="form-group">
                    <label>Correct Answer *</label>
                    <select
                      value={question.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(question.id, 'correctAnswer', e.target.value)
                      }
                    >
                      <option value="">Select answer</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </div>
                )}
                </>
                )}
                </div>
              )
            })
          )}
        </div>

        <div className="button-group">
          <button type="button" onClick={saveQuiz} className="primary-btn">
            Save Changes
          </button>
          {onBack && (
            <button type="button" onClick={onBack} className="secondary-btn">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditQuiz
