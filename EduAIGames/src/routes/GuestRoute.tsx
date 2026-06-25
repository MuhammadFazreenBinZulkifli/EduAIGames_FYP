import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from './paths'

/** Redirect logged-in users away from login/register to their home. */
export default function GuestRoute() {
  const { user } = useAuth()

  if (user) {
    if (user.role === 'SuperAdmin') return <Navigate to={ROUTES.superAdmin} replace />
    if (user.role === 'Admin') return <Navigate to={ROUTES.admin} replace />
    if (user.role === 'Instructor') return <Navigate to={ROUTES.instructor.dashboard} replace />
    if (user.role === 'Student') return <Navigate to={ROUTES.student.dashboard} replace />
  }

  return <Outlet />
}
