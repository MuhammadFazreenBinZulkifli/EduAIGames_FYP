import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import { ROUTES } from '../routes/paths'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import AIQuizGenerator from './AIQuizGenerator'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import PanelSkeleton from './PanelSkeleton'
import PanelIcon from './PanelIcon'
import QuizDueBadge from './QuizDueBadge'
import QuizDueDatePicker, { QuizDueDateSummary } from './QuizDueDatePicker'
import { datetimeLocalToIso, isoToDatetimeLocal } from '../utils/quizDueDateUtils'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/QuizCreation_CSS.css'

interface Question {
  question_text: string
  question_type: 'multiple-choice' | 'true-false'
  correct_answer: string
  question_order: number
  explanation?: string
  options?: Array<{ option_text: string; option_order: number }>
}

interface Quiz {
  id: number
  instructor_id: number
  class_id?: number
  title: string
  description: string
  questions: Question[]
  created_at: string
  due_date?: string | null
  time_limit_minutes?: number | null
  shuffle_questions?: boolean
  shuffle_options?: boolean
  max_attempts?: number | null
  show_results_after?: 'immediate' | 'due_date' | 'never'
  allow_late_submit?: boolean
}

interface QuizSettings {
  time_limit_minutes: number | null
  shuffle_questions: boolean
  shuffle_options: boolean
  max_attempts: number | null
  show_results_after: 'immediate' | 'due_date' | 'never'
  allow_late_submit: boolean
}

const DEFAULT_SETTINGS: QuizSettings = {
  time_limit_minutes: null,
  shuffle_questions: false,
  shuffle_options: false,
  max_attempts: null,
  show_results_after: 'immediate',
  allow_late_submit: true,
}

interface ClassItem {
  id: number
  title: string
}

interface QuizCreationProps {
  instructorId?: number
  classId?: number
  /** Save to library without tying to a single class (publish from Manage Class later). */
  libraryMode?: boolean
  editQuizId?: number
  onExit?: () => void
}

// Builds and manages quizzes — per-class or library-wide for all classes.
function QuizCreation({ instructorId, classId, libraryMode = false, editQuizId, onExit }: QuizCreationProps) {
  const { toast, confirm, alert: showAlert } = usePanelUI()
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | ''>(classId ?? '')
  const [loading, setLoading] = useState(!libraryMode)
  const [loadingQuiz, setLoadingQuiz] = useState(!!(libraryMode && editQuizId))
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(libraryMode)
  const [editingQuizId, setEditingQuizId] = useState<number | null>(null)
  const [formData, setFormData] = useState({ title: '', description: '', questions: [] as any[] })
  const [currentQuestion, setCurrentQuestion] = useState({
    type: 'multiple-choice' as 'multiple-choice' | 'true-false',
    question: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: ''
  })
  const builderRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  /** When set, the "Add a Question" form updates this index instead of appending. */
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [previewQuiz, setPreviewQuiz] = useState<Quiz | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewAnswers, setPreviewAnswers] = useState<Record<number, string>>({})
  const [previewConfirmed, setPreviewConfirmed] = useState<Set<number>>(new Set())
  const [searchParams, setSearchParams] = useSearchParams()
  const { features } = usePlatformFeatures()
  const aiQuizAvailable = features.ai_quiz_enabled && features.openai_enabled

  // Dashboard / Content Maker can deep-link here with ?openAi=1.
  useEffect(() => {
    if (searchParams.get('openAi') === '1' && aiQuizAvailable && (classId || libraryMode)) {
      setShowAIGenerator(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, aiQuizAvailable, classId, libraryMode, setSearchParams])

  const libraryBreadcrumbs = useMemo(() => [
    instructorDashboardCrumb(),
    { label: INSTRUCTOR_NAV.contentMaker, to: ROUTES.instructor.studio },
    { label: editQuizId ? 'Edit Quiz' : 'Create Quiz' },
  ], [editQuizId])

  const selectedClassTitle = useMemo(
    () => classes.find((c) => c.id === selectedClassId)?.title ?? '',
    [classes, selectedClassId]
  )

  const classBreadcrumbs = useMemo(() => {
    if (!selectedClassId) return []
    const title = selectedClassTitle || 'Class'
    return [
      instructorDashboardCrumb(),
      { label: INSTRUCTOR_NAV.myClasses, to: ROUTES.instructor.classes },
      { label: title, to: ROUTES.instructor.classManage(selectedClassId) },
      { label: 'Quizzes' },
    ]
  }, [selectedClassId, selectedClassTitle])

  // Load an existing library quiz for editing.
  useEffect(() => {
    if (!libraryMode || !editQuizId || !instructorId) return
    const loadQuiz = async () => {
      try {
        setLoadingQuiz(true)
        setError(null)
        const res = await fetch(`${API_BASE_URL}/api/quizzes/${editQuizId}?instructor_id=${instructorId}`)
        if (!res.ok) throw new Error('Failed to load quiz')
        const data = await res.json()
        const quiz = data.quiz as Quiz
        resetQuestionForm()
        setFormData({ title: quiz.title, description: quiz.description, questions: quiz.questions })
        setEditingQuizId(quiz.id)
        setDueDate(quiz.due_date ? isoToDatetimeLocal(quiz.due_date) : '')
        setSettings({
          time_limit_minutes: quiz.time_limit_minutes ?? null,
          shuffle_questions: quiz.shuffle_questions ?? false,
          shuffle_options: quiz.shuffle_options ?? false,
          max_attempts: quiz.max_attempts ?? null,
          show_results_after: quiz.show_results_after ?? 'immediate',
          allow_late_submit: quiz.allow_late_submit ?? true,
        })
        setShowForm(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quiz')
      } finally {
        setLoadingQuiz(false)
      }
    }
    void loadQuiz()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryMode, editQuizId, instructorId])

  useEffect(() => {
    if (libraryMode) return
    const fetchClasses = async () => {
      if (!instructorId) return
      try {
        const response = await fetch(`${API_BASE_URL}/api/classes/instructor/${instructorId}`)
        if (!response.ok) throw new Error('Failed to fetch classes')
        const data = await response.json()
        setClasses((data.classes || []).map((c: any) => ({ id: c.id, title: c.title })))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch classes')
      }
    }
    fetchClasses()
  }, [instructorId])

  useEffect(() => {
    if (libraryMode) return
    const fetchQuizzes = async () => {
      if (!selectedClassId) { setQuizzes([]); setLoading(false); return }
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`${API_BASE_URL}/api/quizzes/class/${selectedClassId}`)
        if (!response.ok) throw new Error('Failed to fetch quizzes')
        const data = await response.json()
        setQuizzes(data.quizzes || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch quizzes')
      } finally {
        setLoading(false)
      }
    }
    fetchQuizzes()
  }, [selectedClassId])

  const resetQuestionForm = () => {
    setEditingQuestionIndex(null)
    setCurrentQuestion({ type: 'multiple-choice', question: '', options: ['', '', '', ''], correctAnswer: '', explanation: '' })
  }

  // Appends a new question or updates the one currently being edited in the form.
  const handleAddOrUpdateQuestion = () => {
    if (!currentQuestion.question.trim()) { void showAlert('Please enter a question'); return }
    const filledOptions = currentQuestion.options.filter((o) => o.trim())
    if (currentQuestion.type === 'multiple-choice' && filledOptions.length < 2) {
      void showAlert('Please add at least 2 answer options'); return
    }
    if (!currentQuestion.correctAnswer.trim() || !currentQuestion.options.includes(currentQuestion.correctAnswer)) {
      void showAlert('Please click a letter button to select the correct answer'); return
    }

    const newQuestion = {
      question_text: currentQuestion.question,
      question_type: currentQuestion.type,
      correct_answer: currentQuestion.correctAnswer,
      question_order: editingQuestionIndex !== null ? editingQuestionIndex + 1 : formData.questions.length + 1,
      explanation: currentQuestion.explanation.trim() || undefined,
      options:
        currentQuestion.type === 'multiple-choice'
          ? currentQuestion.options.filter((o) => o.trim()).map((opt, idx) => ({ option_text: opt, option_order: idx + 1 }))
          : [{ option_text: 'True', option_order: 1 }, { option_text: 'False', option_order: 2 }]
    }

    if (editingQuestionIndex !== null) {
      const next = [...formData.questions]
      next[editingQuestionIndex] = newQuestion
      setFormData({ ...formData, questions: next.map((q, i) => ({ ...q, question_order: i + 1 })) })
    } else {
      setFormData({
        ...formData,
        questions: [...formData.questions, newQuestion].map((q, i) => ({ ...q, question_order: i + 1 }))
      })
    }
    resetQuestionForm()
  }

  // Loads an existing draft question back into the editor for changes.
  const handleStartEditQuestion = (index: number) => {
    const q = formData.questions[index]
    let correct = q.correct_answer
    if (q.question_type === 'true-false') {
      if (correct.toLowerCase() === 'true') correct = 'True'
      if (correct.toLowerCase() === 'false') correct = 'False'
    }
    setCurrentQuestion({
      type: q.question_type,
      question: q.question_text,
      options:
        q.question_type === 'multiple-choice'
          ? (q.options?.length ? q.options.map((o: { option_text: string }) => o.option_text) : ['', '', '', ''])
          : ['True', 'False'],
      correctAnswer: correct,
      explanation: q.explanation || ''
    })
    setEditingQuestionIndex(index)
    // Auto-scroll to the question builder
    setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleRemoveQuestion = (index: number) => {
    if (editingQuestionIndex === index) resetQuestionForm()
    else if (editingQuestionIndex !== null && editingQuestionIndex > index) {
      setEditingQuestionIndex(editingQuestionIndex - 1)
    }
    const filtered = formData.questions.filter((_, i) => i !== index)
    setFormData({
      ...formData,
      questions: filtered.map((q, i) => ({ ...q, question_order: i + 1 }))
    })
  }

  // Creates or updates a quiz with all its questions.
  const handleSaveQuiz = async () => {
    if (!formData.title.trim()) { void showAlert('Please enter quiz title'); return }
    if (formData.questions.length === 0) { void showAlert('Please add at least one question'); return }
    if (!instructorId) { void showAlert('Instructor ID is required'); return }
    if (!libraryMode && !selectedClassId) { void showAlert('Please select a class'); return }

    try {
      setSaving(true)
      setError(null)

      const endpoint = editingQuizId
        ? `${API_BASE_URL}/api/quizzes/${editingQuizId}`
        : `${API_BASE_URL}/api/quizzes`

      const response = await fetch(endpoint, {
        method: editingQuizId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          class_id: libraryMode ? null : selectedClassId,
          ...formData,
          due_date: dueDate ? datetimeLocalToIso(dueDate) : null,
          ...settings,
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to save quiz')
      }

      if (libraryMode) {
        resetQuestionForm()
        setFormData({ title: '', description: '', questions: [] })
        setEditingQuizId(null)
        setDueDate('')
        setSettings(DEFAULT_SETTINGS)
        toast(libraryMode ? 'Quiz saved to your library!' : 'Quiz saved successfully!', 'success')
        onExit?.()
        return
      }

      const refreshResponse = await fetch(`${API_BASE_URL}/api/quizzes/class/${selectedClassId}`)
      if (refreshResponse.ok) setQuizzes((await refreshResponse.json()).quizzes || [])

      resetQuestionForm()
      setFormData({ title: '', description: '', questions: [] })
      setEditingQuizId(null)
      setShowForm(false)
      toast('Quiz saved successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save quiz'
      setError(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEditQuiz = (quiz: Quiz) => {
    resetQuestionForm()
    setFormData({ title: quiz.title, description: quiz.description, questions: quiz.questions })
    setEditingQuizId(quiz.id)
    setDueDate(quiz.due_date ? isoToDatetimeLocal(quiz.due_date) : '')
    setSettings({
      time_limit_minutes: quiz.time_limit_minutes ?? null,
      shuffle_questions: quiz.shuffle_questions ?? false,
      shuffle_options: quiz.shuffle_options ?? false,
      max_attempts: quiz.max_attempts ?? null,
      show_results_after: quiz.show_results_after ?? 'immediate',
      allow_late_submit: quiz.allow_late_submit ?? true,
    })
    setShowForm(true)
  }

  const handleDeleteQuiz = async (id: number) => {
    if (!(await confirm({ message: 'Are you sure you want to delete this quiz?', danger: true }))) return
    try {
      setSaving(true)
      const response = await fetch(`${API_BASE_URL}/api/quizzes/${id}?instructor_id=${instructorId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete quiz')
      if (selectedClassId) {
        const refreshResponse = await fetch(`${API_BASE_URL}/api/quizzes/class/${selectedClassId}`)
        if (refreshResponse.ok) setQuizzes((await refreshResponse.json()).quizzes || [])
      }
      toast('Quiz deleted successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete quiz'
      setError(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const cancelForm = () => {
    if (libraryMode) {
      onExit?.()
      return
    }
    resetQuestionForm()
    setShowForm(false)
    setFormData({ title: '', description: '', questions: [] })
    setEditingQuizId(null)
    setDueDate('')
    setSettings(DEFAULT_SETTINGS)
    setShowSettings(false)
    setError(null)
  }

  const openNewQuizForm = () => {
    resetQuestionForm()
    setEditingQuizId(null)
    setFormData({ title: '', description: '', questions: [] })
    setSettings(DEFAULT_SETTINGS)
    setShowSettings(false)
    setShowForm(true)
  }

  const handleDuplicateQuiz = async (quiz: Quiz) => {
    try {
      setSaving(true)
      const response = await fetch(`${API_BASE_URL}/api/quizzes/${quiz.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructor_id: instructorId }),
      })
      if (!response.ok) throw new Error('Failed to duplicate quiz')
      const refreshResponse = await fetch(`${API_BASE_URL}/api/quizzes/class/${selectedClassId}`)
      if (refreshResponse.ok) setQuizzes((await refreshResponse.json()).quizzes || [])
      toast(`"${quiz.title}" duplicated as "Copy of ${quiz.title}"`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to duplicate', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openPreview = (quiz: Quiz) => {
    setPreviewQuiz(quiz)
    setPreviewIndex(0)
    setPreviewAnswers({})
    setPreviewConfirmed(new Set())
  }

  // Saves an AI-generated quiz directly to the selected class.
  const handleAIPublish = async (title: string, description: string, questions: any[], aiDueDate?: string | null) => {
    if (!instructorId) { void showAlert('Instructor ID is required'); return }
    if (!libraryMode && !selectedClassId) { void showAlert('Please select a class before generating an AI quiz'); return }
    try {
      setSaving(true)
      setError(null)
      const response = await fetch(`${API_BASE_URL}/api/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          class_id: libraryMode ? null : selectedClassId,
          title,
          description,
          questions,
          due_date: aiDueDate ? datetimeLocalToIso(aiDueDate) : null,
          ...settings,
        }),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to save quiz')
      }
      if (libraryMode) {
        setShowAIGenerator(false)
        toast('Quiz saved to your library!', 'success')
        onExit?.()
        return
      }
      const refreshResponse = await fetch(`${API_BASE_URL}/api/quizzes/class/${selectedClassId}`)
      if (refreshResponse.ok) setQuizzes((await refreshResponse.json()).quizzes || [])
      setShowAIGenerator(false)
      toast('AI quiz published successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save quiz'
      setError(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ─── AI Quiz Generator ─── */
  if (showAIGenerator && aiQuizAvailable) {
    return (
      <AIQuizGenerator
        onPublish={handleAIPublish}
        onCancel={() => setShowAIGenerator(false)}
      />
    )
  }

  if (libraryMode && loadingQuiz) {
    return (
      <div className="panel-page">
        <PanelBreadcrumbs items={libraryBreadcrumbs} />
        <PanelSkeleton variant="cards" count={2} />
      </div>
    )
  }

  /* ─── Quiz Builder Form ─── */
  if (showForm || libraryMode) {
    return (
      <div className="panel-page">
        <PanelBreadcrumbs items={libraryMode ? libraryBreadcrumbs : classBreadcrumbs} />
        <div className="panel-hero panel-hero--page">
          <p className="panel-kicker">{libraryMode ? 'Content Maker · Quiz' : 'Quiz Builder'}</p>
          <h1>{editingQuizId ? 'Edit Quiz' : 'Create New Quiz'}</h1>
          {libraryMode ? (
            <p className="panel-hero-greeting">
              Saved to your library — publish this quiz to any of your classes from Manage Class.
            </p>
          ) : selectedClassTitle ? (
            <p className="panel-hero-greeting">For class: {selectedClassTitle}</p>
          ) : null}
        </div>

        {error && <div className="panel-alert panel-alert-error">{error}</div>}

        <div className="quiz-creation__two-col">

          {/* ─── LEFT: Quiz details + Question builder ─── */}
          <div className="quiz-creation__left-col">

            {/* AI Quiz Generator — Content Maker / manual builder */}
            {aiQuizAvailable && !editingQuizId && (
              <div className="quiz-creation__ai-card panel-card">
                <div className="quiz-creation__ai-card-glow" aria-hidden="true" />
                <div className="quiz-creation__ai-card-content">
                  <div className="quiz-creation__ai-card-icon" aria-hidden="true">
                    <PanelIcon name="ai" variant="action" color="purple" />
                  </div>
                  <div className="quiz-creation__ai-card-body">
                    <p className="quiz-creation__ai-card-kicker">Powered by EduBot</p>
                    <h3 className="quiz-creation__ai-card-title">Generate Quiz with AI</h3>
                    <p className="quiz-creation__ai-card-desc">
                      Enter a topic and AI will build questions for you. Review, edit, then save to your library.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="panel-btn quiz-creation__ai-card-btn"
                    onClick={() => setShowAIGenerator(true)}
                  >
                    Open AI Quiz Generator →
                  </button>
                </div>
              </div>
            )}

            {/* Quiz Details */}
            <div className="panel-card">
              <h3 className="panel-section-title">Quiz Details</h3>
              <div className="panel-form-group">
                <label className="panel-label">Quiz Title *</label>
                <input
                  className="panel-input"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter quiz title"
                />
              </div>
              <div className="panel-form-group">
                <label className="panel-label" htmlFor="quiz-due-date">
                  Due Date <span className="quiz-creation__label-hint">(optional)</span>
                </label>
                <QuizDueDatePicker id="quiz-due-date" value={dueDate} onChange={setDueDate} />
              </div>
              <div className="panel-form-group" style={{ marginBottom: 0 }}>
                <label className="panel-label">
                  Description <span className="quiz-creation__label-hint">(optional)</span>
                </label>
                <textarea
                  className="panel-textarea"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this quiz"
                />
              </div>
            </div>

            {/* Quiz Settings */}
            <div className="panel-card quiz-settings">
              <button
                type="button"
                className="quiz-settings__toggle"
                onClick={() => setShowSettings(!showSettings)}
                aria-expanded={showSettings}
              >
                <span className="quiz-settings__toggle-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 0 0 4.93 19.07"/><path d="M4.93 4.93A10 10 0 0 1 19.07 19.07"/></svg>
                  Quiz Settings
                </span>
                <span className="quiz-settings__toggle-hint">
                  {[
                    settings.time_limit_minutes ? `${settings.time_limit_minutes} min limit` : null,
                    settings.max_attempts ? `${settings.max_attempts} attempt${settings.max_attempts > 1 ? 's' : ''}` : null,
                    settings.shuffle_questions ? 'shuffled' : null,
                  ].filter(Boolean).join(' · ') || 'defaults'}
                  <svg className={`quiz-settings__chevron${showSettings ? ' quiz-settings__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </button>
              {showSettings && (
                <div className="quiz-settings__body">
                  <div className="quiz-settings__grid">
                    <div className="panel-form-group">
                      <label className="panel-label">Time Limit <span className="quiz-creation__label-hint">(minutes, 0 = none)</span></label>
                      <input
                        className="panel-input"
                        type="number"
                        min="0"
                        max="300"
                        value={settings.time_limit_minutes ?? ''}
                        onChange={(e) => setSettings({ ...settings, time_limit_minutes: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="No limit"
                      />
                    </div>
                    <div className="panel-form-group">
                      <label className="panel-label">Max Attempts <span className="quiz-creation__label-hint">(0 = unlimited)</span></label>
                      <input
                        className="panel-input"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.max_attempts ?? ''}
                        onChange={(e) => setSettings({ ...settings, max_attempts: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="Unlimited"
                      />
                    </div>
                    <div className="panel-form-group">
                      <label className="panel-label">Show Results</label>
                      <select
                        className="panel-select"
                        value={settings.show_results_after}
                        onChange={(e) => setSettings({ ...settings, show_results_after: e.target.value as QuizSettings['show_results_after'] })}
                      >
                        <option value="immediate">Immediately after submit</option>
                        <option value="due_date">After due date passes</option>
                        <option value="never">Never (instructor reviews)</option>
                      </select>
                    </div>
                    <div className="panel-form-group">
                      <label className="panel-label">Late Submission</label>
                      <select
                        className="panel-select"
                        value={settings.allow_late_submit ? 'yes' : 'no'}
                        onChange={(e) => setSettings({ ...settings, allow_late_submit: e.target.value === 'yes' })}
                      >
                        <option value="yes">Allow (mark as late)</option>
                        <option value="no">Block after due date</option>
                      </select>
                    </div>
                  </div>
                  <div className="quiz-settings__toggles">
                    <label className="quiz-settings__check">
                      <input
                        type="checkbox"
                        checked={settings.shuffle_questions}
                        onChange={(e) => setSettings({ ...settings, shuffle_questions: e.target.checked })}
                      />
                      Shuffle question order for each student
                    </label>
                    <label className="quiz-settings__check">
                      <input
                        type="checkbox"
                        checked={settings.shuffle_options}
                        onChange={(e) => setSettings({ ...settings, shuffle_options: e.target.checked })}
                      />
                      Shuffle answer options for each student
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Question Builder */}
            <div className="panel-card" ref={builderRef}>
              <div className="quiz-creation__builder-header">
                <h3 className="panel-section-title" style={{ margin: 0 }}>
                  {editingQuestionIndex !== null
                    ? `Editing Q${editingQuestionIndex + 1}`
                    : 'Question Builder'}
                </h3>
                {editingQuestionIndex !== null && (
                  <button className="panel-btn panel-btn-secondary panel-btn-sm" type="button" onClick={resetQuestionForm}>
                    Cancel edit
                  </button>
                )}
              </div>
              {editingQuestionIndex !== null && (
                <p className="panel-meta quiz-creation__edit-hint">
                  Update the fields below, then click "Save Question".
                </p>
              )}

              {/* Question Type Toggle */}
              <div className="panel-form-group">
                <label className="panel-label">Question Type</label>
                <div className="quiz-creation__type-row">
                  {(['multiple-choice', 'true-false'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`quiz-creation__type-btn${currentQuestion.type === t ? ' quiz-creation__type-btn--active' : ''}`}
                      onClick={() => setCurrentQuestion({
                        ...currentQuestion,
                        type: t,
                        options: t === 'true-false' ? ['True', 'False'] : ['', '', '', ''],
                        correctAnswer: ''
                      })}
                    >
                      {t === 'multiple-choice' ? '🔘 Multiple Choice' : '☑️ True / False'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Text */}
              <div className="panel-form-group">
                <label className="panel-label">Question *</label>
                <textarea
                  className="panel-textarea"
                  rows={3}
                  value={currentQuestion.question}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, question: e.target.value })}
                  placeholder="Enter your question here…"
                />
              </div>

              {/* Multiple-choice: 2×2 option grid — click letter to set correct answer */}
              {currentQuestion.type === 'multiple-choice' && (
                <div className="panel-form-group">
                  <label className="panel-label">
                    Answer Options *
                    <span className="quiz-creation__label-hint">click letter = correct</span>
                  </label>
                  <div className="quiz-creation__options-grid">
                    {currentQuestion.options.map((option, index) => {
                      const letter = String.fromCharCode(65 + index)
                      const isCorrect = option.trim() !== '' && currentQuestion.correctAnswer === option
                      return (
                        <div key={index} className="quiz-creation__option-item">
                          <button
                            type="button"
                            className={`quiz-creation__option-letter${isCorrect ? ' quiz-creation__option-letter--correct' : ''}`}
                            onClick={() => { if (option.trim()) setCurrentQuestion({ ...currentQuestion, correctAnswer: option }) }}
                            title={`Mark option ${letter} as correct answer`}
                          >
                            {letter}
                          </button>
                          <input
                            className="panel-input"
                            type="text"
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...currentQuestion.options]
                              const wasCorrect = currentQuestion.correctAnswer === newOptions[index]
                              newOptions[index] = e.target.value
                              setCurrentQuestion({
                                ...currentQuestion,
                                options: newOptions,
                                correctAnswer: wasCorrect ? e.target.value : currentQuestion.correctAnswer
                              })
                            }}
                            placeholder={`Option ${letter}`}
                          />
                          {currentQuestion.options.length > 2 && (
                            <button
                              type="button"
                              className="quiz-creation__option-remove"
                              onClick={() => {
                                const newOptions = currentQuestion.options.filter((_, i) => i !== index)
                                setCurrentQuestion({
                                  ...currentQuestion,
                                  options: newOptions,
                                  correctAnswer: currentQuestion.correctAnswer === option ? '' : currentQuestion.correctAnswer
                                })
                              }}
                              aria-label={`Remove option ${letter}`}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {currentQuestion.options.length < 6 && (
                    <button
                      className="panel-btn panel-btn-secondary panel-btn-sm quiz-creation__add-option-btn"
                      type="button"
                      onClick={() => setCurrentQuestion({ ...currentQuestion, options: [...currentQuestion.options, ''] })}
                    >
                      + Add Option
                    </button>
                  )}
                  {currentQuestion.correctAnswer ? (
                    <p className="quiz-creation__answer-hint quiz-creation__answer-hint--selected">
                      ✓ Correct answer: {currentQuestion.correctAnswer}
                    </p>
                  ) : (
                    <p className="quiz-creation__answer-hint">Click a letter to mark the correct answer.</p>
                  )}
                </div>
              )}

              {/* True/False: large toggle buttons */}
              {currentQuestion.type === 'true-false' && (
                <div className="panel-form-group">
                  <label className="panel-label">Correct Answer *</label>
                  <div className="quiz-creation__tf-row">
                    {['True', 'False'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`quiz-creation__tf-btn${currentQuestion.correctAnswer === v ? ' quiz-creation__tf-btn--selected' : ''}`}
                        onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: v })}
                      >
                        {v === 'True' ? '✓ True' : '✗ False'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanation */}
              <div className="panel-form-group" style={{ marginBottom: 0 }}>
                <label className="panel-label">
                  Explanation
                  <span className="quiz-creation__label-hint">(shown after student answers)</span>
                </label>
                <textarea
                  className="panel-textarea"
                  rows={2}
                  value={currentQuestion.explanation}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, explanation: e.target.value })}
                  placeholder="Why is this the correct answer?"
                />
              </div>

              <div className="panel-row quiz-creation__builder-actions">
                <button className="panel-btn panel-btn-primary" type="button" onClick={handleAddOrUpdateQuestion}>
                  {editingQuestionIndex !== null ? '✓ Save Question' : '+ Add Question'}
                </button>
                {editingQuestionIndex !== null && (
                  <button className="panel-btn panel-btn-secondary" type="button" onClick={resetQuestionForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─── RIGHT: Question list + Save bar ─── */}
          <div className="quiz-creation__right-col">
            <div className="quiz-creation__right-card">

              <div className="quiz-creation__right-header">
                <span className="quiz-creation__right-title">Questions</span>
                <span className="quiz-creation__q-count-badge">
                  {formData.questions.length} {formData.questions.length === 1 ? 'question' : 'questions'}
                </span>
              </div>

              <div className="quiz-creation__q-list">
                {formData.questions.length === 0 ? (
                  <div className="quiz-creation__q-empty">
                    <p>No questions yet.</p>
                    <p>Add your first question using the builder.</p>
                  </div>
                ) : (
                  formData.questions.map((q, i) => (
                    <div
                      key={i}
                      className={`quiz-creation__q-row${editingQuestionIndex === i ? ' quiz-creation__q-row--editing' : ''}`}
                    >
                      <div className="quiz-creation__q-row-meta">
                        <span className="quiz-creation__q-row-num">{i + 1}</span>
                        <span className={`quiz-creation__q-row-badge quiz-creation__q-row-badge--${q.question_type === 'multiple-choice' ? 'mc' : 'tf'}`}>
                          {q.question_type === 'multiple-choice' ? 'MC' : 'TF'}
                        </span>
                      </div>
                      <div className="quiz-creation__q-row-body">
                        <p className="quiz-creation__q-row-text">{q.question_text}</p>
                        <span className="quiz-creation__q-row-answer">✓ {q.correct_answer}</span>
                      </div>
                      <div className="quiz-creation__q-row-actions">
                        <button
                          type="button"
                          className="panel-btn panel-btn-secondary panel-btn-sm"
                          onClick={() => handleStartEditQuestion(i)}
                          aria-label={`Edit question ${i + 1}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="panel-btn panel-btn-danger panel-btn-sm"
                          onClick={() => handleRemoveQuestion(i)}
                          aria-label={`Remove question ${i + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <QuizDueDateSummary value={dueDate} />

              <div className="quiz-creation__save-bar">
                <button
                  className="panel-btn panel-btn-success quiz-creation__save-bar-btn"
                  onClick={handleSaveQuiz}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : '✓ Save Quiz'}
                </button>
                <button
                  className="panel-btn panel-btn-secondary quiz-creation__save-bar-btn"
                  onClick={cancelForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    )
  }

  /* ─── Quiz List ─── */
  return (
    <div className="panel-page">
      {classBreadcrumbs.length > 0 && <PanelBreadcrumbs items={classBreadcrumbs} />}
      <div className="panel-top-row">
        <div className="panel-hero panel-hero--page quiz-creation__hero">
          <p className="panel-kicker">Instructor · Quizzes</p>
          <h1>Manage Quizzes</h1>
          <p className="panel-hero-greeting">Create and manage quizzes for each of your classes.</p>
        </div>
        <div className="panel-row quiz-creation__header-row">
          <button className="panel-btn panel-btn-primary" type="button" onClick={openNewQuizForm}>
            + New Quiz
          </button>
          {aiQuizAvailable && (
            <button
              className="panel-btn quiz-creation__ai-btn"
              type="button"
              onClick={() => setShowAIGenerator(true)}
            >
              + AI Quiz
            </button>
          )}
        </div>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      <div className="panel-card">
        <div className="panel-form-group quiz-creation__class-select-group">
          <label className="panel-label">Select Class *</label>
          <select
            className="panel-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Choose a class…</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.title}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <PanelSkeleton variant="cards" count={3} />}

      {!loading && !selectedClassId && (
        <PanelEmptyState
          icon="content"
          title="Select a Class"
          description="Choose a class above to view and create quizzes for it."
        />
      )}

      {!loading && selectedClassId && quizzes.length === 0 && (
        <PanelEmptyState
          icon="quiz"
          title="No Quizzes Yet"
          description="Create your first quiz for this class to get started."
          action={{ label: '+ Create Quiz', onClick: openNewQuizForm }}
        />
      )}

      {/* Preview Modal */}
      {previewQuiz && (
        <div className="quiz-preview-overlay" role="dialog" aria-modal="true" aria-label="Quiz preview">
          <div className="quiz-preview-modal">
            <div className="quiz-preview-header">
              <div>
                <p className="panel-kicker">Preview — Student View</p>
                <h2>{previewQuiz.title}</h2>
              </div>
              <button
                type="button"
                className="panel-btn panel-btn-secondary panel-btn-sm"
                onClick={() => setPreviewQuiz(null)}
              >
                Close Preview
              </button>
            </div>
            {(() => {
              const q = previewQuiz.questions[previewIndex]
              const opts = q.question_type === 'true-false' ? ['True', 'False'] : (q.options?.map((o: any) => o.option_text) ?? [])
              const isConfirmed = previewConfirmed.has(previewIndex)
              const answer = previewAnswers[previewIndex]
              return (
                <div className="quiz-preview-body">
                  <div className="quiz-preview-progress-bar">
                    <div className="quiz-preview-progress-fill" style={{ width: `${((previewIndex + 1) / previewQuiz.questions.length) * 100}%` }} />
                  </div>
                  <p className="quiz-preview-qnum">Question {previewIndex + 1} of {previewQuiz.questions.length}</p>
                  <p className="quiz-preview-qtext">{q.question_text}</p>
                  <div className="quiz-preview-options">
                    {opts.map((opt: string) => {
                      const isSelected = answer === opt
                      const isCorrect = isConfirmed && opt === q.correct_answer
                      const isWrong = isConfirmed && isSelected && opt !== q.correct_answer
                      return (
                        <button
                          key={opt}
                          type="button"
                          className={`quiz-preview-option${isSelected ? ' quiz-preview-option--selected' : ''}${isCorrect ? ' quiz-preview-option--correct' : ''}${isWrong ? ' quiz-preview-option--wrong' : ''}`}
                          onClick={() => !isConfirmed && setPreviewAnswers({ ...previewAnswers, [previewIndex]: opt })}
                          disabled={isConfirmed}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                  {isConfirmed && q.explanation && (
                    <div className="quiz-preview-explanation">
                      <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                  <div className="quiz-preview-nav">
                    <button
                      type="button"
                      className="panel-btn panel-btn-secondary panel-btn-sm"
                      onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                      disabled={previewIndex === 0}
                    >← Previous</button>
                    {!isConfirmed ? (
                      <button
                        type="button"
                        className="panel-btn panel-btn-primary panel-btn-sm"
                        onClick={() => answer && setPreviewConfirmed(new Set([...previewConfirmed, previewIndex]))}
                        disabled={!answer}
                      >Confirm Answer</button>
                    ) : (
                      <button
                        type="button"
                        className="panel-btn panel-btn-primary panel-btn-sm"
                        onClick={() => { if (previewIndex < previewQuiz.questions.length - 1) setPreviewIndex(previewIndex + 1) }}
                        disabled={previewIndex === previewQuiz.questions.length - 1}
                      >Next →</button>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {!loading && selectedClassId && quizzes.length > 0 && (
        <div className="panel-grid">
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="panel-class-card panel-class-card--polished panel-class-card--quiz-text">
              <h3>{quiz.title}</h3>
              <p>{quiz.description || 'No description'}</p>
              <span className="panel-meta">{quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}</span>
              {quiz.due_date && <QuizDueBadge dueDate={quiz.due_date} />}
              {(quiz.time_limit_minutes || quiz.max_attempts || quiz.shuffle_questions) && (
                <div className="quiz-creation__settings-badges">
                  {quiz.time_limit_minutes && (
                    <span className="quiz-creation__setting-tag">⏱ {quiz.time_limit_minutes}m</span>
                  )}
                  {quiz.max_attempts && (
                    <span className="quiz-creation__setting-tag">{quiz.max_attempts} attempt{quiz.max_attempts > 1 ? 's' : ''}</span>
                  )}
                  {quiz.shuffle_questions && (
                    <span className="quiz-creation__setting-tag">shuffled</span>
                  )}
                </div>
              )}
              <div className="panel-row quiz-creation__import-row">
                <button
                  className="panel-btn panel-btn-secondary panel-btn-sm quiz-creation__import-btn"
                  onClick={() => openPreview(quiz)}
                  title="Preview as student"
                >
                  Preview
                </button>
                <button
                  className="panel-btn panel-btn-secondary panel-btn-sm quiz-creation__import-btn"
                  onClick={() => handleEditQuiz(quiz)}
                >
                  Edit
                </button>
                <button
                  className="panel-btn panel-btn-secondary panel-btn-sm quiz-creation__import-btn"
                  onClick={() => handleDuplicateQuiz(quiz)}
                  disabled={saving}
                  title="Duplicate this quiz"
                >
                  Copy
                </button>
                <button
                  className="panel-btn panel-btn-danger panel-btn-sm quiz-creation__import-btn"
                  onClick={() => handleDeleteQuiz(quiz.id)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default QuizCreation
