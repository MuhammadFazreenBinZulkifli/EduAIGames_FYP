import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import QuizSearchSelect from './QuizSearchSelect'
import { ROUTES } from '../routes/paths'
import { studentStudyCoachCrumb } from '../utils/panelBreadcrumbHelpers'
import {
  loadStudyCoachSession,
  saveStudyCoachSession,
} from '../utils/studyCoachSessionStorage'
import './App_CSS/PanelBreadcrumbs_CSS.css'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/QuizSearchSelect_CSS.css'
import './App_CSS/StudentStudyCoach_CSS.css'
import './App_CSS/StudentStudyCoachHub_CSS.css'

type TabId = 'insights' | 'review' | 'practice' | 'create' | 'ask'

type QuestionFormat =
  | 'multiple-choice'
  | 'true-false'
  | 'short-answer'
  | 'essay'
  | 'fill-blank'

interface StudyInsights {
  summary: string
  strengths: string[]
  focus_areas: string[]
  recommendations: string[]
  encouragement: string
}

interface Mistake {
  quiz_id: number
  quiz_title: string
  question_index: number
  question_text: string
  question_type: string
  student_answer: string
  correct_answer: string
  explanation?: string
  options?: string[]
}

interface MistakeExplanation {
  explanation: string
  why_wrong: string
  memory_tip: string
}

interface GeneratedQuestion {
  format: QuestionFormat
  question_text: string
  options?: string[]
  correct_answer?: string
  model_answer?: string
  rubric_points?: string[]
  explanation?: string
}

interface GeneratedSet {
  topic: string
  format: QuestionFormat
  difficulty: string
  questions: GeneratedQuestion[]
}

interface JoinedClass {
  id: number
  title: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'insights', label: 'Insights', hint: 'Performance overview' },
  { id: 'review', label: 'Review', hint: 'Explain mistakes' },
  { id: 'practice', label: 'Practice', hint: 'Drill weak areas' },
  { id: 'create', label: 'Create', hint: 'AI question maker' },
  { id: 'ask', label: 'Ask Coach', hint: 'Study chat' },
]

const FORMAT_OPTIONS: { value: QuestionFormat; label: string }[] = [
  { value: 'multiple-choice', label: 'Quiz (multiple choice)' },
  { value: 'true-false', label: 'True / False' },
  { value: 'short-answer', label: 'Short answer' },
  { value: 'essay', label: 'Essay' },
  { value: 'fill-blank', label: 'Fill in the blank' },
]

interface StudentStudyCoachHubProps {
  studentId: number
}

async function postJson<T>(path: string, studentId: number, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(studentId),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}

export default function StudentStudyCoachHub({ studentId }: StudentStudyCoachHubProps) {
  const navigate = useNavigate()
  const { features } = usePlatformFeatures()

  // Restore persisted session on first mount (clears automatically on logout via AuthContext).
  const _stored = useMemo(() => loadStudyCoachSession(studentId), [studentId])

  const [classes, setClasses] = useState<JoinedClass[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [classId, setClassId] = useState<number | ''>(_stored?.classId ?? '')
  const [tab, setTab] = useState<TabId>((_stored?.tab as TabId) ?? 'insights')

  // Insights
  const [insights, setInsights] = useState<StudyInsights | null>((_stored?.insights as StudyInsights | null) ?? null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [insightsEmpty, setInsightsEmpty] = useState(_stored?.insightsEmpty ?? '')

  // Review
  const [mistakes, setMistakes] = useState<Mistake[]>((_stored?.mistakes as Mistake[]) ?? [])
  const [mistakesLoading, setMistakesLoading] = useState(false)
  const [mistakesError, setMistakesError] = useState('')
  const [explainIdx, setExplainIdx] = useState<number | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [explanations, setExplanations] = useState<Record<string, MistakeExplanation>>(
    (_stored?.explanations as Record<string, MistakeExplanation>) ?? {}
  )

  // Practice
  const [practiceSet, setPracticeSet] = useState<GeneratedSet | null>((_stored?.practiceSet as GeneratedSet | null) ?? null)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceError, setPracticeError] = useState('')
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>(
    (_stored?.practiceAnswers as Record<number, string>) ?? {}
  )
  const [practiceRevealed, setPracticeRevealed] = useState<Set<number>>(
    new Set((_stored?.practiceRevealed as number[]) ?? [])
  )

  // Create
  const [createTopic, setCreateTopic] = useState(_stored?.createTopic ?? '')
  const [createFormat, setCreateFormat] = useState<QuestionFormat>((_stored?.createFormat as QuestionFormat) ?? 'multiple-choice')
  const [createCount, setCreateCount] = useState(_stored?.createCount ?? 5)
  const [createDifficulty, setCreateDifficulty] = useState<'easy' | 'normal' | 'hard'>((_stored?.createDifficulty as 'easy' | 'normal' | 'hard') ?? 'normal')
  const [createSet, setCreateSet] = useState<GeneratedSet | null>((_stored?.createSet as GeneratedSet | null) ?? null)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createRevealed, setCreateRevealed] = useState<Set<number>>(
    new Set((_stored?.createRevealed as number[]) ?? [])
  )

  // Ask
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>((_stored?.chatMessages as ChatMsg[]) ?? [])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const selectedClassTitle = useMemo(
    () => classes.find((c) => c.id === classId)?.title ?? '',
    [classes, classId]
  )

  const classSearchOptions = useMemo(
    () => classes.map((c) => ({ id: c.id, title: c.title })),
    [classes]
  )

  const handleClassChange = useCallback((idString: string) => {
    setClassId(idString ? Number(idString) : '')
    setInsights(null)
    setInsightsEmpty('')
    setMistakes([])
    setExplanations({})
    setPracticeSet(null)
    setPracticeAnswers({})
    setPracticeRevealed(new Set())
    setCreateSet(null)
    setCreateRevealed(new Set())
  }, [])

  const classBody = useMemo(
    () => ({
      student_id: studentId,
      ...(classId !== '' ? { class_id: classId } : {}),
    }),
    [studentId, classId]
  )

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingClasses(true)
        const res = await fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`)
        const data = await res.json()
        const list: JoinedClass[] = data.classes || []
        setClasses(list)
      } catch {
        setClasses([])
      } finally {
        setLoadingClasses(false)
      }
    }
    void load()
  }, [studentId])

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true)
    setInsightsError('')
    setInsightsEmpty('')
    try {
      const payload = await postJson<{ insights?: StudyInsights | null; message?: string }>(
        '/api/chat/study-coach',
        studentId,
        classBody
      )
      if (!payload.insights) {
        setInsights(null)
        setInsightsEmpty(payload.message || 'Complete a quiz to unlock insights.')
      } else {
        setInsights(payload.insights)
      }
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : 'Could not load insights.')
    } finally {
      setInsightsLoading(false)
    }
  }, [studentId, classBody])

  const fetchMistakes = useCallback(async () => {
    setMistakesLoading(true)
    setMistakesError('')
    try {
      const payload = await postJson<{ mistakes: Mistake[] }>(
        '/api/chat/study-coach/mistakes',
        studentId,
        classBody
      )
      setMistakes(payload.mistakes || [])
    } catch (e) {
      setMistakesError(e instanceof Error ? e.message : 'Could not load mistakes.')
      setMistakes([])
    } finally {
      setMistakesLoading(false)
    }
  }, [studentId, classBody])

  useEffect(() => {
    if (!features.openai_enabled) return
    if (tab === 'insights' && !insights && !insightsLoading) void fetchInsights()
    if (tab === 'review' && mistakes.length === 0 && !mistakesLoading) void fetchMistakes()
  }, [tab, features.openai_enabled, classId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Persist all generated content to localStorage so it survives navigation.
  // Cleared on logout via AuthContext -> clearStudyCoachSession.
  useEffect(() => {
    saveStudyCoachSession(studentId, {
      classId,
      tab,
      insights,
      insightsEmpty,
      mistakes,
      explanations,
      practiceSet,
      practiceAnswers,
      practiceRevealed: Array.from(practiceRevealed),
      createTopic,
      createFormat,
      createCount,
      createDifficulty,
      createSet,
      createRevealed: Array.from(createRevealed),
      chatMessages,
    })
  }, [
    studentId,
    classId,
    tab,
    insights,
    insightsEmpty,
    mistakes,
    explanations,
    practiceSet,
    practiceAnswers,
    practiceRevealed,
    createTopic,
    createFormat,
    createCount,
    createDifficulty,
    createSet,
    createRevealed,
    chatMessages,
  ])

  const explainMistake = async (m: Mistake, idx: number) => {
    const key = `${m.quiz_id}-${m.question_index}`
    if (explanations[key]) {
      setExplainIdx(explainIdx === idx ? null : idx)
      return
    }
    setExplainIdx(idx)
    setExplainLoading(true)
    try {
      const result = await postJson<MistakeExplanation>('/api/chat/study-coach/explain', studentId, {
        question_text: m.question_text,
        question_type: m.question_type,
        student_answer: m.student_answer,
        correct_answer: m.correct_answer,
        options: m.options,
        explanation: m.explanation,
      })
      setExplanations((prev) => ({ ...prev, [key]: result }))
    } catch (e) {
      setMistakesError(e instanceof Error ? e.message : 'Could not explain this question.')
    } finally {
      setExplainLoading(false)
    }
  }

  const runPractice = async () => {
    setPracticeLoading(true)
    setPracticeError('')
    setPracticeSet(null)
    setPracticeAnswers({})
    setPracticeRevealed(new Set())
    try {
      const set = await postJson<GeneratedSet>('/api/chat/study-coach/practice', studentId, {
        ...classBody,
        count: 5,
      })
      setPracticeSet(set)
    } catch (e) {
      setPracticeError(e instanceof Error ? e.message : 'Could not generate practice.')
    } finally {
      setPracticeLoading(false)
    }
  }

  const runCreate = async () => {
    if (!createTopic.trim()) {
      setCreateError('Enter a topic first.')
      return
    }
    setCreateLoading(true)
    setCreateError('')
    setCreateSet(null)
    setCreateRevealed(new Set())
    try {
      const set = await postJson<GeneratedSet>('/api/chat/study-coach/create', studentId, {
        topic: createTopic.trim(),
        format: createFormat,
        count: createCount,
        difficulty: createDifficulty,
        student_id: studentId,
        ...(classId !== '' ? { class_id: classId } : {}),
      })
      setCreateSet(set)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create questions.')
    } finally {
      setCreateLoading(false)
    }
  }

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text }
    const next = [...chatMessages, userMsg]
    setChatMessages(next)
    setChatInput('')
    setChatLoading(true)
    setChatError('')
    try {
      const payload = await postJson<{ reply: string }>('/api/chat/study-coach/ask', studentId, {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        student_id: studentId,
        ...(classId !== '' ? { class_id: classId } : {}),
      })
      setChatMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: payload.reply || 'No response.' },
      ])
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Coach is unavailable.')
    } finally {
      setChatLoading(false)
    }
  }

  const toggleReveal = (idx: number, mode: 'practice' | 'create') => {
    const setter = mode === 'practice' ? setPracticeRevealed : setCreateRevealed
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const renderQuestionCard = (
    q: GeneratedQuestion,
    idx: number,
    mode: 'practice' | 'create',
    revealed: Set<number>
  ) => {
    const isMcq = q.format === 'multiple-choice' || q.format === 'true-false'
    const options =
      q.format === 'true-false'
        ? ['True', 'False']
        : q.options || []

    return (
      <div key={idx} className="coach-hub__qcard">
        <p className="coach-hub__qnum">Question {idx + 1}</p>
        <p className="coach-hub__qtext">{q.question_text}</p>

        {isMcq && options.length > 0 && mode === 'practice' && (
          <div className="coach-hub__options">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`coach-hub__opt${practiceAnswers[idx] === opt ? ' coach-hub__opt--picked' : ''}`}
                onClick={() => setPracticeAnswers((p) => ({ ...p, [idx]: opt }))}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {isMcq && mode === 'create' && options.length > 0 && (
          <ul className="coach-hub__opt-list">
            {options.map((opt) => (
              <li key={opt}>{opt}</li>
            ))}
          </ul>
        )}

        {q.format === 'essay' && q.rubric_points && q.rubric_points.length > 0 && (
          <div className="coach-hub__rubric">
            <p className="coach-hub__rubric-title">Rubric points</p>
            <ul>
              {q.rubric_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="panel-btn panel-btn-secondary panel-btn-sm coach-hub__reveal-btn"
          onClick={() => toggleReveal(idx, mode)}
        >
          {revealed.has(idx) ? 'Hide answer' : 'Show answer'}
        </button>

        {revealed.has(idx) && (
          <div className="coach-hub__answer">
            {q.correct_answer && (
              <p><strong>Answer:</strong> {q.correct_answer}</p>
            )}
            {q.model_answer && (
              <p><strong>Model answer:</strong> {q.model_answer}</p>
            )}
            {q.explanation && (
              <p className="coach-hub__explain">{q.explanation}</p>
            )}
            {mode === 'practice' && practiceAnswers[idx] && q.correct_answer && (
              <p className={
                practiceAnswers[idx].trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
                  ? 'coach-hub__verdict coach-hub__verdict--ok'
                  : 'coach-hub__verdict coach-hub__verdict--miss'
              }>
                {practiceAnswers[idx].trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
                  ? 'Correct!'
                  : `You chose: ${practiceAnswers[idx]}`}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!features.openai_enabled) {
    return (
      <div className="panel-page student-study-coach-page">
        <PanelBreadcrumbs items={studentStudyCoachCrumb()} />
        <PanelEmptyState
          icon="ai"
          title="AI Study Coach unavailable"
          description="OpenAI features are turned off for your institution. Ask your administrator to enable them."
        />
      </div>
    )
  }

  return (
    <div className="panel-page coach-hub student-study-coach-page">
      <PanelBreadcrumbs items={studentStudyCoachCrumb()} />

      <div className="panel-hero panel-hero--page coach-hub__hero">
        <p className="panel-kicker">Student · Learning</p>
        <h1>AI Study Coach</h1>
        <p className="panel-hero-greeting">
          Personalized insights, mistake review, practice drills, and AI-generated questions for any topic.
        </p>
      </div>

      <div className="coach-hub__toolbar panel-card">
        <label className="panel-label coach-hub__class-label" htmlFor="coach-class-search">
          Focus class
        </label>
        <div className="coach-hub__class-search" id="coach-class-search">
          <QuizSearchSelect
            options={classSearchOptions}
            value={classId === '' ? '' : String(classId)}
            onChange={handleClassChange}
            placeholder={loadingClasses ? 'Loading your classes…' : 'All enrolled classes — type to search…'}
            emptyText="No matching classes"
            ariaLabel="Search enrolled classes to focus coaching"
            optionIcon="classes"
          />
        </div>
        {selectedClassTitle ? (
          <p className="panel-meta coach-hub__class-meta">
            Coaching scoped to <strong>{selectedClassTitle}</strong>
          </p>
        ) : (
          <p className="panel-meta coach-hub__class-meta">
            Showing data from all enrolled classes. Search above to focus on one class.
          </p>
        )}
      </div>

      <div className="coach-hub__tabs" role="tablist" aria-label="Study Coach sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`coach-hub__tab${tab === t.id ? ' coach-hub__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="coach-hub__tab-label">{t.label}</span>
            <span className="coach-hub__tab-hint">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className="coach-hub__panel" role="tabpanel">
        {tab === 'insights' && (
          <section className="study-coach coach-hub__section">
            <div className="study-coach__head">
              <div className="study-coach__head-text">
                <span className="study-coach__badge" aria-hidden="true">AI</span>
                <div>
                  <h2 className="study-coach__title">Performance insights</h2>
                  <p className="study-coach__subtitle">
                    Strengths, focus areas, and next steps from your quiz results.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="panel-btn panel-btn-primary panel-btn-sm study-coach__btn"
                onClick={() => void fetchInsights()}
                disabled={insightsLoading}
              >
                {insightsLoading ? 'Analyzing…' : '↻ Refresh'}
              </button>
            </div>

            {insightsError && <p className="study-coach__error" role="alert">{insightsError}</p>}
            {insightsEmpty && !insightsLoading && (
              <PanelEmptyState
                icon="quiz"
                title="No insights yet"
                description={insightsEmpty}
                action={{ label: 'Take a quiz', onClick: () => navigate(ROUTES.student.quiz) }}
              />
            )}
            {insightsLoading && (
              <div className="coach-gen-loader" aria-live="polite" aria-label="Analyzing performance">
                <div className="coach-gen-loader__bar"><div className="coach-gen-loader__fill" /></div>
                <span className="coach-gen-loader__label">Reviewing your performance…</span>
              </div>
            )}
            {!insightsLoading && insights && (
              <div className="study-coach__result">
                <p className="study-coach__summary">{insights.summary}</p>
                <div className="study-coach__grid">
                  {insights.strengths.length > 0 && (
                    <div className="study-coach__col study-coach__col--strength">
                      <h4>Strengths</h4>
                      <ul>{insights.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                  {insights.focus_areas.length > 0 && (
                    <div className="study-coach__col study-coach__col--focus">
                      <h4>Focus areas</h4>
                      <ul>{insights.focus_areas.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
                {insights.recommendations.length > 0 && (
                  <div className="study-coach__reco">
                    <h4>Recommended next steps</h4>
                    <ul>{insights.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
                {insights.encouragement && (
                  <p className="study-coach__encourage">{insights.encouragement}</p>
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'review' && (
          <section className="coach-hub__section">
            <div className="coach-hub__section-head">
              <h2>Review mistakes</h2>
              <p className="panel-meta">AI explanations for questions you got wrong on recent quizzes.</p>
              <button
                type="button"
                className="panel-btn panel-btn-secondary panel-btn-sm"
                onClick={() => void fetchMistakes()}
                disabled={mistakesLoading}
              >
                {mistakesLoading ? 'Loading…' : '↻ Reload'}
              </button>
            </div>

            {mistakesError && <p className="study-coach__error">{mistakesError}</p>}
            {mistakesLoading && (
              <div className="coach-gen-loader" aria-live="polite" aria-label="Loading mistakes">
                <div className="coach-gen-loader__bar"><div className="coach-gen-loader__fill" /></div>
                <span className="coach-gen-loader__label">Loading your recent mistakes…</span>
              </div>
            )}
            {!mistakesLoading && mistakes.length === 0 && !mistakesError && (
              <PanelEmptyState
                icon="check"
                title="No mistakes to review"
                description="Great work! Complete more quizzes or pick a different class to see items here."
              />
            )}
            <div className="coach-hub__mistake-list">
              {mistakes.map((m, idx) => {
                const key = `${m.quiz_id}-${m.question_index}`
                const exp = explanations[key]
                return (
                  <div key={key} className="coach-hub__mistake">
                    <p className="coach-hub__mistake-quiz">{m.quiz_title}</p>
                    <p className="coach-hub__qtext">{m.question_text}</p>
                    <p className="panel-meta">
                      Your answer: <strong className="coach-hub__wrong">{m.student_answer}</strong>
                      {' · '}
                      Correct: <strong className="coach-hub__right">{m.correct_answer}</strong>
                    </p>
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary panel-btn-sm"
                      onClick={() => void explainMistake(m, idx)}
                      disabled={explainLoading && explainIdx === idx}
                    >
                      {exp ? 'Toggle explanation' : 'Explain with AI'}
                    </button>
                    {explainLoading && explainIdx === idx && (
                      <div className="coach-gen-loader" aria-live="polite" aria-label="Generating explanation">
                        <div className="coach-gen-loader__bar"><div className="coach-gen-loader__fill" /></div>
                        <span className="coach-gen-loader__label">Getting AI explanation…</span>
                      </div>
                    )}
                    {explainIdx === idx && exp && (
                      <div className="coach-hub__ai-explain">
                        <p>{exp.explanation}</p>
                        <p><strong>Why yours was off:</strong> {exp.why_wrong}</p>
                        <p className="coach-hub__tip"><strong>Tip:</strong> {exp.memory_tip}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'practice' && (
          <section className="coach-hub__section">
            <div className="coach-hub__section-head">
              <h2>Practice drill</h2>
              <p className="panel-meta">
                AI builds multiple-choice questions from your weak areas and recent mistakes.
              </p>
              <button
                type="button"
                className="panel-btn panel-btn-success"
                onClick={() => void runPractice()}
                disabled={practiceLoading}
              >
                {practiceLoading ? 'Generating…' : 'Generate practice set'}
              </button>
            </div>
            {practiceLoading && (
              <div className="coach-gen-loader" aria-live="polite" aria-label="Generating practice">
                <div className="coach-gen-loader__bar"><div className="coach-gen-loader__fill" /></div>
                <span className="coach-gen-loader__label">Building your practice set…</span>
              </div>
            )}
            {practiceError && <p className="study-coach__error">{practiceError}</p>}
            {!practiceLoading && practiceSet && (
              <div className="coach-hub__qlist">
                <p className="panel-meta coach-hub__set-meta">
                  {practiceSet.questions.length} questions · {practiceSet.difficulty} difficulty
                </p>
                {practiceSet.questions.map((q, i) =>
                  renderQuestionCard(q, i, 'practice', practiceRevealed)
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'create' && (
          <section className="coach-hub__section">
            <div className="coach-hub__section-head">
              <h2>Create questions</h2>
              <p className="panel-meta">
                Ask AI to build quiz, essay, short-answer, true/false, or fill-in-the-blank items on any topic.
              </p>
            </div>

            <div className="coach-hub__create-form panel-card">
              <div className="panel-form-group">
                <label className="panel-label" htmlFor="coach-topic">Topic</label>
                <input
                  id="coach-topic"
                  className="panel-input"
                  value={createTopic}
                  onChange={(e) => setCreateTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, SQL joins, World War 2 causes"
                />
              </div>
              <div className="coach-hub__create-row">
                <div className="panel-form-group coach-hub__create-field">
                  <label className="panel-label" htmlFor="coach-format">Format</label>
                  <select
                    id="coach-format"
                    className="panel-select"
                    value={createFormat}
                    onChange={(e) => setCreateFormat(e.target.value as QuestionFormat)}
                  >
                    {FORMAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="panel-form-group coach-hub__create-field">
                  <label className="panel-label" htmlFor="coach-count">Count</label>
                  <select
                    id="coach-count"
                    className="panel-select"
                    value={createCount}
                    onChange={(e) => setCreateCount(Number(e.target.value))}
                  >
                    {[3, 5, 7, 10].map((n) => (
                      <option key={n} value={n}>{n} questions</option>
                    ))}
                  </select>
                </div>
                <div className="panel-form-group coach-hub__create-field">
                  <label className="panel-label" htmlFor="coach-diff">Difficulty</label>
                  <select
                    id="coach-diff"
                    className="panel-select"
                    value={createDifficulty}
                    onChange={(e) => setCreateDifficulty(e.target.value as 'easy' | 'normal' | 'hard')}
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="panel-btn panel-btn-primary coach-hub__create-btn"
                onClick={() => void runCreate()}
                disabled={createLoading}
              >
                {createLoading ? 'Creating…' : 'Create with AI'}
              </button>
            </div>

            {createLoading && (
              <div className="coach-gen-loader" aria-live="polite" aria-label="Creating questions">
                <div className="coach-gen-loader__bar"><div className="coach-gen-loader__fill" /></div>
                <span className="coach-gen-loader__label">Creating your questions…</span>
              </div>
            )}
            {createError && <p className="study-coach__error">{createError}</p>}
            {!createLoading && createSet && (
              <div className="coach-hub__qlist">
                <p className="panel-meta coach-hub__set-meta">
                  {createSet.topic} · {FORMAT_OPTIONS.find((f) => f.value === createSet.format)?.label} · {createSet.difficulty}
                </p>
                {createSet.questions.map((q, i) =>
                  renderQuestionCard(q, i, 'create', createRevealed)
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'ask' && (
          <section className="coach-hub__section coach-hub__ask">
            <div className="coach-hub__section-head">
              <h2>Ask your coach</h2>
              <p className="panel-meta">
                Focused study chat using your classes and recent performance. For website help, use EduBot.
              </p>
            </div>

            <div className="coach-hub__chat-panel">
              <div className="coach-hub__chat">
                {chatMessages.length === 0 && (
                  <div className="coach-hub__chat-empty">
                    <p className="coach-hub__chat-empty-title">Start a study conversation</p>
                    <p className="coach-hub__chat-empty-hint">
                      Try: &quot;How should I revise for my weakest quiz?&quot; or &quot;Explain mitosis in simple terms.&quot;
                    </p>
                  </div>
                )}
                {chatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`coach-hub__chat-row coach-hub__chat-row--${m.role}`}
                  >
                    <span className="coach-hub__chat-role">
                      {m.role === 'user' ? 'You' : 'Coach'}
                    </span>
                    <div className={`coach-hub__chat-bubble coach-hub__chat-bubble--${m.role}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="coach-hub__chat-row coach-hub__chat-row--assistant">
                    <span className="coach-hub__chat-role">Coach</span>
                    <div className="coach-hub__chat-bubble coach-hub__chat-bubble--assistant coach-hub__chat-typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="coach-hub__chat-composer">
                {chatError && <p className="study-coach__error coach-hub__chat-error">{chatError}</p>}
                <div className="coach-hub__chat-input-row">
                  <textarea
                    className="panel-textarea coach-hub__chat-input"
                    rows={2}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a study question…"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void sendChat()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="panel-btn panel-btn-primary coach-hub__chat-send"
                    onClick={() => void sendChat()}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {classes.length === 0 && !loadingClasses && (
        <PanelEmptyState
          icon="join"
          title="Join a class to get started"
          description="Study Coach works best when you are enrolled in at least one class."
          action={{ label: 'Join a class', onClick: () => navigate(ROUTES.student.join) }}
        />
      )}
    </div>
  )
}
