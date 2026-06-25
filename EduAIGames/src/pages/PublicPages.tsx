import { useLocation, useNavigate } from 'react-router-dom'
import AdminDashboard from '../components/AdminDashboard'
import AIChatbot from '../components/AIChatbot'
import FrontPage from '../components/FrontPage'
import Login from '../components/Login'
import Registration from '../components/Registration'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import { ROUTES } from '../routes/paths'
import type { User } from '../types/user'
import { startImpersonation } from '../utils/impersonationStorage'
import { shouldShowChatbot } from '../utils/chatbotUtils'

// Picks the default dashboard route based on the user's role.
function redirectPathForUser(user: User) {
  if (user.role === 'SuperAdmin') return ROUTES.superAdmin
  if (user.role === 'Admin') return ROUTES.admin
  if (user.role === 'Instructor') return ROUTES.instructor.dashboard
  return ROUTES.student.dashboard
}

// Public landing page with guest chatbot access.
export function HomePage() {
  const navigate = useNavigate()
  const { features } = usePlatformFeatures()
  usePageTitle()
  const showChatbot = shouldShowChatbot('/', null, features)

  return (
    <>
      <FrontPage
        onStartLogin={() => navigate(ROUTES.login)}
        onStartRegister={() => navigate(ROUTES.register)}
      />
      <AIChatbot role="Guest" hidden={!showChatbot} />
    </>
  )
}

// Wraps the login form and redirects after successful sign-in.
export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  usePageTitle()

  return (
    <Login
      onLogin={(user) => {
        login(user)
        const from = (location.state as { from?: string } | null)?.from
        const target = from && from !== ROUTES.login ? from : redirectPathForUser(user)
        navigate(target, { replace: true })
      }}
      onSwitchToRegister={() => navigate(ROUTES.register)}
      onBackToFrontPage={() => navigate(ROUTES.home)}
    />
  )
}

// Registration route wrapper.
export function RegisterPage() {
  const navigate = useNavigate()
  usePageTitle()
  return (
    <Registration
      onSwitchToLogin={() => navigate(ROUTES.login)}
      onBackToFrontPage={() => navigate(ROUTES.home)}
    />
  )
}

// Admin dashboard route for standard admin accounts.
export function AdminPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  if (!user?.id) return null

  const handleLogout = () => {
    logout()
    navigate(ROUTES.home, { replace: true })
  }

  return (
    <AdminDashboard
      adminId={user.id}
      adminEmail={user.email}
      onLogout={handleLogout}
      institutionName={user.institution_name ?? undefined}
      planName={user.plan_name ?? undefined}
    />
  )
}

// Public 404 for unknown routes outside student/instructor shells.
export function PublicNotFoundPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  usePageTitle()

  const goHome = () => navigate(ROUTES.home, { replace: true })
  const goDashboard = () => {
    if (!user) {
      goHome()
      return
    }
    navigate(redirectPathForUser(user), { replace: true })
  }

  return (
    <div className="public-not-found">
      <div className="public-not-found__card">
        <p className="public-not-found__code">404</p>
        <h1 className="public-not-found__title">Page not found</h1>
        <p className="public-not-found__text">
          The page you requested does not exist or may have moved.
        </p>
        <div className="public-not-found__actions">
          <button type="button" className="panel-btn panel-btn-primary" onClick={goHome}>
            Back to home
          </button>
          {user && (
            <button type="button" className="panel-btn panel-btn-secondary" onClick={goDashboard}>
              Go to dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Super-admin dashboard with impersonation support.
export function SuperAdminPage() {
  const navigate = useNavigate()
  const { user, login, logout } = useAuth()
  if (!user?.id) return null

  const handleLogout = () => {
    logout()
    navigate(ROUTES.home, { replace: true })
  }

  return (
    <AdminDashboard
      adminId={user.id}
      adminEmail={user.email}
      onLogout={handleLogout}
      isSuperAdmin
      onImpersonate={(target) => {
        startImpersonation(user, target as User)
        login(target as User)
        if (target.role === 'Instructor') navigate(ROUTES.instructor.dashboard, { replace: true })
        else navigate(ROUTES.student.dashboard, { replace: true })
      }}
    />
  )
}
