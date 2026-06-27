import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import PanelIcon from './PanelIcon'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import PanelSkeleton from './PanelSkeleton'
import { ROUTES } from '../routes/paths'
import {
  STUDENT_NAV,
  studentDashboardCrumb,
} from '../utils/panelBreadcrumbHelpers'
import {
  clearProgressForQuizzes,
  clearQuizProgress,
  clearQuizSubmitted,
  hasQuizProgress,
  isQuizSubmitted,
  loadQuizProgress,
  markQuizSubmitted,
  saveQuizProgress,
} from '../utils/quizProgress'
import { prepareQuizSession } from '../utils/quizSessionUtils'
import './App_CSS/QuizAnswering_CSS.css'

interface Question {
  id: number | string
  question_type: 'multiple-choice' | 'true-false'
  question_text: string
  options: string[]
  correct_answer: string
  explanation?: string
}

interface Quiz {
  id: number | string
  class_id?: number | null
  title: string
  description: string
  questions: Question[]
  time_limit_minutes?: number | null
  shuffle_questions?: boolean
  shuffle_options?: boolean
  max_attempts?: number | null
  show_results_after?: 'immediate' | 'never'
}

interface JoinedClass {
  id: number
  title: string
  description?: string
}

interface QuizAnsweringProps {
  studentId?: number
  initialClassId?: number | null
  initialQuizId?: number | null
  onSessionEnd?: () => void
}

// Lets students pick a class quiz, answer questions, and submit results.
function QuizAnswering({ studentId, initialClassId, initialQuizId, onSessionEnd }: QuizAnsweringProps) {
  const { confirm, alert: showAlert } = usePanelUI()
  const [joinedClasses, setJoinedClasses] = useState<JoinedClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null)

  useGameImmersiveMode(selectedQuiz !== null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showResumedBanner, setShowResumedBanner] = useState(false)
  const [completedQuizIds, setCompletedQuizIds] = useState<Set<string>>(new Set())
  const [attemptScores, setAttemptScores] = useState<Record<string, number>>({})
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const progressBlockedRef = useRef(false)
  const launchedInitialQuizRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const quizTimerStartRef = useRef<number | null>(null)
  const answersRef = useRef<Record<number, string>>({})
  const autoSubmittedRef = useRef(false)

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const serializeSessionQuestions = (quiz: Quiz) =>
    quiz.questions.map((q) => ({
      question_type: q.question_type,
      question_text: q.question_text,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      options: [...q.options],
    }))

  const buildSessionQuiz = (baseQuiz: Quiz, saved?: ReturnType<typeof loadQuizProgress> | null): Quiz => {
    if (saved?.sessionQuestions?.length) {
      return {
        ...baseQuiz,
        questions: saved.sessionQuestions.map((q, i) => ({
          id: i,
          question_type: q.question_type as Question['question_type'],
          question_text: q.question_text,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          options: [...q.options],
        })),
      }
    }
    return prepareQuizSession(baseQuiz)
  }

  const startQuizTimer = (quiz: Quiz, elapsedSeconds = 0) => {
    if (!quiz.time_limit_minutes) {
      quizTimerStartRef.current = null
      setTimeLeft(null)
      return
    }
    quizTimerStartRef.current = Date.now() - elapsedSeconds * 1000
    setTimeLeft(Math.max(0, quiz.time_limit_minutes * 60 - elapsedSeconds))
  }

  useEffect(() => {
    const load = async () => {
      if (!studentId) { setError('Student ID is required'); setLoading(false); return }
      try {
        setLoading(true)
        setError('')
        const [classesRes, quizzesRes, attemptsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`),
          fetch(`${API_BASE_URL}/api/quizzes/student/${studentId}/available`),
          fetch(`${API_BASE_URL}/api/quizzes/attempts/student/${studentId}`),
        ])
        if (!classesRes.ok) throw new Error('Failed to load your classes')
        if (!quizzesRes.ok) throw new Error('Failed to fetch quizzes')
        const classesData = await classesRes.json()
        const quizData = await quizzesRes.json()
        const attemptsData = attemptsRes.ok ? await attemptsRes.json() : { attempts: [] }
        const completed = new Set<string>()
        const scores: Record<string, number> = {}
        const submittedQuizIds: Array<number | string> = []
        for (const attempt of attemptsData.attempts || []) {
          const qid = String(attempt.quiz_id)
          completed.add(qid)
          submittedQuizIds.push(attempt.quiz_id)
          if (scores[qid] === undefined) scores[qid] = Number(attempt.score)
        }
        clearProgressForQuizzes(studentId, submittedQuizIds)
        setCompletedQuizIds(completed)
        setAttemptScores(scores)
        setJoinedClasses((classesData.classes || []).map((c: any) => ({ id: c.id, title: c.title, description: c.description })))
        const mappedQuizzes = (quizData.quizzes || []).map((quiz: any) => ({
          id: quiz.id,
          class_id: quiz.class_id != null ? Number(quiz.class_id) : null,
          title: quiz.title,
          description: quiz.description,
          time_limit_minutes: quiz.time_limit_minutes ?? null,
          shuffle_questions: quiz.shuffle_questions ?? false,
          shuffle_options: quiz.shuffle_options ?? false,
          max_attempts: quiz.max_attempts ?? null,
          show_results_after: quiz.show_results_after ?? 'immediate',
          questions: (quiz.questions || []).map((q: any) => ({
            id: q.id,
            question_type: q.question_type,
            question_text: q.question_text,
            correct_answer: q.correct_answer,
            explanation: q.explanation ?? undefined,
            options: q.question_type === 'true-false'
              ? ['True', 'False']
              : (q.options || []).map((o: any) => o.option_text),
          })),
        }))
        setQuizzes(mappedQuizzes)
        if (studentId) {
          setCompletedQuizIds((prev) => {
            const next = new Set(prev)
            for (const quiz of mappedQuizzes) {
              if (isQuizSubmitted(studentId, quiz.id)) next.add(String(quiz.id))
            }
            return next
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [studentId])

  // Restores in-progress answers from localStorage when a student resumes a quiz.
  const applySavedProgress = (saved: ReturnType<typeof loadQuizProgress>) => {
    if (!saved) return
    setCurrentQuestionIndex(saved.currentQuestionIndex)
    const restored: Record<number, string> = {}
    Object.entries(saved.answers).forEach(([k, v]) => {
      if (v) restored[Number(k)] = v
    })
    setAnswers(restored)
    setConfirmed(new Set(saved.confirmedIndices))
  }

  const quizzesForClass = useMemo(
    () => (selectedClassId == null ? [] : quizzes.filter((q) => Number(q.class_id) === selectedClassId)),
    [quizzes, selectedClassId]
  )

  const selectedClassTitle = useMemo(
    () => joinedClasses.find((c) => c.id === selectedClassId)?.title ?? '',
    [joinedClasses, selectedClassId]
  )

  const isQuizCompleted = (quizId: number | string) =>
    completedQuizIds.has(String(quizId)) || (studentId ? isQuizSubmitted(studentId, quizId) : false)

  const exitToQuizList = () => {
    setSelectedQuiz(null)
    setShowResumedBanner(false)
    setCurrentQuestionIndex(0)
    setAnswers({})
    setConfirmed(new Set())
    progressBlockedRef.current = false
    quizTimerStartRef.current = null
    autoSubmittedRef.current = false
    setTimeLeft(null)
    if (timerRef.current) clearInterval(timerRef.current)
    onSessionEnd?.()
  }

  // Clears saved progress, records completion locally, and returns to the quiz list.
  const finishQuizSession = (quiz: Quiz, finalScore: number) => {
    if (studentId) {
      markQuizSubmitted(studentId, quiz.id)
      clearQuizProgress(studentId, quiz.id)
    }
    progressBlockedRef.current = true
    setCompletedQuizIds((prev) => new Set(prev).add(String(quiz.id)))
    setAttemptScores((prev) => ({ ...prev, [String(quiz.id)]: Math.round(finalScore) }))
    setAttemptCounts((prev) => ({
      ...prev,
      [String(quiz.id)]: (prev[String(quiz.id)] ?? 0) + 1,
    }))
    setSubmitSuccess(`${quiz.title} submitted · ${Math.round(finalScore)}%`)
    onSessionEnd?.()
    setSelectedQuiz(null)
    setShowResumedBanner(false)
    setCurrentQuestionIndex(0)
    setAnswers({})
    setConfirmed(new Set())
    launchedInitialQuizRef.current = null
  }

  // Starts a new attempt; retakes also clear the prior submitted flag in localStorage.
  const startQuizFresh = (quiz: Quiz, options?: { allowRetake?: boolean }) => {
    const prevAttempts = attemptCounts[String(quiz.id)] ?? 0
    if (quiz.max_attempts && prevAttempts >= quiz.max_attempts) {
      void showAlert(`You have reached the maximum number of attempts (${quiz.max_attempts}) for this quiz.`)
      return
    }

    if (studentId) {
      clearQuizProgress(studentId, quiz.id)
      if (options?.allowRetake) {
        clearQuizSubmitted(studentId, quiz.id)
        setCompletedQuizIds((prev) => {
          const next = new Set(prev)
          next.delete(String(quiz.id))
          return next
        })
        setAttemptScores((prev) => {
          const next = { ...prev }
          delete next[String(quiz.id)]
          return next
        })
      }
    }
    autoSubmittedRef.current = false
    const session = prepareQuizSession(quiz)
    progressBlockedRef.current = false
    setSelectedQuiz(session)
    setCurrentQuestionIndex(0)
    setAnswers({})
    setConfirmed(new Set())
    setShowResumedBanner(false)
    setError('')
    startQuizTimer(session)
  }

  // Opens a quiz or resumes saved progress from localStorage if one exists.
  const handleQuizSelect = (quiz: Quiz) => {
    if (isQuizCompleted(quiz.id)) return

    // Enforce max attempts
    const prevAttempts = attemptCounts[String(quiz.id)] ?? 0
    if (quiz.max_attempts && prevAttempts >= quiz.max_attempts) {
      void showAlert(`You have reached the maximum number of attempts (${quiz.max_attempts}) for this quiz.`)
      return
    }

    if (studentId) {
      const saved = loadQuizProgress(studentId, quiz.id)
      if (saved) {
        const classId = saved.classId ?? (quiz.class_id != null ? Number(quiz.class_id) : null)
        if (classId != null) setSelectedClassId(classId)
        const session = buildSessionQuiz(quiz, saved)
        autoSubmittedRef.current = false
        progressBlockedRef.current = false
        setSelectedQuiz(session)
        applySavedProgress(saved)
        setError('')
        setShowResumedBanner(true)
        startQuizTimer(session, saved.elapsedSeconds ?? 0)
        return
      }
    }
    startQuizFresh(quiz)
  }

  useEffect(() => {
    if (loading || initialClassId == null) return
    setSelectedClassId(initialClassId)
    if (initialQuizId == null || quizzes.length === 0) return
    if (launchedInitialQuizRef.current === initialQuizId) return

    const quiz = quizzes.find((q) => Number(q.id) === initialQuizId)
    if (!quiz) return

    launchedInitialQuizRef.current = initialQuizId
    onSessionEnd?.()

    if (isQuizCompleted(quiz.id)) return

    const saved = studentId ? loadQuizProgress(studentId, quiz.id) : null
    if (saved) {
      const session = buildSessionQuiz(quiz, saved)
      autoSubmittedRef.current = false
      progressBlockedRef.current = false
      setSelectedQuiz(session)
      applySavedProgress(saved)
      setShowResumedBanner(true)
      startQuizTimer(session, saved.elapsedSeconds ?? 0)
    } else {
      startQuizFresh(quiz)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialClassId, initialQuizId, quizzes])

  // Timer countdown; auto-submits when time runs out.
  useEffect(() => {
    if (!selectedQuiz?.time_limit_minutes || timeLeft === null) return

    if (timerRef.current) clearInterval(timerRef.current)

    if (timeLeft <= 0) {
      if (!autoSubmittedRef.current && !submitting) {
        autoSubmittedRef.current = true
        void submitQuizAnswers(selectedQuiz, answersRef.current)
      }
      return
    }

    timerRef.current = setInterval(() => {
      if (!quizTimerStartRef.current || !selectedQuiz.time_limit_minutes) return
      const elapsed = Math.floor((Date.now() - quizTimerStartRef.current) / 1000)
      const remaining = Math.max(0, selectedQuiz.time_limit_minutes * 60 - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0 && !autoSubmittedRef.current && !submitting) {
        autoSubmittedRef.current = true
        if (timerRef.current) clearInterval(timerRef.current)
        void submitQuizAnswers(selectedQuiz, answersRef.current)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuiz?.id, selectedQuiz?.time_limit_minutes, timeLeft === null])

  useEffect(() => {
    if (!selectedQuiz) {
      setTimeLeft(null)
      quizTimerStartRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [selectedQuiz])

  // Load attempt counts for the current class's quizzes.
  useEffect(() => {
    const fetchCounts = async () => {
      if (!studentId || quizzesForClass.length === 0) return
      const entries = await Promise.all(
        quizzesForClass.map(async (q) => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/quizzes/student/${studentId}/quiz/${q.id}/attempt-count`)
            if (!res.ok) return [String(q.id), 0] as const
            const data = await res.json()
            return [String(q.id), Number(data.count)] as const
          } catch { return [String(q.id), 0] as const }
        })
      )
      setAttemptCounts(Object.fromEntries(entries))
    }
    void fetchCounts()
  }, [studentId, quizzesForClass])

  useEffect(() => {
    if (
      progressBlockedRef.current ||
      !studentId ||
      !selectedQuiz ||
      isQuizCompleted(selectedQuiz.id)
    ) {
      return
    }
    const answersPayload: Record<string, string> = {}
    Object.entries(answers).forEach(([k, v]) => {
      if (v) answersPayload[k] = v
    })
    saveQuizProgress(studentId, {
      quizId: selectedQuiz.id,
      classId: selectedClassId,
      currentQuestionIndex,
      answers: answersPayload,
      confirmedIndices: Array.from(confirmed),
      updatedAt: new Date().toISOString(),
      elapsedSeconds: quizTimerStartRef.current
        ? Math.floor((Date.now() - quizTimerStartRef.current) / 1000)
        : undefined,
      sessionQuestions: serializeSessionQuestions(selectedQuiz),
    })
  }, [studentId, selectedQuiz, selectedClassId, currentQuestionIndex, answers, confirmed, completedQuizIds])

  const handleConfirm = () => {
    setConfirmed(prev => new Set([...prev, currentQuestionIndex]))
  }

  const handleNext = () => {
    if (selectedQuiz && currentQuestionIndex < selectedQuiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    }
  }

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) setCurrentQuestionIndex(currentQuestionIndex - 1)
  }

  // Sends final answers to the server and records the attempt score.
  const submitQuizAnswers = async (quiz: Quiz, answerMap: Record<number, string>) => {
    if (!studentId) return
    progressBlockedRef.current = true
    clearQuizProgress(studentId, quiz.id)
    let correctCount = 0
    quiz.questions.forEach((q, i) => {
      if (answerMap[i] === q.correct_answer) correctCount++
    })
    const finalScore = (correctCount / quiz.questions.length) * 100
    setError('')
    try {
      setSubmitting(true)
      const responses: Record<string, string> = {}
      quiz.questions.forEach((_, i) => {
        const a = answerMap[i]
        if (a !== undefined && a !== '') responses[String(i)] = a
      })

      const response = await fetch(`${API_BASE_URL}/api/quizzes/attempts/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          quiz_id: quiz.id,
          score: Math.round(finalScore),
          correct_answers: correctCount,
          total_questions: quiz.questions.length,
          responses,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const msg = (data as { error?: string }).error || 'Failed to submit quiz attempt'
        throw new Error(
          msg.includes('not published') || msg.includes('Access')
            ? 'This quiz is not available. Your instructor must publish it in Manage Course first.'
            : msg
        )
      }
      finishQuizSession(quiz, finalScore)
    } catch (err) {
      progressBlockedRef.current = false
      setError(err instanceof Error ? err.message : 'Failed to submit quiz attempt')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedQuiz) return
    await submitQuizAnswers(selectedQuiz, answers)
  }

  const handleEndQuiz = async () => {
    if (!selectedQuiz) return
    const unanswered = selectedQuiz.questions.length - Object.keys(answers).filter((k) => answers[Number(k)]).length
    const extra =
      unanswered > 0
        ? ` You have ${unanswered} unanswered question${unanswered !== 1 ? 's' : ''}; those will count as incorrect.`
        : ''
    const ok = await confirm({ message: `End and submit this quiz now?${extra}` })
    if (!ok) return
    await handleSubmit()
  }

  const handleEndQuizFromSaved = async (quiz: Quiz) => {
    if (!studentId) return
    const saved = loadQuizProgress(studentId, quiz.id)
    if (!saved) {
      setError('No saved progress found for this quiz.')
      return
    }
    const ok = await confirm({
      message:
        'Submit your saved answers and finish this quiz? Any questions you did not answer will count as incorrect.',
    })
    if (!ok) return
    const restored: Record<number, string> = {}
    Object.entries(saved.answers).forEach(([k, v]) => {
      if (v) restored[Number(k)] = v
    })
    await submitQuizAnswers(quiz, restored)
  }

  if (!selectedQuiz) {
    const listBreadcrumbs = [
      studentDashboardCrumb(),
      { label: STUDENT_NAV.classContent, to: ROUTES.student.courses },
      ...(selectedClassId != null && selectedClassTitle
        ? [{ label: selectedClassTitle, to: ROUTES.student.coursesWithClass(selectedClassId) }]
        : []),
      { label: STUDENT_NAV.pendingQuizzes, to: ROUTES.student.quiz },
    ]

    return (
      <div className="panel-page quiz-answering-page">
        <PanelBreadcrumbs items={listBreadcrumbs} />
        <div className="panel-hero panel-hero--page">
          <p className="panel-kicker">Student · Learning</p>
          <h1>{STUDENT_NAV.pendingQuizzes}</h1>
          <p className="panel-hero-greeting">Quick access to quizzes across your classes, or open them from Class Content.</p>
        </div>

        {submitSuccess && (
          <div className="panel-alert panel-alert-success quiz-answering__alert-success">
            <strong>Quiz complete!</strong> {submitSuccess}
            <button
              type="button"
              className="panel-btn panel-btn-secondary panel-btn-sm quiz-answering__dismiss-btn"
              onClick={() => setSubmitSuccess(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        {error && <div className="panel-alert panel-alert-error">{error}</div>}
        {loading && <PanelSkeleton variant="cards" count={3} />}

        {!loading && joinedClasses.length === 0 && !error && (
          <PanelEmptyState
            icon="classes"
            title="No Classes Yet"
            description="Join a class with a join code to see quizzes from your instructors."
          />
        )}

        {!loading && joinedClasses.length > 0 && selectedClassId === null && (
          <>
            <p className="panel-section-kicker">Select a class</p>
            <div className="panel-grid">
              {joinedClasses.map((c) => {
                const n = quizzes.filter((q) => Number(q.class_id) === c.id).length
                return (
                  <ClassCard
                    key={c.id}
                    variant="icon"
                    classItem={c}
                    cardIcon="quiz"
                    cardIconColor="orange"
                    clickable
                    onClick={() => setSelectedClassId(c.id)}
                    descriptionFallback="View published quizzes for this class"
                    submeta={`${n} published quiz${n !== 1 ? 'zes' : ''}`}
                    actionLabel="Open quizzes →"
                  />
                )
              })}
            </div>
          </>
        )}

        {!loading && joinedClasses.length > 0 && selectedClassId !== null && (
          <>
            <div className="panel-context-bar">
              <div>
                <p className="panel-kicker">Selected class</p>
                <h2>{selectedClassTitle}</h2>
              </div>
              <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setSelectedClassId(null)}>
                ← Choose another class
              </button>
            </div>

            {quizzesForClass.length === 0 ? (
              <PanelEmptyState
                icon="quiz"
                title="No Published Quizzes"
                description={
                  <>
                    Your instructor has not published any quizzes for <strong>{selectedClassTitle}</strong> yet.
                    Quizzes appear here only after they are added in Manage Course.
                  </>
                }
              />
            ) : (
              <>
                <p className="panel-section-kicker">Quizzes in this class</p>
                <div className="panel-grid">
                {quizzesForClass.map((quiz) => {
                  const completed = isQuizCompleted(quiz.id)
                  const saved = !completed && studentId ? hasQuizProgress(studentId, quiz.id) : false
                  const lastScore = attemptScores[String(quiz.id)]
                  const prevAttempts = attemptCounts[String(quiz.id)] ?? 0
                  const maxReached = !!quiz.max_attempts && prevAttempts >= quiz.max_attempts
                  return (
                    <div key={quiz.id} className="panel-class-card panel-class-card--polished">
                      <div className="panel-class-card__icon panel-class-card__icon--orange">
                        <PanelIcon name="quiz" variant="card" color="orange" />
                      </div>
                      <h3>{quiz.title}</h3>
                      <p>{quiz.description || 'No description'}</p>
                      <span className="panel-meta">{quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}</span>
                      {quiz.time_limit_minutes && (
                        <span className="quiz-answering__setting-tag">⏱ {quiz.time_limit_minutes} min limit</span>
                      )}
                      {quiz.max_attempts && (
                        <span className="quiz-answering__setting-tag">
                          {prevAttempts}/{quiz.max_attempts} attempt{quiz.max_attempts > 1 ? 's' : ''} used
                        </span>
                      )}
                      {completed && (
                        <span className="quiz-answering__badge--completed">
                          Completed{lastScore !== undefined ? ` - ${lastScore}%` : ''}
                        </span>
                      )}
                      {saved && (
                        <span className="quiz-answering__badge--saved">
                          Progress saved
                        </span>
                      )}
                      <div className="panel-row quiz-answering__quiz-actions">
                        {maxReached ? (
                          <span className="quiz-answering__badge--blocked">Max attempts reached</span>
                        ) : completed && !maxReached ? (
                          <button
                            type="button"
                            className="panel-btn panel-btn-primary panel-btn-sm"
                            onClick={() => startQuizFresh(quiz, { allowRetake: true })}
                          >
                            Retake quiz →
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="panel-btn panel-btn-primary panel-btn-sm"
                              onClick={() => handleQuizSelect(quiz)}
                            >
                              {saved ? 'Continue Quiz →' : 'Start Quiz →'}
                            </button>
                            {saved && (
                              <button
                                type="button"
                                className="panel-btn panel-btn-secondary panel-btn-sm"
                                onClick={() => handleEndQuizFromSaved(quiz)}
                                disabled={submitting}
                                title="Submit your saved answers and finish the quiz"
                              >
                                {submitting ? 'Submitting...' : 'End quiz'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  const currentQuestion = selectedQuiz.questions[currentQuestionIndex]
  const selectedAnswer = answers[currentQuestionIndex]
  const isConfirmed = confirmed.has(currentQuestionIndex)
  const isCorrectAnswer = selectedAnswer === currentQuestion.correct_answer
  const isLast = currentQuestionIndex === selectedQuiz.questions.length - 1
  const progressPct = (confirmed.size / selectedQuiz.questions.length) * 100

  return (
    <div className="panel-page">
      <div className="panel-top-row">
        <div>
          <p className="panel-kicker">
            Question {currentQuestionIndex + 1} of {selectedQuiz.questions.length}
            {currentQuestion.question_type === 'true-false' && (
              <span className="quiz-answering__tf-tag">TRUE / FALSE</span>
            )}
          </p>
          <h2 className="quiz-answering__quiz-title">{selectedQuiz.title}</h2>
        </div>
        <div className="panel-row quiz-answering__header-actions">
          {timeLeft !== null && (
            <span className={`quiz-answering__timer${timeLeft <= 60 ? ' quiz-answering__timer--warning' : ''}`}>
              ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          <button
            type="button"
            className="panel-btn panel-btn-secondary panel-btn-sm"
            onClick={handleEndQuiz}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'End quiz'}
          </button>
          <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={exitToQuizList}>
            ← Back to quizzes
          </button>
        </div>
      </div>

      <div className="quiz-answering__progress-track">
        <div className="quiz-answering__progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="quiz-answering__progress-label">
        {confirmed.size} of {selectedQuiz.questions.length} confirmed
      </p>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {showResumedBanner && (
        <div className="panel-card quiz-answering__resumed-banner">
          <p className="quiz-answering__resumed-text">
            <strong>Progress restored.</strong> Your answers are saved automatically if you leave. Submit the quiz to finish and clear this save.
          </p>
          <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setShowResumedBanner(false)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="panel-card">
        <p className="quiz-answering__question-text">
          {currentQuestion.question_text}
        </p>

        {currentQuestion.options.map((option) => {
          const isSelected = selectedAnswer === option
          const showFeedback = isConfirmed && selectedQuiz.show_results_after === 'immediate'
          const isCorrectOpt = option === currentQuestion.correct_answer
          let optionModifier = ''
          if (showFeedback) {
            if (isCorrectOpt) {
              optionModifier = 'quiz-answering__option--correct'
            } else if (isSelected && !isCorrectOpt) {
              optionModifier = 'quiz-answering__option--incorrect'
            } else {
              optionModifier = 'quiz-answering__option--dimmed'
            }
          } else if (isConfirmed && isSelected) {
            optionModifier = 'quiz-answering__option--selected-only'
          }

          return (
            <label
              key={option}
              className={`panel-option${isSelected ? ' selected' : ''}${optionModifier ? ` ${optionModifier}` : ''}`}
            >
              <input
                type="radio"
                name="answer"
                value={option}
                checked={isSelected}
                disabled={isConfirmed}
                onChange={() => {
                  if (!isConfirmed) setAnswers({ ...answers, [currentQuestionIndex]: option })
                }}
              />
              <span className="quiz-answering__option-label">
                {option}
                {showFeedback && isConfirmed && isSelected && !isCorrectOpt && (
                  <span className="quiz-answering__tick--incorrect">✗</span>
                )}
              </span>
            </label>
          )
        })}

        {isConfirmed && selectedQuiz.show_results_after === 'immediate' && (
          <div className={isCorrectAnswer ? 'quiz-answering__feedback--correct' : 'quiz-answering__feedback--incorrect'}>
            <p className={isCorrectAnswer ? 'quiz-answering__feedback-title--correct' : 'quiz-answering__feedback-title--incorrect'}>
              {isCorrectAnswer ? 'Correct!' : '✗ Incorrect'}
            </p>
            {!isCorrectAnswer && (
              <p className="quiz-answering__feedback-answer">
                The correct answer is: <strong>{currentQuestion.correct_answer}</strong>
              </p>
            )}
            {currentQuestion.explanation && (
              <div className="quiz-answering__explanation-box">
                <p className="quiz-answering__explanation-text">
                  <span className="quiz-answering__explanation-label"> Explanation:</span>
                  {currentQuestion.explanation}
                </p>
              </div>
            )}
          </div>
        )}
        {isConfirmed && selectedQuiz.show_results_after !== 'immediate' && (
          <div className="quiz-answering__feedback--hidden">
            <p>Answer recorded. Results will be shown by your instructor.</p>
          </div>
        )}
      </div>

      <div className="panel-nav-row quiz-answering__nav-row">
        <button
          className="panel-btn panel-btn-secondary"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0}
        >
          ← Previous
        </button>

        <span className="panel-progress-text">
          {confirmed.size}/{selectedQuiz.questions.length} answered
        </span>

        {!isConfirmed ? (
          <button
            className="panel-btn panel-btn-primary quiz-answering__action-btn"
            onClick={handleConfirm}
            disabled={!selectedAnswer}
          >
            Confirm Answer →
          </button>
        ) : isLast ? (
          <button
            className="panel-btn panel-btn-success quiz-answering__action-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        ) : (
          <button
            className="panel-btn panel-btn-primary quiz-answering__action-btn"
            onClick={handleNext}
          >
            Next Question →
          </button>
        )}
      </div>
      <div className="panel-page-bottom-spacer" aria-hidden="true" />
    </div>
  )
}

export default QuizAnswering
