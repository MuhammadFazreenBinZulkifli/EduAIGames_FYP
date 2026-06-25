import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../routes/paths'
import { endImpersonation, getImpersonationBackup } from '../utils/impersonationStorage'
import './App_CSS/ImpersonationBanner_CSS.css'

// Shows a banner when a super admin is impersonating another user.
export default function ImpersonationBanner() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const backup = getImpersonationBackup()

  if (!backup || !user) return null

  // Restores the super admin session and navigates back to the admin panel.
  const handleReturn = () => {
    const superAdmin = endImpersonation()
    if (superAdmin) {
      login(superAdmin)
      navigate(ROUTES.superAdmin, { replace: true })
    }
  }

  return (
    <div role="status" className="impersonation-banner">
      <span>
        <strong>Impersonation mode:</strong> viewing as {user.username} ({user.role}). Actions are logged.
      </span>
      <button type="button" className="impersonation-banner__return-btn" onClick={handleReturn}>
        Return to Super Admin
      </button>
    </div>
  )
}
