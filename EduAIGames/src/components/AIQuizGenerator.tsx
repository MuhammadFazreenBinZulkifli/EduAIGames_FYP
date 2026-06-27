import { useState } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import AIQuizGeneratingLoader from './AIQuizGeneratingLoader'
import PanelEmptyState from './PanelEmptyState'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/AIQuizGenerator_CSS.css'

type Difficulty = 'easy' | 'normal' | 'hard'
type QType = 'multiple-choice' | 'true-false'

interface AIQuestion {
  question_text: string
  question_type: QType
  correct_answer: string
  question_order: number
  explanation: string
  options: Array<{ option_text: string; option_order: number }>
}

interface AIQuizGeneratorProps {
  onPublish: (title: string, description: string, questions: AIQuestion[]) => void
  onCancel: () => void
}

// Identifies the signed-in instructor so the backend can attribute any
// content-moderation block to them in the audit log.
function currentUserHeader(): Record<string, string> {
  // Reading localStorage can throw, so guard it with try/catch.
  try {
    // The logged-in user is stored as JSON under the "user" key.
    const raw = localStorage.getItem('user')
    // No stored user -> send no header.
    if (!raw) return {}
    // Parse the stored JSON to read the user's id.
    const parsed = JSON.parse(raw) as { id?: number }
    // Only send the header when we have a valid numeric id.
    return typeof parsed.id === 'number' ? { 'X-User-Id': String(parsed.id) } : {}
  } catch {
    // On any parsing error, just send no header.
    return {}
  }
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }
const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: 'Basic recall and simple concepts',
  normal: 'Moderate understanding required',
  hard: 'Advanced reasoning and analysis',
}

// Generates quiz questions from a topic via AI, then lets the instructor review and publish.
export default function AIQuizGenerator({ onPublish, onCancel }: AIQuizGeneratorProps) {
  const { alert: showAlert } = usePanelUI()
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [numQuestions, setNumQuestions] = useState(5)
  const [questionType, setQuestionType] = useState<QType>('multiple-choice')
  const [numOptions, setNumOptions] = useState(4)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const [reviewMode, setReviewMode] = useState(false)
  const [quizTitle, setQuizTitle] = useState('')
  const [quizDesc, setQuizDesc] = useState('')
  const [questions, setQuestions] = useState<AIQuestion[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editBuf, setEditBuf] = useState<AIQuestion | null>(null)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  // Calls the AI endpoint to generate questions for the chosen topic and settings.
  const handleGenerate = async () => {
    if (!topic.trim()) { setGenError('Please enter a topic.'); return }
    setGenError('')
    setGenerating(true)

    const diffDesc = difficulty === 'easy'
      ? 'straightforward recall questions suitable for beginners'
      : difficulty === 'normal'
        ? 'conceptual understanding questions for intermediate learners'
        : 'challenging analytical questions for advanced learners'

    const prompt = questionType === 'true-false'
      ? `You are a quiz generator. Generate exactly ${numQuestions} true/false questions about "${topic.trim()}" at ${difficulty} difficulty (${diffDesc}).

Rules:
- Each question must have a clear True or False answer.
- Include a brief explanation (1-2 sentences) for why the answer is correct.
- Return ONLY a valid JSON object.

JSON format:
{
  "title": "Quiz title about the topic",
  "description": "Brief one-sentence description",
  "questions": [
    {
      "question": "Statement that is true or false?",
      "answer": "True",
      "explanation": "Brief explanation why the answer is True/False."
    }
  ]
}`
      : `You are a quiz generator. Generate exactly ${numQuestions} multiple-choice questions about "${topic.trim()}" at ${difficulty} difficulty (${diffDesc}).

Rules:
- Each question must have exactly ${numOptions} answer choices.
- Exactly one choice must be correct.
- Include a brief explanation (1-2 sentences) for why the correct answer is right.
- Return ONLY a valid JSON object.

JSON format:
{
  "title": "Quiz title about the topic",
  "description": "Brief one-sentence description",
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option 1", "Option 2"${numOptions >= 3 ? ', "Option 3"' : ''}${numOptions >= 4 ? ', "Option 4"' : ''}],
      "correct": "Option 1",
      "explanation": "Brief explanation why Option 1 is correct."
    }
  ]
}`

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/quiz-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...currentUserHeader() },
        body: JSON.stringify({ prompt }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error || `API error ${res.status}`)
      }

      const data = await res.json()
      const raw: string = (data as { content?: string }).content ?? ''
      const parsed = JSON.parse(raw)

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error('Unexpected response format from AI.')
      }

      // Normalize OpenAI JSON into the same question shape used by manual quiz creation.
      let mapped: AIQuestion[]
      if (questionType === 'true-false') {
        mapped = (parsed.questions as any[]).slice(0, numQuestions).map((q, i) => ({
          question_text: String(q.question ?? ''),
          question_type: 'true-false' as const,
          correct_answer: String(q.answer ?? 'True'),
          question_order: i + 1,
          explanation: String(q.explanation ?? ''),
          options: [
            { option_text: 'True', option_order: 1 },
            { option_text: 'False', option_order: 2 },
          ],
        }))
      } else {
        mapped = (parsed.questions as any[]).slice(0, numQuestions).map((q, i) => ({
          question_text: String(q.question ?? ''),
          question_type: 'multiple-choice' as const,
          correct_answer: String(q.correct ?? ''),
          question_order: i + 1,
          explanation: String(q.explanation ?? ''),
          options: (q.options as string[]).slice(0, numOptions).map((opt, j) => ({
            option_text: String(opt),
            option_order: j + 1,
          })),
        }))
      }

      setQuizTitle(String(parsed.title ?? `${topic} Quiz`))
      setQuizDesc(String(parsed.description ?? ''))
      setQuestions(mapped)
      setReviewMode(true)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Failed to generate quiz. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // Deep-copy a generated question into a local edit buffer.
  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditBuf(JSON.parse(JSON.stringify(questions[idx])))
  }
  const cancelEdit = () => { setEditingIdx(null); setEditBuf(null) }

  // Validates the edit buffer and writes it back into the review list.
  const saveEdit = () => {
    if (!editBuf) return
    if (!editBuf.question_text.trim()) { void showAlert('Question text cannot be empty.'); return }
    if (editBuf.question_type === 'multiple-choice' && editBuf.options.some(o => !o.option_text.trim())) {
      void showAlert('All options must have text.'); return
    }
    if (!editBuf.correct_answer.trim()) { void showAlert('Please select the correct answer.'); return }
    const next = questions.map((q, i) => i === editingIdx ? { ...editBuf } : q)
    setQuestions(next.map((q, i) => ({ ...q, question_order: i + 1 })))
    cancelEdit()
  }

  // Drops a question from the draft and renumbers the remaining items.
  const removeQuestion = (idx: number) => {
    if (editingIdx === idx) cancelEdit()
    setQuestions(questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, question_order: i + 1 })))
  }

  // Hands off the reviewed quiz to the parent for saving.
  const handlePublish = () => {
    if (!quizTitle.trim()) { void showAlert('Please enter a quiz title.'); return }
    if (questions.length === 0) { void showAlert('At least one question is required.'); return }
    onPublish(quizTitle, quizDesc, questions)
  }

  if (reviewMode) {
    const previewQuestion = previewIdx != null ? questions[previewIdx] : null

    return (
      <div className="panel-page aiq-review-page">
        <div className="aiq-review-topbar">
          <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={onCancel}>
            ← Exit
          </button>
          <span className="aiq-review-topbar__title">Review Quiz</span>
          <button
            type="button"
            className="panel-btn panel-btn-success panel-btn-sm aiq-review-topbar__publish"
            onClick={handlePublish}
            disabled={questions.length === 0}
          >
            Publish
          </button>
        </div>

        <div className="aiq-review-two-col">

          {/* ─── LEFT: Details + Publish ─── */}
          <div className="aiq-review-left">
            <div>
              <p className="panel-kicker">AI Quiz Generator · Review</p>
              <h2 className="aiq-review-heading">Review Quiz</h2>
              <p className="panel-meta">Edit or remove questions, then publish to your class.</p>
            </div>

            <div className="panel-card" style={{ marginBottom: 0 }}>
              <h3 className="panel-section-title">Quiz Details</h3>
              <div className="panel-form-group">
                <label className="panel-label">Quiz Title *</label>
                <input className="panel-input" value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder="Quiz title" />
              </div>
              <div className="panel-form-group" style={{ marginBottom: 0 }}>
                <label className="panel-label">Description</label>
                <textarea className="panel-textarea" value={quizDesc} onChange={e => setQuizDesc(e.target.value)} placeholder="Optional description" rows={2} />
              </div>
            </div>

            <div className="aiq-review-actions">
              <button
                type="button"
                className="panel-btn panel-btn-success"
                onClick={handlePublish}
                disabled={questions.length === 0}
              >
                Publish Quiz
              </button>
              <div className="panel-row aiq-review-actions__secondary">
                <button
                  type="button"
                  className="panel-btn panel-btn-secondary"
                  onClick={() => { setReviewMode(false); setQuestions([]); setPreviewIdx(null) }}
                >
                  ← Regenerate
                </button>
                <button
                  type="button"
                  className="panel-btn panel-btn-secondary"
                  onClick={onCancel}
                >
                  Exit
                </button>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Compact accordion question list ─── */}
          <div className="aiq-review-right">
            <div className="aiq-review-right-header">
              <span className="aiq-review-right-title">Questions</span>
              <span className="ai-quiz-generator__count-badge">
                {questions.length} / {numQuestions}
              </span>
            </div>

            {questions.length === 0 && (
              <PanelEmptyState
                icon="alert"
                title="All questions removed"
                description="Go back to regenerate, or publish an empty quiz (not recommended)."
              />
            )}

            {questions.map((q, idx) => (
              <div
                key={idx}
                className={`aiq-qrow${editingIdx === idx ? ' aiq-qrow--open' : ''}`}
              >
                {editingIdx === idx && editBuf ? (
                  /* ── Expanded edit form ── */
                  <div className="aiq-qrow__edit">
                    <p className="panel-kicker aiq-qrow__edit-kicker">
                      Editing Q{idx + 1} · {editBuf.question_type === 'true-false' ? 'True / False' : 'Multiple Choice'}
                    </p>

                    <div className="panel-form-group">
                      <label className="panel-label">Question Text *</label>
                      <textarea className="panel-textarea" rows={2} value={editBuf.question_text}
                        onChange={e => setEditBuf({ ...editBuf, question_text: e.target.value })} />
                    </div>

                    {editBuf.question_type === 'multiple-choice' ? (
                      <div className="panel-form-group">
                        <label className="panel-label">
                          Answer Options *
                          <span style={{ fontWeight: 400, color: '#9993a3', marginLeft: '0.4rem', fontSize: '0.76rem' }}>
                            click letter = correct
                          </span>
                        </label>
                        <div className="aiq-options-grid">
                          {editBuf.options.map((opt, oi) => {
                            const letter = String.fromCharCode(65 + oi)
                            const isCorrect = opt.option_text.trim() !== '' && editBuf.correct_answer === opt.option_text
                            return (
                              <div key={oi} className="aiq-option-item">
                                <button
                                  type="button"
                                  className={`aiq-option-letter${isCorrect ? ' aiq-option-letter--correct' : ''}`}
                                  onClick={() => { if (opt.option_text.trim()) setEditBuf({ ...editBuf, correct_answer: opt.option_text }) }}
                                  title={`Mark option ${letter} as correct`}
                                >
                                  {letter}
                                </button>
                                <input
                                  className="panel-input"
                                  value={opt.option_text}
                                  onChange={e => {
                                    const wasCorrect = editBuf.correct_answer === opt.option_text
                                    const opts = editBuf.options.map((o, i) => i === oi ? { ...o, option_text: e.target.value } : o)
                                    setEditBuf({ ...editBuf, options: opts, correct_answer: wasCorrect ? e.target.value : editBuf.correct_answer })
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>
                        {editBuf.correct_answer ? (
                          <p style={{ fontSize: '0.74rem', color: '#10b981', margin: '0.3rem 0 0' }}>✓ Correct: {editBuf.correct_answer}</p>
                        ) : (
                          <p style={{ fontSize: '0.74rem', color: '#9993a3', margin: '0.3rem 0 0' }}>Click a letter to mark the correct answer.</p>
                        )}
                      </div>
                    ) : (
                      <div className="panel-form-group">
                        <label className="panel-label">Correct Answer *</label>
                        <div className="panel-row ai-quiz-generator__tf-row">
                          {['True', 'False'].map(v => (
                            <button
                              key={v}
                              type="button"
                              className={`ai-quiz-generator__tf-btn${editBuf.correct_answer === v ? ' ai-quiz-generator__tf-btn--selected' : ''}`}
                              onClick={() => setEditBuf({ ...editBuf, correct_answer: v })}
                            >
                              {v === 'True' ? '✓ True' : '✗ False'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="panel-form-group ai-quiz-generator__explanation-group">
                      <label className="panel-label">Explanation</label>
                      <textarea className="panel-textarea" rows={2} value={editBuf.explanation}
                        placeholder="Why is this the correct answer?"
                        onChange={e => setEditBuf({ ...editBuf, explanation: e.target.value })} />
                    </div>

                    <div className="panel-row ai-quiz-generator__edit-actions">
                      <button type="button" className="panel-btn panel-btn-success panel-btn-sm" onClick={saveEdit}>Save</button>
                      <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={cancelEdit}>Cancel</button>
                      <button type="button" className="panel-btn panel-btn-danger panel-btn-sm" onClick={() => removeQuestion(idx)}>Remove</button>
                    </div>
                  </div>
                ) : (
                  /* ── Compact read row ── */
                  <div className="aiq-qrow__read">
                    <div className="aiq-qrow__read-main">
                      <div className="aiq-qrow__read-head">
                        <span className="aiq-qrow__num">Q{idx + 1}</span>
                        <span className={`aiq-qrow__badge aiq-qrow__badge--${q.question_type === 'multiple-choice' ? 'mc' : 'tf'}`}>
                          {q.question_type === 'multiple-choice' ? 'MC' : 'TF'}
                        </span>
                      </div>
                      <div className="aiq-qrow__text-wrap">
                        <p className="aiq-qrow__text">{q.question_text}</p>
                        <span className="aiq-qrow__answer">✓ {q.correct_answer}</span>
                      </div>
                    </div>
                    <div className="aiq-qrow__actions">
                      <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setPreviewIdx(idx)}>Preview</button>
                      <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => startEdit(idx)}>Edit</button>
                      <button type="button" className="panel-btn panel-btn-danger panel-btn-sm" onClick={() => removeQuestion(idx)}>Remove</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>

        {previewQuestion && previewIdx != null && (
          <div className="aiq-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="aiq-preview-title">
            <div className="aiq-preview-modal panel-card">
              <div className="aiq-preview-modal__header">
                <h3 id="aiq-preview-title">Question {previewIdx + 1}</h3>
                <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setPreviewIdx(null)}>Close</button>
              </div>
              <p className="aiq-preview-modal__question">{previewQuestion.question_text}</p>
              {previewQuestion.options.length > 0 && (
                <ul className="aiq-preview-modal__options">
                  {previewQuestion.options.map((opt) => (
                    <li
                      key={opt.option_order}
                      className={opt.option_text === previewQuestion.correct_answer ? 'aiq-preview-modal__option--correct' : ''}
                    >
                      {opt.option_text === previewQuestion.correct_answer ? '✓ ' : '○ '}
                      {opt.option_text}
                    </li>
                  ))}
                </ul>
              )}
              {previewQuestion.explanation && (
                <p className="aiq-preview-modal__explanation">
                  <strong>Explanation:</strong> {previewQuestion.explanation}
                </p>
              )}
              <div className="panel-row aiq-preview-modal__actions">
                <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => { setPreviewIdx(null); startEdit(previewIdx) }}>Edit question</button>
                <button type="button" className="panel-btn panel-btn-danger panel-btn-sm" onClick={() => { removeQuestion(previewIdx); setPreviewIdx(null) }}>Remove</button>
              </div>
            </div>
          </div>
        )}

        <div className="aiq-review-mobile-bar">
          <button type="button" className="panel-btn panel-btn-secondary" onClick={onCancel}>Exit</button>
          <button type="button" className="panel-btn panel-btn-success" onClick={handlePublish} disabled={questions.length === 0}>
            Publish Quiz
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-page aiq-generate-page">
      <div className="aiq-review-topbar aiq-generate-topbar">
        <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={onCancel}>
          ← Exit
        </button>
        <span className="aiq-review-topbar__title">AI Quiz Generator</span>
        <span className="aiq-review-topbar__spacer" aria-hidden="true" />
      </div>
      {generating && <AIQuizGeneratingLoader topic={topic.trim()} />}

      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">AI Quiz Generator</p>
        <h1>Generate a Quiz with AI</h1>
        <p className="panel-hero-greeting">Enter a topic, choose your settings, and let EduBot build the questions for you.</p>
      </div>

      {genError && <div className="panel-alert panel-alert-error">{genError}</div>}

      <div className="panel-card">
        <h3 className="panel-section-title">Quiz Topic</h3>

        <div className="panel-form-group">
          <label className="panel-label">Topic *</label>
          <input
            className="panel-input" type="text" value={topic} disabled={generating}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. World War II, Photosynthesis, Python Loops…"
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate() }}
          />
        </div>

        <div className="panel-form-group ai-quiz-generator__form-group--last">
          <label className="panel-label">Number of Questions</label>
          <div className="panel-row ai-quiz-generator__count-row">
            {[5, 10, 15, 20].map(n => (
              <button
                key={n}
                type="button"
                disabled={generating}
                onClick={() => setNumQuestions(n)}
                className={`ai-quiz-generator__count-btn${numQuestions === n ? ' ai-quiz-generator__count-btn--selected' : ''}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <h3 className="panel-section-title">Question Type</h3>
        <div className="panel-row ai-quiz-generator__type-row">
          {(['multiple-choice', 'true-false'] as QType[]).map(qt => (
            <button
              key={qt}
              type="button"
              disabled={generating}
              onClick={() => setQuestionType(qt)}
              className={`ai-quiz-generator__type-btn${questionType === qt ? ' ai-quiz-generator__type-btn--selected' : ''}`}
            >
              <p className={`ai-quiz-generator__type-title${questionType === qt ? ' ai-quiz-generator__type-title--selected' : ''}`}>
                {qt === 'multiple-choice' ? '🔘 Multiple Choice' : '☑️ True / False'}
              </p>
              <p className="ai-quiz-generator__type-desc">
                {qt === 'multiple-choice' ? 'Choose from several options' : 'True or False statements'}
              </p>
            </button>
          ))}
        </div>

        {questionType === 'multiple-choice' && (
          <div className="ai-quiz-generator__options-section">
            <label className="panel-label ai-quiz-generator__options-label-block">
              Number of Answer Choices
            </label>
            <div className="panel-row ai-quiz-generator__options-count-row">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={generating}
                  onClick={() => setNumOptions(n)}
                  className={`ai-quiz-generator__options-count-btn${numOptions === n ? ' ai-quiz-generator__options-count-btn--selected' : ''}`}
                >
                  {n} options
                </button>
              ))}
            </div>
          </div>
        )}

        <hr className="panel-divider ai-quiz-generator__divider" />

        <h3 className="panel-section-title ai-quiz-generator__difficulty-title">Difficulty</h3>
        <div className="panel-row ai-quiz-generator__difficulty-row">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
            <button
              key={d}
              type="button"
              disabled={generating}
              onClick={() => setDifficulty(d)}
              className={`ai-quiz-generator__difficulty-btn${difficulty === d ? ' ai-quiz-generator__difficulty-btn--selected' : ''}`}
            >
              <p className={`ai-quiz-generator__difficulty-label${difficulty === d ? ' ai-quiz-generator__difficulty-label--selected' : ''}`}>
                {DIFFICULTY_LABELS[d]}
              </p>
              <p className="ai-quiz-generator__difficulty-desc">
                {DIFFICULTY_DESC[d]}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-row ai-quiz-generator__actions-row">
        <button
          type="button"
          className="panel-btn panel-btn-primary ai-quiz-generator__generate-btn"
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
        >
          {generating ? 'Generating…' : 'Generate Quiz'}
        </button>
        <button type="button" className="panel-btn panel-btn-secondary ai-quiz-generator__publish-btn" onClick={onCancel} disabled={generating}>
          Exit
        </button>
      </div>
    </div>
  )
}
