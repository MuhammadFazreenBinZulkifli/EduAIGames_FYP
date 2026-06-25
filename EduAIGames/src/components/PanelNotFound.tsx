import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import PanelEmptyState from './PanelEmptyState'

// Shown inside student/instructor shells for unknown panel routes.
export default function PanelNotFound() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dashboard = pathname.startsWith('/instructor')
    ? ROUTES.instructor.dashboard
    : ROUTES.student.dashboard

  return (
    <PanelEmptyState
      icon="alert"
      title="Page not found"
      description="That link does not exist or may have moved. Return to your dashboard to continue."
      action={{ label: 'Go to dashboard', onClick: () => navigate(dashboard) }}
    />
  )
}
