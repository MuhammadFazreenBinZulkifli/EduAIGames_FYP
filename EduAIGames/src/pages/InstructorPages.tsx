import { lazy } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CourseCreation from '../components/CourseCreation'
import ProfileSettings from '../components/ProfileSettings'
import InstructorClassManagement from '../components/InstructorClassManagement'
import InstructorClassMembers from '../components/InstructorClassMembers'
import InstructorDashboard from '../components/InstructorDashboard'
import InstructorManageClass from '../components/InstructorManageClass'
import InstructorQuizLibrary from '../components/InstructorQuizLibrary'
import QuizCreation from '../components/QuizCreation'
import StudentPerformance from '../components/StudentPerformance'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routes/paths'

const MazeGameQuiz = lazy(() => import('../components/MazeGameQuiz'))
const SnakeGameQuiz = lazy(() => import('../components/SnakeGameQuiz'))
const BreakoutGameQuiz = lazy(() => import('../components/BreakoutGameQuiz'))
const TriviaRaceGameQuiz = lazy(() => import('../components/TriviaRaceGameQuiz'))

// Instructor dashboard route with navigation to key modules.
export function InstructorDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const handleAiQuizClick = () => {
    navigate(`${ROUTES.instructor.studioQuiz}?openAi=1`)
  }

  return (
    <InstructorDashboard
      user={user}
      onCourseClick={() => navigate(ROUTES.instructor.studio)}
      onStudentPerformanceClick={() => navigate(ROUTES.instructor.performance)}
      onClassClick={() => navigate(ROUTES.instructor.classes)}
      onCreateQuizClick={() => navigate(ROUTES.instructor.studioQuiz)}
      onAiQuizClick={handleAiQuizClick}
      onLibraryClick={() => navigate(ROUTES.instructor.library)}
    />
  )
}

// Route wrapper for class list and management actions.
export function InstructorClassesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <InstructorClassManagement
      instructorId={user.id}
      onManageQuizzes={(classId) => navigate(ROUTES.instructor.classQuizzes(classId))}
      onManageCourse={(classId) => navigate(ROUTES.instructor.classManage(classId))}
      onViewClass={(classId) => navigate(ROUTES.instructor.classMembers(classId))}
    />
  )
}

// Course content editor for a single class (topics, files, quizzes, games).
export function InstructorClassManagePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { classId } = useParams<{ classId: string }>()
  const parsedClassId = classId ? parseInt(classId, 10) : undefined
  if (!user?.id) return null

  return (
    <InstructorManageClass
      instructorId={user.id}
      classId={parsedClassId}
      onBack={() => navigate(ROUTES.instructor.classes)}
      onCreateQuiz={() => navigate(ROUTES.instructor.studioQuiz)}
    />
  )
}

// Route wrapper for viewing and managing class members.
export function InstructorClassMembersPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { classId } = useParams<{ classId: string }>()
  if (!user?.id) return null

  return (
    <InstructorClassMembers
      instructorId={user.id}
      classId={classId ? parseInt(classId, 10) : undefined}
      onBack={() => navigate(ROUTES.instructor.classes)}
    />
  )
}

// Quiz creation route scoped to a specific class.
export function InstructorClassQuizzesPage() {
  const { user } = useAuth()
  const { classId } = useParams<{ classId: string }>()
  if (!user?.id) return null

  return (
    <QuizCreation
      instructorId={user.id}
      classId={classId ? parseInt(classId, 10) : undefined}
    />
  )
}

// Content Maker hub for building quizzes and quiz-based games.
export function InstructorStudioPage() {
  const navigate = useNavigate()
  return (
    <CourseCreation
      onCreateQuiz={() => navigate(ROUTES.instructor.studioQuiz)}
      onCreateGame={() => navigate(ROUTES.instructor.studioMaze)}
      onCreateSnakeGame={() => navigate(ROUTES.instructor.studioSnake)}
      onCreateBreakoutGame={() => navigate(ROUTES.instructor.studioBreakout)}
      onCreateRaceGame={() => navigate(ROUTES.instructor.studioRace)}
    />
  )
}

// Create a library quiz from Content Maker (usable across all classes).
export function InstructorStudioQuizPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <QuizCreation
      instructorId={user.id}
      libraryMode
      onExit={() => navigate(ROUTES.instructor.library)}
    />
  )
}

// Edit a library quiz from the Library page.
export function InstructorLibraryQuizEditPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { quizId } = useParams<{ quizId: string }>()
  const parsedQuizId = quizId ? parseInt(quizId, 10) : undefined
  if (!user?.id) return null

  return (
    <QuizCreation
      instructorId={user.id}
      libraryMode
      editQuizId={parsedQuizId}
      onExit={() => navigate(ROUTES.instructor.library)}
    />
  )
}

// Instructor maze game builder in Content Maker.
export function InstructorStudioMazePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <MazeGameQuiz
      instructorId={user.id}
      onExit={() => navigate(ROUTES.instructor.studio)}
    />
  )
}

// Instructor snake game builder in Course Studio.
export function InstructorStudioSnakePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <SnakeGameQuiz
      instructorId={user.id}
      onExit={() => navigate(ROUTES.instructor.studio)}
    />
  )
}

// Instructor breakout game builder in Course Studio.
export function InstructorStudioBreakoutPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <BreakoutGameQuiz
      instructorId={user.id}
      onExit={() => navigate(ROUTES.instructor.studio)}
    />
  )
}

// Instructor trivia race game builder in Course Studio.
export function InstructorStudioRacePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.id) return null

  return (
    <TriviaRaceGameQuiz
      instructorId={user.id}
      onExit={() => navigate(ROUTES.instructor.studio)}
    />
  )
}

// Route wrapper for the student performance analytics view.
export function InstructorPerformancePage() {
  const { user } = useAuth()
  if (!user?.id) return null
  return <StudentPerformance instructorId={user.id} />
}

// Route wrapper for the instructor quiz and game library.
export function InstructorLibraryPage() {
  const { user } = useAuth()
  if (!user?.id) return null
  return <InstructorQuizLibrary instructorId={user.id} />
}

// Profile and account settings for instructor.
export function InstructorSettingsPage() {
  return <ProfileSettings />
}
