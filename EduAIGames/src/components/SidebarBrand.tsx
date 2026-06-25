import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import './App_CSS/ShellPanel_CSS.css'

const LOGO_SRC = '/EduAIGames_logo.png'

interface SidebarBrandProps {
  subtitle: string
  userId?: number
}

// Sidebar header with logo, notifications, and theme toggle.
export default function SidebarBrand({ subtitle, userId }: SidebarBrandProps) {
  return (
    <div className="app-sidebar-brand">
      <img src={LOGO_SRC} alt="" className="app-sidebar-logo-img" />
      <div className="app-sidebar-brand-text">
        <div className="app-sidebar-brand-title-row">
          <p className="app-sidebar-brand-title">EduAIGames</p>
          <div className="app-sidebar-brand-actions">
            {userId != null && <NotificationBell userId={userId} />}
            <ThemeToggle />
          </div>
        </div>
        <p className="app-sidebar-brand-subtitle">{subtitle}</p>
      </div>
    </div>
  )
}
