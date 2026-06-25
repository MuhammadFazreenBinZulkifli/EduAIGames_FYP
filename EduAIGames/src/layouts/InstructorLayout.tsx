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
import { INSTRUCTOR_NAV } from '../utils/panelBreadcrumbHelpers'
import { shouldHideMobileNavByPath } from '../utils/mobileNavUtils'
import { clearAllRecents, getRecents, RECENTS_EVENT } from '../utils/sidebarRecents'
import { API_BASE_URL } from '../config'
import '../components/App_CSS/ShellPanel_CSS.css'

function navClass({ isActive }: { isActive: boolean }) {
  return `app-sidebar-item${isActive ? ' active' : ''}`
}

function isClassesSection(pathname: string) {
  return pathname.startsWith('/instructor/classes')
}

function isStudioSection(pathname: string) {
  return pathname.startsWith('/instructor/studio')
}

// Static sub-nav for Content Maker (quiz + game builder routes).
const STUDIO_SUBNAV: SubNavItem[] = [
  { label: 'Create Quiz', to: ROUTES.instructor.studioQuiz },
  { label: 'Maze Quest', to: ROUTES.instructor.studioMaze },
  { label: 'Snake Race', to: ROUTES.instructor.studioSnake },
  { label: 'Breakout Blast', to: ROUTES.instructor.studioBreakout },
  { label: 'Trivia Race', to: ROUTES.instructor.studioRace },
]

// Static sub-nav for Library (tab shortcuts).
const LIBRARY_SUBNAV: SubNavItem[] = [
  { label: 'Quizzes', to: `${ROUTES.instructor.library}?tab=quizzes` },
  { label: 'Games', to: `${ROUTES.instructor.library}?tab=games` },
]

// Inner shell component that reads the sidebar context for collapse state.
function InstructorShell() {
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

  // Dynamic sub-nav: recently managed classes (isolated to this user's account).
  const userId = user?.id ?? 0
  const [classRecents, setClassRecents] = useState<SubNavItem[]>(() =>
    getRecents('instructor-classes', userId).map((r) => ({ label: r.label, to: r.path }))
  )

  // Refresh recents when the sidebar recents event fires or pathname changes.
  useEffect(() => {
    const refresh = () => {
      setClassRecents(getRecents('instructor-classes', userId).map((r) => ({ label: r.label, to: r.path })))
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
            panelLabel="Instructor Panel"
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
          aria-label="Instructor navigation"
        >
          <SidebarBrand
            subtitle="Instructor Panel"
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

          <nav className="app-sidebar-nav" aria-label="Instructor navigation">
            {!collapsed && <p className="app-sidebar-nav-label">Home</p>}
            <SidebarNavItem
              to={ROUTES.instructor.dashboard}
              end
              label="Dashboard"
              hint="Overview & activity"
              icon={<SidebarIcon name="dashboard" />}
            />

            {!collapsed && <p className="app-sidebar-nav-label">Teaching</p>}
            <SidebarNavItem
              to={ROUTES.instructor.classes}
              label={INSTRUCTOR_NAV.myClasses}
              hint="Manage classes & students"
              icon={<SidebarIcon name="classes" />}
              isActive={isClassesSection(pathname)}
              subItems={classRecents}
              allItemsTo={ROUTES.instructor.classes}
              allItemsLabel="All classes"
            />
            <SidebarNavItem
              to={ROUTES.instructor.library}
              label={INSTRUCTOR_NAV.library}
              hint="All quizzes & saved games"
              icon={<SidebarIcon name="library" />}
              subItems={LIBRARY_SUBNAV}
              allItemsTo={ROUTES.instructor.library}
              allItemsLabel="Open library"
            />
            {features.games_enabled && (
              <SidebarNavItem
                to={ROUTES.instructor.studio}
                label={INSTRUCTOR_NAV.contentMaker}
                hint="Create quizzes and games"
                icon={<SidebarIcon name="studio" />}
                isActive={isStudioSection(pathname)}
                subItems={STUDIO_SUBNAV}
                allItemsTo={ROUTES.instructor.studio}
                allItemsLabel="All games"
              />
            )}

            {!collapsed && <p className="app-sidebar-nav-label">Insights</p>}
            <SidebarNavItem
              to={ROUTES.instructor.performance}
              label={INSTRUCTOR_NAV.performance}
              hint="Grades & class analytics"
              icon={<SidebarIcon name="performance" />}
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
              to={ROUTES.instructor.settings}
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
          <PanelErrorBoundary fallbackPath={ROUTES.instructor.dashboard} fallbackLabel="Back to dashboard">
            <Suspense fallback={<PanelSkeleton variant="cards" count={2} />}>
              <Outlet />
            </Suspense>
          </PanelErrorBoundary>
        </main>

        {/* Static EduBot side panel — desktop only, visible when sidebar is collapsed */}
        {showSideEdubot && (
          <div className="app-shell-edubot-col">
            <SideEduBot
              role={'Instructor' as ChatbotRole}
              username={user.username}
              userId={user.id}
            />
          </div>
        )}
      </div>

      {/* Floating chatbot — hidden on desktop when side panel is active */}
      <AIChatbot
        role={'Instructor' as ChatbotRole}
        username={user.username}
        userId={user.id}
        hidden={!chatbotVisible || showSideEdubot || immersive}
      />
    </>
  )
}

// Shell layout with sidebar navigation and instructor chatbot.
export default function InstructorLayout() {
  return (
    <SidebarProvider>
      <MobileNavProvider>
        <InstructorShell />
      </MobileNavProvider>
    </SidebarProvider>
  )
}
