import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import PanelSkeleton from './PanelSkeleton'
import UserAvatar from './UserAvatar'
import { ROUTES } from '../routes/paths'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import {
  aggregateGrades,
  type AttemptMode,
  type PerformanceGrade,
  type PublishedQuizMeta,
} from '../utils/studentPerformanceUtils'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentPerformance_CSS.css'

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface QuizQuestion {
  id?: number
  question_text: string
  question_type: string
  correct_answer: string
  question_order: number
  options?: Array<{ option_text: string }>
}

interface InstructorClass {
  id: number
  title: string
}

interface ClassMember {
  id: number
  username: string
  avatar_url?: string | null
}

interface QuizOverviewRow {
  quizId: number
  quizTitle: string
  attempted: number
  notAttempted: number
  completionPct: number
  classAverage: number | null
}

interface StudentPerformanceProps {
  instructorId?: number
}

function StudentPerformance({ instructorId }: StudentPerformanceProps) {
  const navigate = useNavigate()
  const { toast } = usePanelUI()
  const [rawGrades, setRawGrades] = useState<PerformanceGrade[]>([])
  const [publishedQuizzes, setPublishedQuizzes] = useState<PublishedQuizMeta[]>([])
  const [classes, setClasses] = useState<InstructorClass[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [classMembers, setClassMembers] = useState<ClassMember[]>([])
  const [attemptMode, setAttemptMode] = useState<AttemptMode>('latest')
  const [studentSearch, setStudentSearch] = useState('')
  const [analyticsModalQuizId, setAnalyticsModalQuizId] = useState<number | null>(null)
  const [analyticsQuiz, setAnalyticsQuiz] = useState<{ questions: QuizQuestion[] } | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [missingModalQuizId, setMissingModalQuizId] = useState<number | null>(null)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportQuizId, setExportQuizId] = useState<number | null>(null)
  const [reminding, setReminding] = useState(false)
  const [expandedAttemptKey, setExpandedAttemptKey] = useState<string | null>(null)
  const [attemptQuizCache, setAttemptQuizCache] = useState<Record<number, QuizQuestion[]>>({})

  useEffect(() => {
    const fetchInstructorClasses = async () => {
      if (!instructorId) {
        setError('Instructor ID is required')
        setLoadingClasses(false)
        return
      }
      try {
        setLoadingClasses(true)
        setError(null)
        const response = await fetch(`${API_BASE_URL}/api/classes/instructor/${instructorId}`)
        if (!response.ok) throw new Error('Failed to fetch classes')
        const data = await response.json()
        setClasses(data.classes || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoadingClasses(false)
      }
    }
    fetchInstructorClasses()
  }, [instructorId])

  useEffect(() => {
    const toNumber = (value: unknown): number => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    const fetchClassPerformance = async () => {
      if (!selectedClassId || !instructorId) {
        setRawGrades([])
        setPublishedQuizzes([])
        setClassMembers([])
        setSelectedStudentId(null)
        return
      }

      try {
        setLoadingGrades(true)
        setError(null)

        const [membersRes, performanceRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/classes/${selectedClassId}/members`),
          fetch(
            `${API_BASE_URL}/api/quizzes/performance/instructor/${instructorId}/class/${selectedClassId}`
          ),
        ])

        if (membersRes.ok) {
          const membersData = await membersRes.json()
          setClassMembers(membersData.members || [])
        } else {
          setClassMembers([])
        }

        if (!performanceRes.ok) {
          const errData = await performanceRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to fetch class performance')
        }

        const data = await performanceRes.json()
        setRawGrades(
          (data.grades || []).map((grade: PerformanceGrade) => ({
            ...grade,
            quiz_id: grade.quiz_id != null ? Number(grade.quiz_id) : undefined,
            score: toNumber(grade.score),
            correct_answers: toNumber(grade.correct_answers),
            total_questions: toNumber(grade.total_questions),
          }))
        )
        setPublishedQuizzes(
          (data.publishedQuizzes || []).map((quiz: PublishedQuizMeta) => ({
            id: Number(quiz.id),
            title: quiz.title,
            max_attempts: quiz.max_attempts ?? null,
          }))
        )
        setSelectedStudentId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoadingGrades(false)
      }
    }
    fetchClassPerformance()
  }, [selectedClassId, instructorId])

  useEffect(() => {
    if (!analyticsModalQuizId || !instructorId) {
      setAnalyticsQuiz(null)
      return
    }
    const fetch_ = async () => {
      setLoadingAnalytics(true)
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/quizzes/${analyticsModalQuizId}?instructor_id=${instructorId}`
        )
        if (!res.ok) throw new Error('Failed to load quiz')
        const data = await res.json()
        setAnalyticsQuiz(data.quiz)
      } catch {
        setAnalyticsQuiz(null)
      } finally {
        setLoadingAnalytics(false)
      }
    }
    void fetch_()
  }, [analyticsModalQuizId, instructorId])

  const closeModals = useCallback(() => {
    setAnalyticsModalQuizId(null)
    setMissingModalQuizId(null)
    setExportModalOpen(false)
  }, [])

  useEffect(() => {
    const modalOpen = analyticsModalQuizId != null || missingModalQuizId != null || exportModalOpen
    if (!modalOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModals()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [analyticsModalQuizId, missingModalQuizId, exportModalOpen, closeModals])

  useEffect(() => {
    setAnalyticsModalQuizId(null)
    setAnalyticsQuiz(null)
    setMissingModalQuizId(null)
    setExportModalOpen(false)
    setExportQuizId(null)
    setStudentSearch('')
    setExpandedAttemptKey(null)
  }, [selectedClassId])

  const overviewGrades = useMemo(() => aggregateGrades(rawGrades, 'latest'), [rawGrades])
  const displayGrades = useMemo(
    () => aggregateGrades(rawGrades, attemptMode),
    [rawGrades, attemptMode]
  )

  const studentMap = useMemo(() => {
    const map = new Map<number, PerformanceGrade[]>()
    displayGrades.forEach((grade) => {
      if (!map.has(grade.student_id)) map.set(grade.student_id, [])
      map.get(grade.student_id)!.push(grade)
    })
    return map
  }, [displayGrades])

  const students = useMemo(() => {
    const list = classMembers.map((member) => ({
      username: member.username,
      student_id: member.id,
      grades: studentMap.get(member.id) || [],
    }))
    const query = studentSearch.trim().toLowerCase()
    const filtered = query
      ? list.filter((s) => s.username.toLowerCase().includes(query))
      : list
    return filtered.sort((a, b) => {
      if (a.grades.length !== b.grades.length) return b.grades.length - a.grades.length
      return a.username.localeCompare(b.username)
    })
  }, [classMembers, studentMap, studentSearch])

  const selectedStudent = students.find((s) => s.student_id === selectedStudentId) || null
  const selectedClass = classes.find((c) => c.id === selectedClassId) || null
  const isLoading = loadingClasses || loadingGrades

  const avatarByStudentId = useMemo(() => {
    const map = new Map<number, string | null>()
    classMembers.forEach((m) => map.set(m.id, m.avatar_url ?? null))
    return map
  }, [classMembers])

  const quizOverview = useMemo((): QuizOverviewRow[] => {
    if (!selectedClassId || publishedQuizzes.length === 0) return []

    const memberCount = classMembers.length
    return publishedQuizzes.map((quiz) => {
      const quizGrades = overviewGrades.filter((g) => g.quiz_id === quiz.id)
      const attemptedStudentIds = new Set(quizGrades.map((g) => g.student_id))
      const scores = quizGrades.map((g) => g.score).filter(Number.isFinite)
      const classAverage =
        scores.length > 0 ? scores.reduce((sum, v) => sum + v, 0) / scores.length : null
      const notAttempted = Math.max(0, memberCount - attemptedStudentIds.size)
      const completionPct =
        memberCount > 0 ? Math.round((attemptedStudentIds.size / memberCount) * 100) : 0

      return {
        quizId: quiz.id,
        quizTitle: quiz.title,
        attempted: attemptedStudentIds.size,
        notAttempted,
        completionPct,
        classAverage,
      }
    })
  }, [selectedClassId, publishedQuizzes, classMembers, overviewGrades])

  const getNotSubmitted = (quizId: number): ClassMember[] => {
    const submittedIds = new Set(
      overviewGrades.filter((g) => g.quiz_id === quizId).map((g) => g.student_id)
    )
    return classMembers.filter((m) => !submittedIds.has(m.id))
  }

  const questionAnalytics = useMemo(() => {
    if (!analyticsQuiz || !analyticsModalQuizId) return []
    const quizGrades = overviewGrades.filter((g) => g.quiz_id === analyticsModalQuizId)
    return analyticsQuiz.questions.map((q, idx) => {
      const correctCount = quizGrades.filter((g) => {
        const resp = g.responses ?? {}
        return resp[String(idx)] === q.correct_answer
      }).length
      const total = quizGrades.length
      const rate = total > 0 ? (correctCount / total) * 100 : null
      return { question_text: q.question_text, correct_answer: q.correct_answer, correctCount, total, rate }
    })
  }, [analyticsQuiz, analyticsModalQuizId, overviewGrades])

  const openExportModal = () => {
    const firstWithData = publishedQuizzes.find((q) =>
      displayGrades.some((g) => g.quiz_id === q.id)
    )
    setExportQuizId(firstWithData?.id ?? publishedQuizzes[0]?.id ?? null)
    setExportModalOpen(true)
  }

  const handleExportQuizCsv = () => {
    if (!selectedClass || exportQuizId == null) return
    const quiz = publishedQuizzes.find((q) => q.id === exportQuizId)
    if (!quiz) return

    const grades = displayGrades.filter((g) => g.quiz_id === exportQuizId)
    const header = ['Student', 'Quiz', 'Score (%)', 'Correct', 'Total', 'Date', 'Time']
    const rows: string[][] = [header]
    grades.forEach((g) => {
      const dt = new Date(g.completed_at)
      rows.push([
        g.username,
        g.quiz_title,
        g.score.toFixed(1),
        String(g.correct_answers),
        String(g.total_questions),
        dt.toLocaleDateString(),
        dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ])
    })
    const safeTitle = quiz.title.replace(/\s+/g, '_').replace(/[^\w-]/g, '')
    downloadCsv(`${selectedClass.title.replace(/\s+/g, '_')}_${safeTitle}_grades.csv`, rows)
    setExportModalOpen(false)
    toast(`Exported ${grades.length} row${grades.length !== 1 ? 's' : ''} for "${quiz.title}".`, 'success')
  }

  const getScoreClass = (s: number) => {
    if (s >= 90) return 'score-a'
    if (s >= 80) return 'score-b'
    if (s >= 70) return 'score-c'
    if (s >= 60) return 'score-d'
    return 'score-f'
  }

  const getScorePillClass = (s: number) => {
    if (s >= 80) return 'student-performance__score-pill--green'
    if (s >= 60) return 'student-performance__score-pill--orange'
    return 'student-performance__score-pill--red'
  }

  const handleSendReminders = async (quizId: number, quizTitle: string, studentIds: number[]) => {
    if (!instructorId || !selectedClassId || studentIds.length === 0) return
    setReminding(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/quizzes/performance/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          class_id: selectedClassId,
          quiz_id: quizId,
          student_ids: studentIds,
          quiz_title: quizTitle,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send reminders')
      }
      const data = await res.json()
      const count = Number(data.sentCount) || studentIds.length
      toast(
        count === 1 ? 'Student has been notified.' : `${count} students have been notified.`,
        'success'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminders')
    } finally {
      setReminding(false)
    }
  }

  const loadAttemptQuestions = async (quizId: number) => {
    if (attemptQuizCache[quizId] || !instructorId) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/quizzes/${quizId}?instructor_id=${instructorId}`)
      if (!res.ok) return
      const data = await res.json()
      setAttemptQuizCache((prev) => ({
        ...prev,
        [quizId]: data.quiz?.questions || [],
      }))
    } catch {
      /* ignore */
    }
  }

  const toggleAttemptDetails = async (grade: PerformanceGrade) => {
    const key = `${grade.attempt_id ?? grade.completed_at}-${grade.quiz_id}`
    if (expandedAttemptKey === key) {
      setExpandedAttemptKey(null)
      return
    }
    if (grade.quiz_id) await loadAttemptQuestions(grade.quiz_id)
    setExpandedAttemptKey(key)
  }

  const renderQuizOverviewActions = (row: QuizOverviewRow) => (
    <div className="student-performance__overview-actions">
      <button
        type="button"
        className="panel-btn panel-btn-secondary panel-btn-sm"
        onClick={() => setAnalyticsModalQuizId(row.quizId)}
      >
        Analytics
      </button>
      {row.notAttempted > 0 && (
        <button
          type="button"
          className="panel-btn panel-btn-secondary panel-btn-sm"
          onClick={() => setMissingModalQuizId(row.quizId)}
        >
          Missing ({row.notAttempted})
        </button>
      )}
    </div>
  )

  const missingModalQuiz = missingModalQuizId
    ? publishedQuizzes.find((q) => q.id === missingModalQuizId)
    : null
  const missingModalStudents = missingModalQuizId ? getNotSubmitted(missingModalQuizId) : []

  const analyticsModalQuiz = analyticsModalQuizId
    ? publishedQuizzes.find((q) => q.id === analyticsModalQuizId)
    : null

  return (
    <div className="panel-page student-performance-page">
      <PanelBreadcrumbs
        items={[
          instructorDashboardCrumb(),
          { label: INSTRUCTOR_NAV.performance, to: ROUTES.instructor.performance },
        ]}
      />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Instructor · Analytics</p>
        <h1>Student Performance</h1>
        <p className="panel-hero-greeting">
          Track quiz completion, scores, and question-level insights. Send in-app reminders to students who have not submitted.
        </p>
      </div>

      <div className="panel-card panel-toolbar-card student-performance__toolbar">
        <div className="panel-form-group student-performance__class-select">
          <label className="panel-label" htmlFor="class-selector">Select Class</label>
          <select
            id="class-selector"
            className="panel-select"
            value={selectedClassId ?? ''}
            onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose one of your classes…</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>{classItem.title}</option>
            ))}
          </select>
        </div>
        {selectedClassId && (
          <div className="panel-form-group student-performance__attempt-mode">
            <label className="panel-label" htmlFor="attempt-mode">Score basis</label>
            <select
              id="attempt-mode"
              className="panel-select"
              value={attemptMode}
              onChange={(e) => setAttemptMode(e.target.value as AttemptMode)}
            >
              <option value="latest">Latest attempt</option>
              <option value="best">Best attempt</option>
              <option value="all">All attempts</option>
            </select>
          </div>
        )}
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}
      {isLoading && <PanelSkeleton variant="cards" count={3} />}

      {!isLoading && !error && classes.length === 0 && (
        <PanelEmptyState
          icon="classes"
          title="No Classes Yet"
          description="Create a class first to start tracking student performance."
          action={{ label: 'Go to My Classes', onClick: () => navigate(ROUTES.instructor.classes) }}
        />
      )}

      {!isLoading && !error && classes.length > 0 && !selectedClassId && (
        <PanelEmptyState
          icon="classes"
          title="Select a class"
          description="Choose a class above to view student quiz performance."
        />
      )}

      {!isLoading && !error && selectedClassId && publishedQuizzes.length === 0 && (
        <PanelEmptyState
          icon="quiz"
          title="No quizzes published"
          description={<>No quizzes published for <strong>{selectedClass?.title || 'this class'}</strong> yet.</>}
        />
      )}

      {!isLoading && !error && selectedClassId && publishedQuizzes.length > 0 && rawGrades.length === 0 && (
        <PanelEmptyState
          icon="performance"
          title="No attempts yet"
          description="Quizzes are published, but no students have submitted attempts yet."
        />
      )}

      {!isLoading && !error && selectedClassId && quizOverview.length > 0 && (
        <div className="panel-card panel-card--spaced">
          <div className="student-performance__section-header">
            <div>
              <h2 className="panel-section-kicker">Quiz Overview</h2>
              <p className="student-performance__section-sub">
                {classMembers.length} enrolled · {publishedQuizzes.length} quiz{publishedQuizzes.length !== 1 ? 'zes' : ''}
              </p>
            </div>
            <button
              className="panel-btn panel-btn-secondary panel-btn-sm"
              onClick={openExportModal}
              disabled={publishedQuizzes.length === 0}
              title="Choose a quiz to export as CSV"
            >
              Export CSV
            </button>
          </div>

          <div className="student-performance__overview-table-wrap panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Completion</th>
                  <th>Submitted</th>
                  <th>Missing</th>
                  <th>Class Avg</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizOverview.map((row) => (
                  <tr key={row.quizId}>
                    <td className="student-performance__quiz-title-cell">{row.quizTitle}</td>
                    <td>
                      <div className="student-performance__completion">
                        <div className="student-performance__completion-bar-wrap">
                          <div
                            className="student-performance__completion-bar"
                            style={{ width: `${row.completionPct}%` }}
                          />
                        </div>
                        <span>{row.completionPct}%</span>
                      </div>
                    </td>
                    <td>{row.attempted}</td>
                    <td>
                      {row.notAttempted > 0 ? (
                        <button
                          type="button"
                          className="student-performance__not-attempted-btn"
                          onClick={() => setMissingModalQuizId(row.quizId)}
                        >
                          {row.notAttempted} ▾
                        </button>
                      ) : (
                        <span className="student-performance__all-done">All done</span>
                      )}
                    </td>
                    <td>
                      {row.classAverage != null ? (
                        <span className={`student-performance__score-pill ${getScorePillClass(row.classAverage)}`}>
                          {row.classAverage.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="student-performance__not-attempted">—</span>
                      )}
                    </td>
                    <td>{renderQuizOverviewActions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="student-performance__overview-cards">
            {quizOverview.map((row) => (
              <article key={row.quizId} className="student-performance__overview-card">
                <div className="student-performance__overview-card-head">
                  <h3>{row.quizTitle}</h3>
                </div>
                <div className="student-performance__overview-card-stats">
                  <div>
                    <span className="student-performance__stat-label">Completion</span>
                    <strong>{row.completionPct}%</strong>
                    <div className="student-performance__completion-bar-wrap">
                      <div
                        className="student-performance__completion-bar"
                        style={{ width: `${row.completionPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <span className="student-performance__stat-label">Submitted</span>
                    <strong>{row.attempted}/{classMembers.length}</strong>
                  </div>
                  <div>
                    <span className="student-performance__stat-label">Class avg</span>
                    <strong>
                      {row.classAverage != null ? `${row.classAverage.toFixed(1)}%` : '—'}
                    </strong>
                  </div>
                </div>
                {renderQuizOverviewActions(row)}
              </article>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && selectedClassId && classMembers.length > 0 && publishedQuizzes.length > 0 && (
        <div className="student-performance__students-section">
          {selectedStudentId ? (
            <div>
              <button
                className="panel-btn panel-btn-secondary student-performance__back-btn"
                onClick={() => {
                  setSelectedStudentId(null)
                  setExpandedAttemptKey(null)
                }}
              >
                ← Back to Student List
              </button>
              <div className="student-performance__detail-header">
                <UserAvatar
                  username={selectedStudent?.username || ''}
                  avatarUrl={avatarByStudentId.get(selectedStudent?.student_id ?? 0) ?? null}
                  size="md"
                />
                <div>
                  <h2 className="panel-section-title">{selectedStudent?.username}'s Results</h2>
                  <p className="student-performance__detail-sub">
                    Showing {attemptMode === 'all' ? 'every attempt' : `${attemptMode} attempt per quiz`}
                  </p>
                </div>
              </div>

              {selectedStudent && (
                <>
                  <div className="panel-grid-2 student-performance__stats-grid">
                    <div className="panel-stat-card">
                      <p className="panel-stat-label">Quizzes Taken</p>
                      <p className="panel-stat-value">
                        {new Set(selectedStudent.grades.map((g) => g.quiz_id ?? g.quiz_title)).size}
                      </p>
                    </div>
                    <div className="panel-stat-card">
                      <p className="panel-stat-label">Average Score</p>
                      <p
                        className={`panel-stat-value ${getScoreClass(
                          selectedStudent.grades.reduce((s, g) => s + g.score, 0) /
                            selectedStudent.grades.length
                        )}`}
                      >
                        {(
                          selectedStudent.grades.reduce((s, g) => s + g.score, 0) /
                          selectedStudent.grades.length
                        ).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="student-performance__attempts-list">
                    {selectedStudent.grades.map((grade) => {
                      const attemptKey = `${grade.attempt_id ?? grade.completed_at}-${grade.quiz_id}`
                      const isExpanded = expandedAttemptKey === attemptKey
                      const questions = grade.quiz_id ? attemptQuizCache[grade.quiz_id] : undefined
                      const dt = new Date(grade.completed_at)
                      return (
                        <article key={attemptKey} className="student-performance__attempt-card">
                          <div className="student-performance__attempt-card-head">
                            <div>
                              <h3>{grade.quiz_title}</h3>
                              <p className="student-performance__attempt-meta">
                                {dt.toLocaleDateString()} · {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <span className={`student-performance__score-pill ${getScorePillClass(grade.score)}`}>
                              {grade.score.toFixed(1)}%
                            </span>
                          </div>
                          <p className="student-performance__attempt-scoreline">
                            {grade.correct_answers} / {grade.total_questions} correct
                          </p>
                          <button
                            type="button"
                            className="panel-btn panel-btn-secondary panel-btn-sm"
                            onClick={() => void toggleAttemptDetails(grade)}
                          >
                            {isExpanded ? 'Hide answers' : 'View answers'}
                          </button>
                          {isExpanded && questions && questions.length > 0 && (
                            <div className="student-performance__answer-breakdown">
                              {questions.map((q, idx) => {
                                const studentAnswer = (grade.responses ?? {})[String(idx)] ?? '—'
                                const isCorrect = studentAnswer === q.correct_answer
                                return (
                                  <div key={idx} className="student-performance__answer-row">
                                    <div className="student-performance__answer-qnum">Q{idx + 1}</div>
                                    <div>
                                      <p className="student-performance__answer-qtext">{q.question_text}</p>
                                      <p className={`student-performance__answer-line ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
                                        Student: <strong>{studentAnswer}</strong>
                                      </p>
                                      {!isCorrect && (
                                        <p className="student-performance__answer-line">
                                          Correct: <strong>{q.correct_answer}</strong>
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {isExpanded && (!questions || questions.length === 0) && (
                            <p className="student-performance__analytics-empty">Loading answer details…</p>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="student-performance__students-header">
                <h2 className="panel-section-kicker">Students in {selectedClass?.title}</h2>
                <input
                  type="search"
                  className="panel-input student-performance__search"
                  placeholder="Search students…"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  aria-label="Search students"
                />
              </div>
              {students.length === 0 ? (
                <p className="student-performance__analytics-empty">No students match your search.</p>
              ) : (
                <div className="panel-grid student-performance__student-grid">
                  {students.map((student) => {
                    const quizCount = new Set(student.grades.map((g) => g.quiz_id ?? g.quiz_title)).size
                    const avg =
                      student.grades.length > 0
                        ? student.grades.reduce((s, g) => s + g.score, 0) / student.grades.length
                        : null
                    return (
                      <div
                        key={student.student_id}
                        className="panel-student-card panel-student-card--polished student-performance__student-card"
                        onClick={() => student.grades.length > 0 && setSelectedStudentId(student.student_id)}
                        onKeyDown={(e) => {
                          if (student.grades.length === 0) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedStudentId(student.student_id)
                          }
                        }}
                        role="button"
                        tabIndex={student.grades.length > 0 ? 0 : -1}
                        aria-disabled={student.grades.length === 0}
                      >
                        <UserAvatar
                          username={student.username}
                          avatarUrl={avatarByStudentId.get(student.student_id) ?? null}
                          size="md"
                        />
                        <h3>{student.username}</h3>
                        {student.grades.length === 0 ? (
                          <p className="student-performance__not-attempted">No quiz attempts yet</p>
                        ) : (
                          <>
                            <p>{quizCount} quiz{quizCount !== 1 ? 'zes' : ''} · {student.grades.length} attempt{student.grades.length !== 1 ? 's' : ''}</p>
                            <p>
                              Average:{' '}
                              <span className={getScoreClass(avg ?? 0)}>
                                <strong>{avg!.toFixed(1)}%</strong>
                              </span>
                            </p>
                            <button className="panel-btn panel-btn-primary panel-btn-sm student-performance__view-btn">
                              View Details →
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Missing students modal ─── */}
      {missingModalQuizId != null && (
        <div
          className="student-performance__modal-overlay"
          role="presentation"
          onClick={() => setMissingModalQuizId(null)}
        >
          <div
            className="student-performance__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sp-missing-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="student-performance__modal-header">
              <div>
                <h2 id="sp-missing-title" className="student-performance__modal-title">
                  Students not yet submitted
                </h2>
                <p className="student-performance__modal-subtitle">{missingModalQuiz?.title}</p>
              </div>
              <button
                type="button"
                className="student-performance__modal-close"
                onClick={() => setMissingModalQuizId(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="student-performance__modal-body">
              {missingModalStudents.length === 0 ? (
                <p className="student-performance__missing-empty">
                  All enrolled students have submitted this quiz.
                </p>
              ) : (
                <>
                  <p className="student-performance__modal-meta">
                    {missingModalStudents.length} student{missingModalStudents.length !== 1 ? 's' : ''} still need to complete this quiz.
                  </p>
                  <div className="student-performance__missing-list">
                    {missingModalStudents.map((m) => (
                      <div key={m.id} className="student-performance__missing-item">
                        <UserAvatar username={m.username} avatarUrl={m.avatar_url ?? null} size="sm" />
                        <span>{m.username}</span>
                        <button
                          type="button"
                          className="student-performance__notify-one-btn"
                          disabled={reminding}
                          onClick={() =>
                            handleSendReminders(missingModalQuizId, missingModalQuiz?.title || 'Quiz', [m.id])
                          }
                        >
                          Notify
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <footer className="student-performance__modal-footer">
              {missingModalStudents.length > 0 && (
                <button
                  type="button"
                  className="panel-btn panel-btn-primary"
                  disabled={reminding}
                  onClick={() =>
                    handleSendReminders(
                      missingModalQuizId,
                      missingModalQuiz?.title || 'Quiz',
                      missingModalStudents.map((m) => m.id)
                    )
                  }
                >
                  {reminding ? 'Sending…' : `Notify all (${missingModalStudents.length})`}
                </button>
              )}
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => setMissingModalQuizId(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ─── Question analytics modal ─── */}
      {analyticsModalQuizId != null && (
        <div
          className="student-performance__modal-overlay"
          role="presentation"
          onClick={() => setAnalyticsModalQuizId(null)}
        >
          <div
            className="student-performance__modal student-performance__modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sp-analytics-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="student-performance__modal-header">
              <div>
                <h2 id="sp-analytics-title" className="student-performance__modal-title">
                  Question Analytics
                </h2>
                <p className="student-performance__modal-subtitle">{analyticsModalQuiz?.title}</p>
              </div>
              <button
                type="button"
                className="student-performance__modal-close"
                onClick={() => setAnalyticsModalQuizId(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="student-performance__modal-body student-performance__modal-body--scroll">
              {loadingAnalytics ? (
                <PanelSkeleton variant="rows" count={4} />
              ) : questionAnalytics.length === 0 ? (
                <p className="student-performance__analytics-empty">No submission data available yet.</p>
              ) : (
                <div className="student-performance__analytics-list">
                  {questionAnalytics.map((qa, idx) => (
                    <div key={idx} className="student-performance__analytics-row">
                      <div className="student-performance__analytics-qnum">Q{idx + 1}</div>
                      <div className="student-performance__analytics-content">
                        <p className="student-performance__analytics-qtext">{qa.question_text}</p>
                        <div className="student-performance__analytics-bar-wrap">
                          <div
                            className="student-performance__analytics-bar"
                            style={{
                              width: qa.rate != null ? `${qa.rate}%` : '0%',
                              backgroundColor:
                                qa.rate != null
                                  ? qa.rate >= 70
                                    ? '#22c55e'
                                    : qa.rate >= 40
                                      ? '#f59e0b'
                                      : '#ef4444'
                                  : '#e2e8f0',
                            }}
                          />
                          <span className="student-performance__analytics-rate">
                            {qa.rate != null ? `${qa.rate.toFixed(0)}% correct` : 'No data'} ({qa.correctCount}/{qa.total})
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <footer className="student-performance__modal-footer">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => setAnalyticsModalQuizId(null)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ─── Export CSV modal ─── */}
      {exportModalOpen && (
        <div
          className="student-performance__modal-overlay"
          role="presentation"
          onClick={() => setExportModalOpen(false)}
        >
          <div
            className="student-performance__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sp-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="student-performance__modal-header">
              <div>
                <h2 id="sp-export-title" className="student-performance__modal-title">
                  Export quiz grades
                </h2>
                <p className="student-performance__modal-subtitle">
                  Choose which quiz to download as a CSV file.
                </p>
              </div>
              <button
                type="button"
                className="student-performance__modal-close"
                onClick={() => setExportModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="student-performance__modal-body">
              <div className="student-performance__export-list" role="listbox" aria-label="Select quiz to export">
                {publishedQuizzes.map((quiz) => {
                  const attemptCount = displayGrades.filter((g) => g.quiz_id === quiz.id).length
                  const isSelected = exportQuizId === quiz.id
                  return (
                    <button
                      key={quiz.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`student-performance__export-option ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setExportQuizId(quiz.id)}
                    >
                      <span className="student-performance__export-option-title">{quiz.title}</span>
                      <span className="student-performance__export-option-meta">
                        {attemptCount} attempt{attemptCount !== 1 ? 's' : ''} recorded
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <footer className="student-performance__modal-footer">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => setExportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                disabled={exportQuizId == null}
                onClick={handleExportQuizCsv}
              >
                Download CSV
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentPerformance
