import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import AIChatbot from '../components/AIChatbot'
import SideEduBot from '../components/SideEduBot'
import PanelErrorBoundary from '../components/PanelErrorBoundary'
import PanelSkeleton from '../components/PanelSkeleton'
import { shouldShowChatbot, type ChatbotRole } from '../utils/chatbotUtils'
import MobileShellHeader from '../components/MobileShellHeader'
import SidebarBrand from '../components/SidebarBrand'
import SidebarIcon from '../components/SidebarIcons'
import SidebarNavItem, { type SubNavItem } from '../components/SidebarNavItem'
import UserAvatar from '../components/UserAvatar'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { SidebarProvider, useSidebar } from '../context/SidebarContext'
import { MobileNavProvider, useMobileNav } from '../context/MobileNavContext'
import { useRoleSessionTimeout } from '../hooks/useRoleSessionTimeout'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import { ROUTES } from '../routes/paths'
import { STUDENT_NAV } from '../utils/panelBreadcrumbHelpers'
import { shouldHideMobileNavByPath } from '../utils/mobileNavUtils'
import { clearAllRecents, getRecents, RECENTS_EVENT } from '../utils/sidebarRecents'
import { API_BASE_URL } from '../config'
import '../components/App_CSS/ShellPanel_CSS.css'

function navClass({ isActive }: { isActive: boolean }) {
  return `app-sidebar-item${isActive ? ' active' : ''}`
}

function isContentSection(pathname: string) {
  return (
    pathname.startsWith('/student/courses') ||
    pathname.startsWith('/student/quiz') ||
    pathname.startsWith('/student/games')
  )
}

// Inner shell component that reads the sidebar context for collapse state.
function StudentShell() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { collapsed, toggle } = useSidebar()
  const { immersive } = useMobileNav()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  const hideMobileNav = immersive || shouldHideMobileNavByPath(pathname)

  useRoleSessionTimeout()
  usePageTitle()
  const { features } = usePlatformFeatures()
  const contentActive = isContentSection(pathname)

  // Dynamic sub-nav: recently opened class content (isolated to this user's account).
  const userId = user?.id ?? 0
  const [contentRecents, setContentRecents] = useState<SubNavItem[]>(() =>
    getRecents('student-content', userId).map((r) => ({ label: r.label, to: r.path }))
  )

  // Refresh recents when the sidebar recents event fires or pathname changes.
  useEffect(() => {
    const refresh = () => {
      setContentRecents(getRecents('student-content', userId).map((r) => ({ label: r.label, to: r.path })))
    }
    window.addEventListener(RECENTS_EVENT, refresh)
    refresh()
    return () => window.removeEventListener(RECENTS_EVENT, refresh)
  }, [pathname, userId])

  // Close mobile nav on route change.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // Sync body class for scroll lock.
  useEffect(() => {
    document.body.classList.toggle('mobile-nav-open', mobileNavOpen)
    return () => document.body.classList.remove('mobile-nav-open')
  }, [mobileNavOpen])

  // Swipe-left on the sidebar to close (touch UX).
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    let startX = 0
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX }
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX
      if (dx < -48) setMobileNavOpen(false)
    }
    sidebar.addEventListener('touchstart', onTouchStart, { passive: true })
    sidebar.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      sidebar.removeEventListener('touchstart', onTouchStart)
      sidebar.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    if (!user?.id || user.avatarUrl !== undefined) return
    fetch(`${API_BASE_URL}/api/profile/${user.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile?.avatar_url !== undefined) {
          updateUser({ avatarUrl: data.profile.avatar_url ?? null })
        }
      })
      .catch(() => { /* non-fatal */ })
  }, [user?.id])

  const handleLogout = () => {
    clearAllRecents(userId)
    logout()
    navigate(ROUTES.home, { replace: true })
  }

  if (!user) return null
  const chatbotVisible = shouldShowChatbot(pathname, user, features)
  // Show EduBot as a static side panel when the sidebar is collapsed (desktop only).
  // The floating chatbot is hidden at the same time to avoid duplication.
  // Hide both EduBot surfaces while a game/quiz is in immersive play.
  const showSideEdubot = collapsed && chatbotVisible && !immersive

  return (
    <>
      <div className={`app-shell${collapsed ? ' sidebar-is-collapsed' : ''}${showSideEdubot ? ' has-side-edubot' : ''}${mobileNavOpen ? ' mobile-nav-open' : ''}${hideMobileNav ? ' app-shell--immersive' : ''}`}>
        {!hideMobileNav && (
          <MobileShellHeader
            panelLabel="Student Panel"
            menuOpen={mobileNavOpen}
            onToggleMenu={() => setMobileNavOpen((o) => !o)}
          />
        )}

        {/* Backdrop — tap outside the drawer to close */}
        <button
          type="button"
          className="mobile-nav-backdrop"
          aria-label="Close navigation menu"
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />

        <aside
          id="mobile-sidebar"
          ref={sidebarRef}
          className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`}
          aria-label="Student navigation"
        >
          <SidebarBrand
            subtitle="Student Panel"
            userId={typeof user.id === 'number' ? user.id : undefined}
          />

          {/* User badge */}
          <div className="app-sidebar-user">
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
            <div className="app-sidebar-user-text">
              <p className="app-sidebar-user-name">{user.username}</p>
              <span className="app-sidebar-user-role">{user.role}</span>
            </div>
            <ThemeToggle className="app-sidebar-user-theme" />
          </div>

          <nav className="app-sidebar-nav" aria-label="Student navigation">
            {!collapsed && <p className="app-sidebar-nav-label">Home</p>}
            <SidebarNavItem
              to={ROUTES.student.dashboard}
              end
              label="Dashboard"
              hint="Overview & shortcuts"
              icon={<SidebarIcon name="dashboard" />}
            />

            {!collapsed && <p className="app-sidebar-nav-label">Enrolment</p>}
            <SidebarNavItem
              to={ROUTES.student.classes}
              label={STUDENT_NAV.enrolledClasses}
              hint="Membership & codes"
              icon={<SidebarIcon name="classes" />}
            />
            <SidebarNavItem
              to={ROUTES.student.join}
              label={STUDENT_NAV.joinClass}
              hint="Browse or enter a code"
              icon={<SidebarIcon name="join" />}
            />

            {!collapsed && <p className="app-sidebar-nav-label">Learning</p>}
            <SidebarNavItem
              to={ROUTES.student.courses}
              label={STUDENT_NAV.classContent}
              hint="Materials, quizzes & games"
              icon={<SidebarIcon name="content" />}
              isActive={contentActive}
              subItems={contentRecents}
              allItemsTo={ROUTES.student.courses}
              allItemsLabel="All classes"
            />
            <SidebarNavItem
              to={ROUTES.student.grades}
              label={STUDENT_NAV.myGrades}
              hint="Scores & feedback"
              icon={<SidebarIcon name="grades" />}
            />
          </nav>

          {/* Desktop collapse toggle (hidden on mobile by CSS) */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="sidebar-collapse-btn__icon" aria-hidden="true">
              {collapsed ? '»' : '«'}
            </span>
            {!collapsed && <span className="sidebar-collapse-btn__label">Collapse</span>}
          </button>

          <div className="app-sidebar-footer">
            <NavLink
              to={ROUTES.student.settings}
              className={navClass}
              title={collapsed ? 'Settings' : undefined}
              aria-label={collapsed ? 'Settings' : undefined}
            >
              <span className="app-sidebar-item-icon-wrap">
                <SidebarIcon name="settings" />
              </span>
              {!collapsed && (
                <span className="app-sidebar-item-body">
                  <span className="app-sidebar-item-label">Settings</span>
                </span>
              )}
            </NavLink>
            <button
              type="button"
              className="app-sidebar-logout"
              onClick={handleLogout}
              title={collapsed ? 'Logout' : undefined}
              aria-label={collapsed ? 'Logout' : undefined}
            >
              <span className="app-sidebar-item-icon-wrap">
                <SidebarIcon name="logout" />
              </span>
              {!collapsed && (
                <span className="app-sidebar-item-body">
                  <span className="app-sidebar-item-label">Logout</span>
                </span>
              )}
            </button>
          </div>
        </aside>

        <main className="app-shell-content">
          <PanelErrorBoundary fallbackPath={ROUTES.student.dashboard} fallbackLabel="Back to dashboard">
            <Suspense fallback={<PanelSkeleton variant="cards" count={2} />}>
              <Outlet />
            </Suspense>
          </PanelErrorBoundary>
        </main>

        {/* Static EduBot side panel — desktop only, visible when sidebar is collapsed */}
        {showSideEdubot && (
          <div className="app-shell-edubot-col">
            <SideEduBot
              role={'Student' as ChatbotRole}
              username={user.username}
              userId={user.id}
            />
          </div>
        )}
      </div>

      {/* Floating chatbot — hidden on desktop when side panel is active */}
      <AIChatbot
        role={'Student' as ChatbotRole}
        username={user.username}
        userId={user.id}
        hidden={!chatbotVisible || showSideEdubot || immersive}
      />
    </>
  )
}

// Shell layout with sidebar navigation and student chatbot.
export default function StudentLayout() {
  return (
    <SidebarProvider>
      <MobileNavProvider>
        <StudentShell />
      </MobileNavProvider>
    </SidebarProvider>
  )
}
