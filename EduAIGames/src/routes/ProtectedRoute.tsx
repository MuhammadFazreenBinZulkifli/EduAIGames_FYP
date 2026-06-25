import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/user'
import { ROUTES } from './paths'

interface ProtectedRouteProps {
  children: React.ReactNode
  roles?: UserRole[]
}

// Redirects unauthenticated or unauthorized users away from protected pages.
export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'SuperAdmin') return <Navigate to={ROUTES.superAdmin} replace />
    if (user.role === 'Admin') return <Navigate to={ROUTES.admin} replace />
    if (user.role === 'Instructor') return <Navigate to={ROUTES.instructor.dashboard} replace />
    if (user.role === 'Student') return <Navigate to={ROUTES.student.dashboard} replace />
    return <Navigate to={ROUTES.home} replace />
  }

  return <>{children}</>
}
