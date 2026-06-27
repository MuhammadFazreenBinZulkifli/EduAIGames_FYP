import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api/client'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import { formatTimeAgo } from '../utils/formatTimeAgo'
import { notificationTargetPath } from '../utils/notificationNavigation'
import { ROUTES } from '../routes/paths'
import type { NotificationType } from './NotificationBell'
import OnboardingChecklist from './OnboardingChecklist'
import DashboardIcon from './DashboardIcon'
import WebsiteGuideModal from './WebsiteGuideModal'
import { fetchPreferences, updatePreferences } from '../hooks/useUserPreferences'
import type { IconName } from './SidebarIcons'
import './App_CSS/PanelDashboard_CSS.css'

interface ActivityItem {
  id: number
  type: NotificationType
  title: string
  body: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

interface User {
  id?: number
  username: string
  email: string
  role: 'Instructor' | 'Student' | 'Admin' | 'SuperAdmin'
  avatarUrl?: string | null
}

interface InstructorDashboardProps {
  user: User
  onCourseClick?: () => void
  onStudentPerformanceClick?: () => void
  onClassClick?: () => void
  onCreateQuizClick?: () => void
  onAiQuizClick?: () => void
  onLibraryClick?: () => void
}

interface DashboardStats {
  classCount: number
  quizCount: number
  gameCount: number
  publicClasses: number
}

interface ClassItem {
  id: number
  title: string
  description: string
  visibility: string
  background_image?: string | null
}

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Landing page for instructors — hero banner, class list, colorful action tiles.
function InstructorDashboard({
  user,
  onCourseClick,
  onStudentPerformanceClick,
  onClassClick,
  onCreateQuizClick,
  onAiQuizClick,
  onLibraryClick,
}: InstructorDashboardProps) {
  const navigate = useNavigate()
  const { features } = usePlatformFeatures()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    classCount: 0,
    quizCount: 0,
    gameCount: 0,
    publicClasses: 0,
  })
  const [recentClasses, setRecentClasses] = useState<ClassItem[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [guideOpen, setGuideOpen] = useState(false)

  // Show the "How it works" guide automatically the first time a new instructor
  // lands on the dashboard, then remember it on their account.
  useEffect(() => {
    if (!user.id) return
    let active = true
    fetchPreferences(user.id)
      .then((prefs) => {
        if (active && !prefs.guideSeen) {
          setGuideOpen(true)
          void updatePreferences(user.id!, { guideSeen: true }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    if (!user.id) { setLoading(false); return }

    // Pull class, quiz, game counts and recent notifications for dashboard tiles.
    const load = async () => {
      try {
        setLoading(true)
        const [classesRes, quizzesRes, gamesRes, notifRes] = await Promise.all([
          apiGet<{ classes: ClassItem[] }>(`/api/classes/instructor/${user.id}`).catch(() => null),
          features.quizzes_enabled
            ? apiGet<{ quizzes: unknown[] }>(`/api/quizzes/instructor/${user.id}`).catch(() => null)
            : Promise.resolve(null),
          features.games_enabled
            ? apiGet<{ games: unknown[] }>(`/api/games/instructor/${user.id}`).catch(() => null)
            : Promise.resolve(null),
          apiGet<{ notifications: ActivityItem[] }>(`/api/notifications/user/${user.id}`).catch(() => null),
        ])

        let classCount = 0, publicClasses = 0
        if (classesRes) {
          const list = classesRes.classes || []
          classCount = list.length
          publicClasses = list.filter((c) => c.visibility === 'public').length
          setRecentClasses(list.slice(0, 5))
        }

        let quizCount = 0
        if (quizzesRes) quizCount = (quizzesRes.quizzes || []).length

        let gameCount = 0
        if (gamesRes) gameCount = (gamesRes.games || []).length

        setStats({ classCount, quizCount, gameCount, publicClasses })

        if (notifRes) {
          const notifData = notifRes
          setRecentActivity(
            (notifData.notifications || []).slice(0, 5).map((n: ActivityItem) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              metadata: n.metadata ?? null,
              created_at: n.created_at,
            }))
          )
        }
      } catch { /* keep defaults */ } finally {
        setLoading(false)
      }
    }

    void load()
  }, [user.id, features.quizzes_enabled, features.games_enabled])

  // Highlights the next recommended instructor action (create class, add content, etc.).
  const spotlight = useMemo((): {
    badge: string
    icon: IconName
    title: string
    body: string
    action?: () => void
    actionLabel: string
  } => {
    if (stats.classCount === 0) return {
      badge: 'First step', icon: 'classes',
      title: 'Create your first class',
      body: 'Set up a class, share the join code, and start publishing quizzes and games.',
      action: onClassClick, actionLabel: 'Go to My Classes',
    }
    if (stats.quizCount === 0 && features.quizzes_enabled) return {
      badge: 'Content tip', icon: 'quiz',
      title: 'Add your first quiz',
      body: 'Open My Classes, pick a class, and use Manage Quizzes to publish your first assessment.',
      action: onClassClick, actionLabel: 'Go to My Classes',
    }
    return {
      badge: 'Insights', icon: 'performance',
      title: 'Check how your students are doing',
      body: 'Review scores and attempts across classes to see who may need extra support.',
      action: onStudentPerformanceClick, actionLabel: 'View Performance',
    }
  }, [stats, features.quizzes_enabled, onClassClick, onStudentPerformanceClick])

  const onboardingSteps = useMemo(() => {
    const steps = [
      {
        id: 'class',
        label: 'Create your first class',
        hint: 'Set visibility, add a description, and generate a join code for students.',
        done: stats.classCount > 0,
        action: onClassClick,
        actionLabel: 'My Classes',
      },
      {
        id: 'quiz',
        label: 'Add a quiz to a class',
        hint: 'Open a class, go to Manage Quizzes, and publish at least one assessment.',
        done: stats.quizCount > 0,
        action: onClassClick,
        actionLabel: 'Manage classes',
      },
    ]
    if (features.games_enabled) {
      steps.push({
        id: 'game',
        label: 'Build a learning game',
        hint: 'Use Content Maker to turn a quiz into Maze, Snake, Breakout, or Trivia Race.',
        done: stats.gameCount > 0,
        action: onCourseClick,
        actionLabel: 'Content Maker',
      })
    }
    steps.push({
      id: 'performance',
      label: 'Monitor student progress',
      hint: 'Review scores and attempts once students start completing your content.',
      done: stats.quizCount > 0 && stats.classCount > 0,
      action: onStudentPerformanceClick,
      actionLabel: 'Student Performance',
    })
    return steps
  }, [stats, features.games_enabled, onClassClick, onCourseClick, onStudentPerformanceClick])

  return (
    <div className="panel-page">

      {/* ── Hero banner ── */}
      <div className="dash-banner">
        <div className="dash-banner__deco" aria-hidden />
        <div className="dash-banner__copy">
          <p className="dash-banner__kicker">Instructor Dashboard</p>
          <h1 className="dash-banner__title">{greetingForHour()}, {user.username}</h1>
          <p className="dash-banner__sub">
            {stats.classCount > 0
              ? `You are teaching ${stats.classCount} class${stats.classCount === 1 ? '' : 'es'}. Keep your students engaged with quizzes and games.`
              : 'Welcome! Create your first class to start sharing learning content with students.'}
          </p>
          <button type="button" className="dash-banner__guide-btn" onClick={() => setGuideOpen(true)}>
            ❔ How it works
          </button>
        </div>

        {loading ? (
          <div className="dash-banner__stats">
            {[1, 2, 3].map((n) => (
              <div key={n} className="dash-banner__stat dash-banner__stat--loading">
                <span className="dash-banner__stat-icon">…</span>
                <span className="dash-banner__stat-value">–</span>
                <span className="dash-banner__stat-label">Loading</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-banner__stats">
            <div className="dash-banner__stat">
              <DashboardIcon name="classes" variant="stat" />
              <span className="dash-banner__stat-value">{stats.classCount}</span>
              <span className="dash-banner__stat-label">Classes</span>
            </div>
            {features.quizzes_enabled && (
              <div className="dash-banner__stat">
                <DashboardIcon name="quiz" variant="stat" />
                <span className="dash-banner__stat-value">{stats.quizCount}</span>
                <span className="dash-banner__stat-label">Quizzes</span>
              </div>
            )}
            {features.games_enabled && (
              <div className="dash-banner__stat">
                <DashboardIcon name="game" variant="stat" />
                <span className="dash-banner__stat-value">{stats.gameCount}</span>
                <span className="dash-banner__stat-label">Games</span>
              </div>
            )}
            <div className="dash-banner__stat">
              <DashboardIcon name="globe" variant="stat" />
              <span className="dash-banner__stat-value">{stats.publicClasses}</span>
              <span className="dash-banner__stat-label">Public</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Teaching checklist ── */}
      {!loading && (
        <OnboardingChecklist
          title="Teaching setup checklist"
          subtitle="A quick path from a new instructor account to published content and student insights."
          steps={onboardingSteps}
        />
      )}

      {/* ── Tip / spotlight ── */}
      {!loading && (
        <div className="dash-tip">
          <DashboardIcon name={spotlight.icon} variant="tip" />
          <div className="dash-tip__body">
            <p className="dash-tip__badge">{spotlight.badge}</p>
            <h2 className="dash-tip__title">{spotlight.title}</h2>
            <p className="dash-tip__desc">{spotlight.body}</p>
          </div>
          {spotlight.action && (
            <button type="button" className="panel-btn panel-btn-primary" onClick={spotlight.action}>
              {spotlight.actionLabel} →
            </button>
          )}
        </div>
      )}

      {/* ── Two-column: Recent classes + quick actions ── */}
      <div className="dash-sections">
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">Recent Classes</h2>
            <button type="button" className="dash-section__link" onClick={onClassClick}>
              See all →
            </button>
          </div>
          {loading ? (
            <div className="dash-section-empty">Loading…</div>
          ) : recentClasses.length === 0 ? (
            <div className="dash-section-empty">
              No classes yet.{' '}
              <button type="button" className="dash-section__link" onClick={onClassClick}>
                Create one →
              </button>
            </div>
          ) : (
            <div className="dash-class-list">
              {recentClasses.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  className="dash-class-item"
                  onClick={() => navigate(ROUTES.instructor.classManage(cls.id))}
                >
                  <div className="dash-class-item__thumb">
                    {cls.background_image
                      ? <img src={cls.background_image} alt="" />
                      : <DashboardIcon name="classes" variant="thumb" />}
                  </div>
                  <div className="dash-class-item__info">
                    <p className="dash-class-item__name">{cls.title}</p>
                    <p className="dash-class-item__meta">
                      {cls.description ? cls.description.slice(0, 48) + (cls.description.length > 48 ? '…' : '') : 'No description'}
                    </p>
                  </div>
                  <span className={`dash-class-item__badge dash-class-item__badge--${cls.visibility === 'private' ? 'private' : 'public'}`}>
                    {cls.visibility}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">At a Glance</h2>
          </div>
          <div className="dash-glance-list">
            {([
              { icon: 'classes' as IconName, label: 'Total Classes', value: stats.classCount, valueClass: 'dash-glance-row__value--accent' },
              ...(features.quizzes_enabled ? [{ icon: 'quiz' as IconName, label: 'Total Quizzes', value: stats.quizCount, valueClass: 'dash-glance-row__value--purple' }] : []),
              ...(features.games_enabled ? [{ icon: 'game' as IconName, label: 'Learning Games', value: stats.gameCount, valueClass: 'dash-glance-row__value--green' }] : []),
              { icon: 'globe' as IconName, label: 'Public Classes', value: stats.publicClasses, valueClass: 'dash-glance-row__value--blue' },
            ]).map((item) => (
              <div key={item.label} className="dash-glance-row">
                <DashboardIcon name={item.icon} variant="inline" />
                <span className="dash-glance-row__label">{item.label}</span>
                <span className={`dash-glance-row__value ${item.valueClass}`}>
                  {loading ? '–' : item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!loading && recentActivity.length > 0 && (
        <div className="dash-section dash-section--spaced">
          <div className="dash-section__header">
            <h2 className="dash-section__title">Recent Activity</h2>
          </div>
          <div className="dash-activity">
            {recentActivity.map((n) => {
              const path = notificationTargetPath(n.type, n.metadata, 'Instructor')
              const clickable = path != null
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`dash-activity-item${clickable ? ' dash-activity-item--clickable' : ''}`}
                  disabled={!clickable}
                  onClick={() => { if (path) navigate(path) }}
                >
                  <div className="dash-activity-content">
                    <p className="dash-activity-title">{n.title}</p>
                    <p className="dash-activity-body">{n.body}</p>
                    <span className="dash-activity-time">{formatTimeAgo(n.created_at)}</span>
                    {clickable && <span className="dash-activity-action">Open →</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Colorful quick action tiles ── */}
      <p className="dash-section-heading">Quick Actions</p>
      <div className="dash-tiles">
        <button type="button" className="dash-tile dash-tile--orange" onClick={onClassClick}>
          <DashboardIcon name="classes" variant="tile" />
          <p className="dash-tile__label">My Classes</p>
          <p className="dash-tile__sub">Create classes and share join codes</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        <button type="button" className="dash-tile dash-tile--purple" onClick={onLibraryClick ?? onClassClick}>
          <DashboardIcon name="library" variant="tile" />
          <p className="dash-tile__label">Library</p>
          <p className="dash-tile__sub">Manage all quizzes and games</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        {features.quizzes_enabled && (
          <button type="button" className="dash-tile dash-tile--blue" onClick={onCreateQuizClick ?? onClassClick}>
            <DashboardIcon name="edit" variant="tile" />
            <p className="dash-tile__label">Create Quiz</p>
            <p className="dash-tile__sub">Build quizzes and save to your library</p>
            <span className="dash-tile__arrow">→</span>
          </button>
        )}

        <button type="button" className="dash-tile dash-tile--teal" onClick={onStudentPerformanceClick}>
          <DashboardIcon name="performance" variant="tile" />
          <p className="dash-tile__label">Performance</p>
          <p className="dash-tile__sub">View scores and class analytics</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        {features.games_enabled && (
          <button type="button" className="dash-tile dash-tile--pink" onClick={onCourseClick}>
            <DashboardIcon name="studio" variant="tile" />
            <p className="dash-tile__label">Content Maker</p>
            <p className="dash-tile__sub">Create quizzes and design learning games</p>
            <span className="dash-tile__arrow">→</span>
          </button>
        )}

        <button type="button" className="dash-tile dash-tile--amber" onClick={onAiQuizClick ?? onCreateQuizClick ?? onClassClick}>
          <DashboardIcon name="ai" variant="tile" />
          <p className="dash-tile__label">AI Quiz Generator</p>
          <p className="dash-tile__sub">Let EduBot create quizzes for you</p>
          <span className="dash-tile__arrow">→</span>
        </button>
      </div>

      <WebsiteGuideModal open={guideOpen} role="Instructor" onClose={() => setGuideOpen(false)} />
    </div>
  )
}

export default InstructorDashboard
