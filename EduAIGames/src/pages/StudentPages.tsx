import { lazy, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { BreakoutStudentGameData } from '../components/BreakoutGameQuiz'
import type { StudentGameData } from '../components/MazeGameQuiz'
import type { SnakeStudentGameData } from '../components/SnakeGameQuiz'
import type { RaceStudentGameData } from '../components/TriviaRaceGameQuiz'
import QuizAnswering from '../components/QuizAnswering'
import StudentCourses from '../components/StudentCourses'
import StudentDashboard from '../components/StudentDashboard'
import StudentGrades from '../components/StudentGrades'
import StudentJoinClass from '../components/StudentJoinClass'
import StudentMyClasses from '../components/StudentMyClasses'
import ProfileSettings from '../components/ProfileSettings'
import PanelSkeleton from '../components/PanelSkeleton'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routes/paths'

const MazeGameQuiz = lazy(() => import('../components/MazeGameQuiz'))
const SnakeGameQuiz = lazy(() => import('../components/SnakeGameQuiz'))
const BreakoutGameQuiz = lazy(() => import('../components/BreakoutGameQuiz'))
const TriviaRaceGameQuiz = lazy(() => import('../components/TriviaRaceGameQuiz'))

function GamePageLoader() {
  return <PanelSkeleton variant="cards" count={2} />
}

// Student dashboard route — wires navigation callbacks to sidebar destinations.
export function StudentDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <StudentDashboard
      user={user}
      onCourseClick={() => navigate(ROUTES.student.courses)}
      onOpenClassContent={(classId) => navigate(ROUTES.student.coursesWithClass(classId))}
      onJoinClassClick={() => navigate(ROUTES.student.join)}
      onMyClassesClick={() => navigate(ROUTES.student.classes)}
      onAnswerQuizClick={() => navigate(ROUTES.student.quiz)}
      onGradesClick={() => navigate(ROUTES.student.grades)}
      onReviewQuiz={(classId, quizId) =>
        navigate(ROUTES.student.grades, { state: { reviewClassId: classId, reviewQuizId: quizId } })
      }
      onEduBotClick={() => window.dispatchEvent(new CustomEvent('edugames:open-chatbot'))}
    />
  )
}

// Route wrapper for the enrolled classes list.
export function StudentClassesPage() {
  const { user } = useAuth()
  if (!user?.id) return null
  return <StudentMyClasses studentId={user.id} />
}

// Route wrapper for browsing and joining classes.
export function StudentJoinPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <StudentJoinClass
      studentId={user.id}
      onClassJoined={() => navigate(ROUTES.student.classes)}
    />
  )
}

// Course browser that launches quizzes and games via router state.
export function StudentCoursesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <StudentCourses
      studentId={user.id}
      onStartQuiz={(quizId, classId) =>
        navigate(ROUTES.student.quizSession(classId, quizId))
      }
      onStartGame={(gameId, quizId, title, description, ghostEnabled, gameType, settings) => {
        if (gameType === 'snake') {
          const studentGameData: SnakeStudentGameData = {
            gameId,
            quizId,
            gameType: 'snake',
            title,
            description,
            settings,
          }
          navigate(ROUTES.student.gameSnake, { state: { studentGameData } })
        } else if (gameType === 'breakout') {
          const studentGameData: BreakoutStudentGameData = {
            gameId,
            quizId,
            gameType: 'breakout',
            title,
            description,
            settings,
          }
          navigate(ROUTES.student.gameBreakout, { state: { studentGameData } })
        } else if (gameType === 'race') {
          const studentGameData: RaceStudentGameData = {
            gameId,
            quizId,
            gameType: 'race',
            title,
            description,
            settings,
          }
          navigate(ROUTES.student.gameRace, { state: { studentGameData } })
        } else {
          const studentGameData: StudentGameData = {
            gameId,
            quizId,
            title,
            description,
            ghostEnabled,
            settings,
          }
          navigate(ROUTES.student.gameMaze, { state: { studentGameData } })
        }
      }}
    />
  )
}

// Quiz answering route, optionally deep-linked with class and quiz IDs.
export function StudentQuizPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { classId, quizId } = useParams<{ classId?: string; quizId?: string }>()
  if (!user?.id) return null

  const initialClassId = classId ? parseInt(classId, 10) : null
  const initialQuizId = quizId ? parseInt(quizId, 10) : null

  return (
    <QuizAnswering
      studentId={user.id}
      initialClassId={Number.isFinite(initialClassId) ? initialClassId : null}
      initialQuizId={Number.isFinite(initialQuizId) ? initialQuizId : null}
      onSessionEnd={() => navigate(ROUTES.student.quiz, { replace: true })}
    />
  )
}

// Route wrapper for the student grades view.
export function StudentGradesPage() {
  const { user } = useAuth()
  const location = useLocation()
  const state = location.state as { reviewClassId?: number; reviewQuizId?: number } | null
  if (!user?.id) return null
  return (
    <StudentGrades
      studentId={user.id}
      initialClassId={state?.reviewClassId ?? null}
      initialReviewQuizId={state?.reviewQuizId ?? null}
    />
  )
}

// Profile and account settings for student.
export function StudentSettingsPage() {
  return <ProfileSettings />
}

type MazeGameLocationState = { studentGameData?: StudentGameData }
type SnakeGameLocationState = { studentGameData?: SnakeStudentGameData }
type BreakoutGameLocationState = { studentGameData?: BreakoutStudentGameData }
type RaceGameLocationState = { studentGameData?: RaceStudentGameData }

// Launches maze game play from router state; redirects if data is missing.
export function StudentMazeGamePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as MazeGameLocationState | null
  const studentGameData = state?.studentGameData

  useEffect(() => {
    if (!studentGameData) {
      navigate(ROUTES.student.courses, { replace: true })
    }
  }, [studentGameData, navigate])

  if (!studentGameData) return <GamePageLoader />

  return (
    <MazeGameQuiz
      studentGameData={studentGameData}
      onExit={() => navigate(ROUTES.student.courses)}
    />
  )
}

// Launches snake game play from router state; redirects if data is missing.
export function StudentSnakeGamePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as SnakeGameLocationState | null
  const studentGameData = state?.studentGameData

  useEffect(() => {
    if (!studentGameData) {
      navigate(ROUTES.student.courses, { replace: true })
    }
  }, [studentGameData, navigate])

  if (!studentGameData) return <GamePageLoader />

  return (
    <SnakeGameQuiz
      studentGameData={studentGameData}
      onExit={() => navigate(ROUTES.student.courses)}
    />
  )
}

// Launches breakout game play from router state; redirects if data is missing.
export function StudentBreakoutGamePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as BreakoutGameLocationState | null
  const studentGameData = state?.studentGameData

  useEffect(() => {
    if (!studentGameData) {
      navigate(ROUTES.student.courses, { replace: true })
    }
  }, [studentGameData, navigate])

  if (!studentGameData) return <GamePageLoader />

  return (
    <BreakoutGameQuiz
      studentGameData={studentGameData}
      onExit={() => navigate(ROUTES.student.courses)}
    />
  )
}

// Launches trivia race game play from router state; redirects if data is missing.
export function StudentRaceGamePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as RaceGameLocationState | null
  const studentGameData = state?.studentGameData

  useEffect(() => {
    if (!studentGameData) {
      navigate(ROUTES.student.courses, { replace: true })
    }
  }, [studentGameData, navigate])

  if (!studentGameData) return <GamePageLoader />

  return (
    <TriviaRaceGameQuiz
      studentGameData={studentGameData}
      onExit={() => navigate(ROUTES.student.courses)}
    />
  )
}
