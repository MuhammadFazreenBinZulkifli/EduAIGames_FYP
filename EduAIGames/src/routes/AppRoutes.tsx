import { Navigate, Route, Routes } from 'react-router-dom'
import InstructorLayout from '../layouts/InstructorLayout'
import StudentLayout from '../layouts/StudentLayout'
import PanelNotFound from '../components/PanelNotFound'
import {
  AdminPage,
  HomePage,
  LoginPage,
  PublicNotFoundPage,
  RegisterPage,
  SuperAdminPage,
} from '../pages/PublicPages'
import {
  InstructorClassManagePage,
  InstructorClassMembersPage,
  InstructorClassQuizzesPage,
  InstructorClassesPage,
  InstructorDashboardPage,
  InstructorLibraryPage,
  InstructorLibraryQuizEditPage,
  InstructorPerformancePage,
  InstructorSettingsPage,
  InstructorStudioBreakoutPage,
  InstructorStudioMazePage,
  InstructorStudioPage,
  InstructorStudioQuizPage,
  InstructorStudioRacePage,
  InstructorStudioSnakePage,
} from '../pages/InstructorPages'
import {
  StudentBreakoutGamePage,
  StudentClassesPage,
  StudentCoursesPage,
  StudentDashboardPage,
  StudentGradesPage,
  StudentJoinPage,
  StudentMazeGamePage,
  StudentQuizPage,
  StudentRaceGamePage,
  StudentSettingsPage,
  StudentSnakeGamePage,
} from '../pages/StudentPages'
import ProtectedRoute from './ProtectedRoute'
import GuestRoute from './GuestRoute'
import { ROUTES } from './paths'

// Top-level route table wiring public, student, instructor, and admin pages.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.home} element={<HomePage />} />

      <Route element={<GuestRoute />}>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.register} element={<RegisterPage />} />
      </Route>

      <Route
        path={ROUTES.admin}
        element={
          <ProtectedRoute roles={['Admin']}>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path={ROUTES.superAdmin}
        element={
          <ProtectedRoute roles={['SuperAdmin']}>
            <SuperAdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/instructor"
        element={
          <ProtectedRoute roles={['Instructor']}>
            <InstructorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={ROUTES.instructor.dashboard} replace />} />
        <Route path="dashboard" element={<InstructorDashboardPage />} />
        <Route path="classes" element={<InstructorClassesPage />} />
        <Route path="classes/:classId" element={<InstructorClassManagePage />} />
        <Route path="classes/:classId/members" element={<InstructorClassMembersPage />} />
        <Route path="classes/:classId/quizzes" element={<InstructorClassQuizzesPage />} />
        <Route path="studio" element={<InstructorStudioPage />} />
        <Route path="studio/quiz" element={<InstructorStudioQuizPage />} />
        <Route path="studio/maze" element={<InstructorStudioMazePage />} />
        <Route path="studio/snake" element={<InstructorStudioSnakePage />} />
        <Route path="studio/breakout" element={<InstructorStudioBreakoutPage />} />
        <Route path="studio/race" element={<InstructorStudioRacePage />} />
        <Route path="performance" element={<InstructorPerformancePage />} />
        <Route path="library" element={<InstructorLibraryPage />} />
        <Route path="library/quiz/:quizId/edit" element={<InstructorLibraryQuizEditPage />} />
        <Route path="settings" element={<InstructorSettingsPage />} />
        <Route path="*" element={<PanelNotFound />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute roles={['Student']}>
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to={ROUTES.student.dashboard} replace />} />
        <Route path="dashboard" element={<StudentDashboardPage />} />
        <Route path="classes" element={<StudentClassesPage />} />
        <Route path="join" element={<StudentJoinPage />} />
        <Route path="courses" element={<StudentCoursesPage />} />
        <Route path="quiz" element={<StudentQuizPage />} />
        <Route path="quiz/:classId/:quizId" element={<StudentQuizPage />} />
        <Route path="grades" element={<StudentGradesPage />} />
        <Route path="settings" element={<StudentSettingsPage />} />
        <Route path="games/maze" element={<StudentMazeGamePage />} />
        <Route path="games/snake" element={<StudentSnakeGamePage />} />
        <Route path="games/breakout" element={<StudentBreakoutGamePage />} />
        <Route path="games/race" element={<StudentRaceGamePage />} />
        <Route path="*" element={<PanelNotFound />} />
      </Route>

      <Route path="*" element={<PublicNotFoundPage />} />
    </Routes>
  )
}
