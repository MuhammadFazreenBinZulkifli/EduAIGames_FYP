import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../config'
import { QuizReviewSection, type ReviewQuestion } from './QuizReviewSection'
import StudentStudyCoach from './StudentStudyCoach'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import QuizSearchSelect from './QuizSearchSelect'
import PanelSkeleton from './PanelSkeleton'
import { ROUTES } from '../routes/paths'
import { STUDENT_NAV, studentDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentGrades_CSS.css'
import './App_CSS/QuizSearchSelect_CSS.css'
import './App_CSS/StudentClassPicker_CSS.css'

interface QuizResult {
  id: number
  student_id: number
  quiz_id: number
  quiz_title: string
  score: number
  correct_answers: number
  total_questions: number
  completed_at: string
  quiz_class_id?: number | null
  responses?: Record<string, string> | null
}

interface JoinedClass {
  id: number
  title: string
  description?: string
  instructor_name?: string
  background_image?: string | null
}

interface StudentGradesProps {
  studentId?: number
  /** Deep-link: pre-select this class on mount (e.g. from the dashboard latest result). */
  initialClassId?: number | null
  /** Deep-link: auto-open the review for this quiz once its class results load. */
  initialReviewQuizId?: number | null
}

// Shows quiz results per class with a detailed question-by-question review.
function StudentGrades({ studentId, initialClassId = null, initialReviewQuizId = null }: StudentGradesProps) {
  const [joinedClasses, setJoinedClasses] = useState<JoinedClass[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(initialClassId)
  const [pendingReviewQuizId, setPendingReviewQuizId] = useState<number | null>(initialReviewQuizId)
  const [quizResults, setQuizResults] = useState<QuizResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<QuizResult | null>(null)
  const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestion[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const selectedClassTitle = useMemo(
    () => joinedClasses.find((c) => c.id === selectedClassId)?.title ?? '',
    [joinedClasses, selectedClassId]
  )

  useEffect(() => {
    const loadClasses = async () => {
      if (!studentId) { setClassesLoading(false); return }
      try {
        setClassesLoading(true)
        const res = await fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`)
        if (!res.ok) throw new Error('Failed to load classes')
        const data = await res.json()
        setJoinedClasses(
          (data.classes || []).map((c: any) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            instructor_name: c.instructor_name ?? undefined,
            background_image: c.background_image ?? null,
          }))
        )
      } catch {
        setJoinedClasses([])
      } finally {
        setClassesLoading(false)
      }
    }
    loadClasses()
  }, [studentId])

  useEffect(() => {
    const toNumber = (value: unknown): number => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    // Loads submitted attempts for one class, including per-question responses when stored.
    const fetchGrades = async () => {
      if (!studentId) { setError('Student ID is required'); setLoading(false); return }
      if (selectedClassId === null) { setQuizResults([]); setLoading(false); return }
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(
          `${API_BASE_URL}/api/quizzes/attempts/student/${studentId}?class_id=${selectedClassId}`
        )
        if (!response.ok) throw new Error('Failed to fetch grades')
        const data = await response.json()
        setQuizResults(
          (data.attempts || []).map((attempt: any) => ({
            ...attempt,
            score: toNumber(attempt.score),
            correct_answers: toNumber(attempt.correct_answers),
            total_questions: toNumber(attempt.total_questions),
            quiz_class_id: attempt.quiz_class_id != null ? Number(attempt.quiz_class_id) : null,
            responses:
              attempt.responses && typeof attempt.responses === 'object' && !Array.isArray(attempt.responses)
                ? attempt.responses as Record<string, string>
                : null,
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch grades')
      } finally {
        setLoading(false)
      }
    }
    fetchGrades()
  }, [studentId, selectedClassId])

  // Deep-link: once the pre-selected class results are in, jump straight to that quiz's review.
  useEffect(() => {
    if (pendingReviewQuizId == null || loading) return
    const match = quizResults.find((r) => r.quiz_id === pendingReviewQuizId)
    if (match) {
      setSelectedResult(match)
      setPendingReviewQuizId(null)
    }
  }, [quizResults, pendingReviewQuizId, loading])

  useEffect(() => {
    if (!selectedResult || !studentId) {
      setReviewQuestions([])
      setReviewError(null)
      return
    }
    // Fetches full question text, options, and explanations for the detail review screen.
    const loadReview = async () => {
      setReviewLoading(true)
      setReviewError(null)
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/quizzes/student/${studentId}/quiz/${selectedResult.quiz_id}/review`
        )
        if (!res.ok) throw new Error('Could not load quiz details for review')
        const data = await res.json()
        const quiz = data.quiz
        const mapped: ReviewQuestion[] = (quiz?.questions || []).map((q: any) => ({
          question_type: q.question_type,
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          explanation: q.explanation ?? undefined,
          options: q.question_type === 'true-false'
            ? ['True', 'False']
            : (q.options || []).map((o: any) => o.option_text),
        }))
        setReviewQuestions(mapped)
      } catch (e) {
        setReviewError(e instanceof Error ? e.message : 'Failed to load review')
        setReviewQuestions([])
      } finally {
        setReviewLoading(false)
      }
    }
    loadReview()
  }, [selectedResult, studentId])

  const getScoreClass = (s: number) => {
    if (s >= 90) return 'score-a'
    if (s >= 80) return 'score-b'
    if (s >= 70) return 'score-c'
    if (s >= 60) return 'score-d'
    return 'score-f'
  }

  const getGradeBg = (s: number) => {
    if (s >= 90) return 'grade-a'
    if (s >= 80) return 'grade-b'
    if (s >= 70) return 'grade-c'
    if (s >= 60) return 'grade-d'
    return 'grade-f'
  }

  const getGradeLetter = (s: number) => {
    if (s >= 90) return 'A'
    if (s >= 80) return 'B'
    if (s >= 70) return 'C'
    if (s >= 60) return 'D'
    return 'F'
  }

  // Normalizes saved answer keys to strings for the review section.
  const responsesMap = (r: QuizResult): Record<string, string> => {
    if (!r.responses || typeof r.responses !== 'object') return {}
    return Object.fromEntries(
      Object.entries(r.responses).map(([k, v]) => [String(k), String(v)])
    )
  }

  /* ─── Detail view ─── */
  if (selectedResult) {
    const resp = responsesMap(selectedResult)
    const hasSavedAnswers = Object.keys(resp).length > 0

    return (
      <div className="panel-page">
        <PanelBreadcrumbs
          items={[
            studentDashboardCrumb(),
            { label: STUDENT_NAV.myGrades, to: ROUTES.student.grades },
            ...(selectedClassTitle
              ? [{ label: selectedClassTitle, to: ROUTES.student.grades }]
              : []),
            { label: selectedResult.quiz_title },
          ]}
        />
        <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm student-grades__back-btn" onClick={() => setSelectedResult(null)}>
          ← All results
        </button>

        <div className="panel-hero panel-hero--page student-grades__hero--center">
          <p className="panel-kicker">Quiz Result</p>
          <h1>{selectedResult.quiz_title}</h1>
          {selectedClassTitle && (
            <p className="panel-meta student-grades__meta--class">Class: <strong>{selectedClassTitle}</strong></p>
          )}

          <div className="panel-stats-row student-grades__stats-row--center">
            <div className="panel-stat-card">
              <p className="panel-stat-label">Score</p>
              <p className={`panel-stat-value ${getScoreClass(selectedResult.score)}`}>
                {selectedResult.score.toFixed(1)}%
              </p>
            </div>
            <div className="panel-stat-card">
              <p className="panel-stat-label">Grade</p>
              <p className={`panel-stat-value ${getScoreClass(selectedResult.score)}`}>
                {getGradeLetter(selectedResult.score)}
              </p>
            </div>
            <div className="panel-stat-card">
              <p className="panel-stat-label">Correct</p>
              <p className="panel-stat-value student-grades__stat-value--success">
                {selectedResult.correct_answers}/{selectedResult.total_questions}
              </p>
            </div>
          </div>

          <p className="panel-meta student-grades__meta--completed">
            Completed on {new Date(selectedResult.completed_at).toLocaleString()}
          </p>
        </div>

        <div className="panel-grid-2 student-grades__grid-2--spaced">
          <div className="panel-stat-card student-grades__stat-card--correct">
            <p className="panel-stat-label">✓ Correct</p>
            <p className="panel-stat-value student-grades__stat-value--success">{selectedResult.correct_answers}</p>
          </div>
          <div className="panel-stat-card student-grades__stat-card--incorrect">
            <p className="panel-stat-label">✗ Incorrect</p>
            <p className="panel-stat-value student-grades__stat-value--error">
              {selectedResult.total_questions - selectedResult.correct_answers}
            </p>
          </div>
        </div>

        {reviewLoading && <PanelSkeleton variant="list" count={3} />}
        {reviewError && <div className="panel-alert panel-alert-error student-grades__alert--review">{reviewError}</div>}

        {!reviewLoading && !reviewError && reviewQuestions.length > 0 && (
          <div className="student-grades__review-section">
            {!hasSavedAnswers && (
              <div className="panel-card" />
            )}
            <QuizReviewSection questions={reviewQuestions} answersByIndex={hasSavedAnswers ? resp : {}} />
          </div>
        )}

        <div className="student-grades__footer-actions">
          <button type="button" className="panel-btn panel-btn-secondary" onClick={() => setSelectedResult(null)}>
            ← Back to all results
          </button>
        </div>
      </div>
    )
  }

  /* ─── Main list ─── */
  const sorted = [...quizResults].sort(
    (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
  )

  return (
    <div className="panel-page">
      <PanelBreadcrumbs
        items={[
          studentDashboardCrumb(),
          { label: STUDENT_NAV.myGrades, to: ROUTES.student.grades },
          ...(selectedClassId != null && selectedClassTitle
            ? [{ label: selectedClassTitle }]
            : []),
        ]}
      />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Student · Grades</p>
        <h1>{STUDENT_NAV.myGrades}</h1>
        <p className="panel-hero-greeting">Pick a class to see quiz results for that class, then open a result to review questions and explanations.</p>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {!studentId && <div className="panel-alert panel-alert-error">Student ID is required</div>}

      {studentId && classesLoading && <PanelSkeleton variant="cards" count={3} />}

      {studentId && !classesLoading && joinedClasses.length === 0 && !error && (
        <PanelEmptyState
          icon="classes"
          title="No Classes"
          description="Join a class to see grades for quizzes in that class."
        />
      )}

      {studentId && !classesLoading && joinedClasses.length > 0 && selectedClassId === null && (
        <>
          <p className="panel-section-kicker">Select a class</p>
          <div className="panel-card panel-toolbar-card student-grades__class-select-card">
            <label className="panel-label">Quick pick</label>
            <p className="panel-meta student-grades__meta--hint">
              Grades are shown one class at a time so you can focus on each course.
            </p>
            <QuizSearchSelect
              options={joinedClasses.map((c) => ({ id: c.id, title: c.title }))}
              value=""
              onChange={(idStr) => { if (idStr) setSelectedClassId(Number(idStr)) }}
              placeholder="Type a class name to search…"
              emptyText="No matching classes"
              ariaLabel="Search classes to view grades"
              optionIcon="classes"
            />
          </div>
          <div className="panel-grid student-class-picker__grid">
            {joinedClasses.map((c) => (
              <ClassCard
                key={c.id}
                variant="banner"
                classItem={c}
                bannerFallbackIcon="grades"
                clickable
                className="student-grades__class-card--clickable"
                onClick={() => setSelectedClassId(c.id)}
                descriptionFallback="View quiz grades for this class"
                bodyExtra={
                  c.instructor_name ? (
                    <span className="panel-meta panel-class-card-submeta">Instructor: {c.instructor_name}</span>
                  ) : undefined
                }
                actionLabel="View grades →"
              />
            ))}
          </div>
        </>
      )}

      {studentId && !classesLoading && selectedClassId !== null && (
        <>
          <div className="panel-context-bar student-grades__class-header-card">
            <div>
              <p className="panel-kicker">Showing grades for</p>
              <h2>{selectedClassTitle}</h2>
            </div>
            <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setSelectedClassId(null)}>
              ← Choose another class
            </button>
          </div>

          {loading && <PanelSkeleton variant="list" count={4} />}

          {!loading && quizResults.length === 0 && !error && (
            <PanelEmptyState
              icon="grades"
              title="No Quiz Results Yet"
              description={<>Complete a quiz in <strong>{selectedClassTitle}</strong> to see your results here.</>}
            />
          )}

          {!loading && quizResults.length > 0 && studentId && (
            <StudentStudyCoach
              studentId={studentId}
              classId={selectedClassId}
              className={selectedClassTitle}
            />
          )}

          {!loading && quizResults.length > 0 && (
            <>
              <h3 className="panel-section-kicker">Quiz results</h3>
              <p className="panel-meta student-grades__meta--results-hint">
                Tap a row to open your score and a full question-by-question review (with explanations when your instructor provided them).
              </p>

              {sorted.map((result) => (
                <div
                  key={result.id}
                  className="panel-result-row panel-result-row--polished student-grades__result-row"
                  onClick={() => setSelectedResult(result)}
                >
                  <div>
                    <h4>{result.quiz_title}</h4>
                    <p>{result.correct_answers}/{result.total_questions} correct · {new Date(result.completed_at).toLocaleDateString()}</p>
                  </div>
                  <div className="student-grades__result-score-wrap">
                    <span className={`panel-score student-grades__score-lg ${getScoreClass(result.score)}`}>
                      {result.score.toFixed(1)}%
                    </span>
                    <div className={`panel-grade-badge ${getGradeBg(result.score)}`}>
                      {getGradeLetter(result.score)}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default StudentGrades
