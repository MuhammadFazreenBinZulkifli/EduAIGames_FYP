import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../api/client'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import { formatTimeAgo } from '../utils/formatTimeAgo'
import { notificationTargetPath } from '../utils/notificationNavigation'
import type { NotificationType } from './NotificationBell'
import OnboardingChecklist from './OnboardingChecklist'
import DashboardIcon from './DashboardIcon'
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

interface StudentDashboardProps {
  user: User
  onCourseClick?: () => void
  onOpenClassContent?: (classId: number) => void
  onJoinClassClick?: () => void
  onMyClassesClick?: () => void
  onAnswerQuizClick?: () => void
  onGradesClick?: () => void
  onReviewQuiz?: (classId: number, quizId: number) => void
  onEduBotClick?: () => void
}

interface DashboardStats {
  classCount: number
  quizTaken: number
  pendingQuizzes: number
  dueSoonCount: number
  avgScore: number | null
  lastQuizTitle: string | null
  lastScore: number | null
  lastQuizId: number | null
  lastClassId: number | null
}

interface ClassItem {
  id: number
  title: string
  description: string
  visibility: string
  background_image?: string | null
  instructor_name?: string
}

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Landing page for students — hero banner, enrolled classes, colorful action tiles.
function StudentDashboard({
  user,
  onCourseClick,
  onOpenClassContent,
  onJoinClassClick,
  onMyClassesClick,
  onAnswerQuizClick,
  onGradesClick,
  onReviewQuiz,
  onEduBotClick,
}: StudentDashboardProps) {
  const navigate = useNavigate()
  const { features } = usePlatformFeatures()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    classCount: 0, quizTaken: 0, pendingQuizzes: 0, dueSoonCount: 0,
    avgScore: null, lastQuizTitle: null, lastScore: null,
    lastQuizId: null, lastClassId: null,
  })
  const [enrolledClasses, setEnrolledClasses] = useState<ClassItem[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [dueSoonQuizzes, setDueSoonQuizzes] = useState<Array<{ id: number; title: string; due_date: string; class_id?: number | null }>>([])
  const [showDueHub, setShowDueHub] = useState(false)

  useEffect(() => {
    if (!user.id) { setLoading(false); return }

    // Aggregate enrolment, quiz progress, due dates, and recent notifications for the hero stats.
    const load = async () => {
      try {
        setLoading(true)
        const [classesRes, quizzesRes, attemptsRes, notifRes] = await Promise.all([
          apiGet<{ classes: ClassItem[] }>(`/api/classes/student/${user.id}/my-classes`).catch(() => null),
          features.quizzes_enabled
            ? apiGet<{ quizzes: Array<{ id: number; title: string; due_date?: string | null; class_id?: number | null }> }>(`/api/quizzes/student/${user.id}/available`).catch(() => null)
            : Promise.resolve(null),
          features.quizzes_enabled
            ? apiGet<{ attempts: Array<{ quiz_id: number; score: number; quiz_title?: string; quiz_class_id?: number | null }> }>(`/api/quizzes/attempts/student/${user.id}`).catch(() => null)
            : Promise.resolve(null),
          apiGet<{ notifications: ActivityItem[] }>(`/api/notifications/user/${user.id}`).catch(() => null),
        ])

        let classCount = 0
        if (classesRes) {
          const list = classesRes.classes || []
          classCount = list.length
          setEnrolledClasses(list.slice(0, 5))
        }

        let pendingQuizzes = 0, quizTaken = 0, dueSoonCount = 0
        let avgScore: number | null = null, lastQuizTitle: string | null = null, lastScore: number | null = null
        let lastQuizId: number | null = null, lastClassId: number | null = null

        if (quizzesRes && attemptsRes) {
          const quizData = quizzesRes
          const attemptsData = attemptsRes
          const attempts = attemptsData.attempts || []
          const completedIds = new Set(attempts.map((a: { quiz_id: number }) => String(a.quiz_id)))
          const available: Array<{ id: number; title: string; due_date?: string | null; class_id?: number | null }> = quizData.quizzes || []
          const now = new Date()
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          pendingQuizzes = available.filter((q) => !completedIds.has(String(q.id))).length
          const dueSoon = available.filter((q) => {
            if (!q.due_date || completedIds.has(String(q.id))) return false
            const due = new Date(q.due_date)
            return due >= now && due <= sevenDaysFromNow
          })
          dueSoonCount = dueSoon.length
          setDueSoonQuizzes(dueSoon.map((q) => ({ id: q.id, title: q.title, due_date: q.due_date!, class_id: q.class_id ?? null })))
          quizTaken = attempts.length
          if (attempts.length > 0) {
            const scores = attempts.map((a: { score: number }) => Number(a.score)).filter(Number.isFinite)
            if (scores.length > 0) avgScore = Math.round(scores.reduce((s: number, v: number) => s + v, 0) / scores.length)
            const latest = attempts[0] as { quiz_id?: number; quiz_title?: string; score?: number; quiz_class_id?: number | null }
            lastQuizTitle = latest.quiz_title ?? null
            lastScore = latest.score != null ? Number(latest.score) : null
            lastQuizId = latest.quiz_id != null ? Number(latest.quiz_id) : null
            lastClassId = latest.quiz_class_id != null ? Number(latest.quiz_class_id) : null
          }
        }

        setStats({ classCount, quizTaken, pendingQuizzes, dueSoonCount, avgScore, lastQuizTitle, lastScore, lastQuizId, lastClassId })

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
  }, [user.id, features.quizzes_enabled])

  // Picks the most relevant next-step card based on enrolment and quiz state.
  const spotlight = useMemo((): {
    badge: string
    icon: IconName
    title: string
    body: string
    action?: () => void
    actionLabel: string
  } => {
    if (stats.classCount === 0) return {
      badge: 'Get started', icon: 'join',
      title: 'Join your first class',
      body: 'Ask your lecturer for a join code, then enrol to unlock quizzes, games, and grades.',
      action: onJoinClassClick, actionLabel: 'Join a Class',
    }
    if (features.quizzes_enabled && stats.dueSoonCount > 0) return {
      badge: 'Due soon', icon: 'clock',
      title: `${stats.dueSoonCount} quiz${stats.dueSoonCount === 1 ? '' : 'zes'} due within 7 days`,
      body: 'Complete upcoming quizzes before the deadline to keep your grades on track.',
      action: onAnswerQuizClick, actionLabel: 'View pending quizzes',
    }
    if (features.quizzes_enabled && stats.pendingQuizzes > 0) return {
      badge: 'Up next', icon: 'quiz',
      title: `${stats.pendingQuizzes} quiz${stats.pendingQuizzes === 1 ? '' : 'zes'} waiting for you`,
      body: 'Complete assigned quizzes to keep your grades up to date this semester.',
      action: onAnswerQuizClick, actionLabel: 'View pending quizzes',
    }
    if (stats.lastQuizTitle && stats.lastScore != null) {
      const canReview = stats.lastQuizId != null && stats.lastClassId != null && onReviewQuiz
      return {
        badge: 'Latest result', icon: 'trophy',
        title: `${stats.lastQuizTitle}: ${stats.lastScore}%`,
        body: canReview
          ? 'Jump straight into the question-by-question review of your latest quiz.'
          : 'Review your grades or explore course activities for more practice.',
        action: canReview
          ? () => onReviewQuiz!(stats.lastClassId!, stats.lastQuizId!)
          : onGradesClick,
        actionLabel: canReview ? 'Review Latest Quiz' : 'View My Grades',
      }
    }
    return {
      badge: 'Explore', icon: 'content',
      title: 'Browse your course activities',
      body: 'Open Class Content to play games, take quizzes, and work through assigned materials.',
      action: onCourseClick, actionLabel: 'Open Class Content',
    }
  }, [stats, features.quizzes_enabled, onJoinClassClick, onAnswerQuizClick, onGradesClick, onReviewQuiz, onCourseClick])

  const onboardingSteps = useMemo(() => {
    const steps = [
      {
        id: 'join',
        label: 'Join a class',
        hint: 'Get a join code from your lecturer and enrol in your module.',
        done: stats.classCount > 0,
        action: onJoinClassClick,
        actionLabel: 'Join Class',
      },
      {
        id: 'content',
        label: 'Open Class Content',
        hint: 'Browse materials, quizzes, and learning games for your class.',
        done: stats.classCount > 0 && (stats.quizTaken > 0 || stats.pendingQuizzes > 0),
        action: onCourseClick,
        actionLabel: 'Class Content',
      },
    ]
    if (features.quizzes_enabled) {
      steps.push({
        id: 'quiz',
        label: 'Complete your first quiz',
        hint: 'Submit a quiz to record your score and track progress.',
        done: stats.quizTaken > 0,
        action: onAnswerQuizClick,
        actionLabel: 'Pending Quizzes',
      })
      steps.push({
        id: 'grades',
        label: 'Review your grades',
        hint: 'See feedback and scores for quizzes you have completed.',
        done: stats.quizTaken > 0,
        action: onGradesClick,
        actionLabel: 'My Grades',
      })
    }
    return steps
  }, [stats, features.quizzes_enabled, onJoinClassClick, onCourseClick, onAnswerQuizClick, onGradesClick])

  return (
    <div className="panel-page">

      {/* ── Hero banner ── */}
      <div className="dash-banner dash-banner--student">
        <div className="dash-banner__deco" aria-hidden />
        <div className="dash-banner__copy">
          <p className="dash-banner__kicker">Student Dashboard</p>
          <h1 className="dash-banner__title">{greetingForHour()}, {user.username}</h1>
          <p className="dash-banner__sub">
            {stats.classCount > 0
              ? `You are enrolled in ${stats.classCount} class${stats.classCount === 1 ? '' : 'es'}. Keep learning and levelling up!`
              : 'Welcome to EduAIGames! Join a class to start taking quizzes and playing learning games.'}
          </p>
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
              <>
                <div className="dash-banner__stat">
                  <DashboardIcon name="check" variant="stat" />
                  <span className="dash-banner__stat-value">{stats.quizTaken}</span>
                  <span className="dash-banner__stat-label">Done</span>
                </div>
                <div className="dash-banner__stat">
                  <DashboardIcon name="clock" variant="stat" />
                  <span className="dash-banner__stat-value">{stats.dueSoonCount}</span>
                  <span className="dash-banner__stat-label">Due Soon</span>
                </div>
                <div className="dash-banner__stat">
                  <DashboardIcon name="grades" variant="stat" />
                  <span className="dash-banner__stat-value">{stats.avgScore != null ? `${stats.avgScore}%` : '—'}</span>
                  <span className="dash-banner__stat-label">Avg</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Getting started checklist ── */}
      {!loading && (
        <OnboardingChecklist
          title="Your first steps as a student"
          subtitle="Follow this short path to go from a fresh account to your first quiz and grade."
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

      {/* ── Due This Week hub ── */}
      {!loading && features.quizzes_enabled && dueSoonQuizzes.length > 0 && (
        <div className="dash-due-hub">
          <div className="dash-due-hub__header">
            <div>
              <p className="dash-due-hub__kicker">Upcoming deadlines</p>
              <h2 className="dash-due-hub__title">Due This Week</h2>
            </div>
            <button
              type="button"
              className="panel-btn panel-btn-primary panel-btn-sm"
              onClick={onAnswerQuizClick}
            >
              View all quizzes →
            </button>
          </div>
          <div className="dash-due-hub__list">
            {dueSoonQuizzes.map((quiz) => {
              const due = new Date(quiz.due_date)
              const diffMs = due.getTime() - Date.now()
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
              const isUrgent = diffDays <= 1
              return (
                <button
                  key={quiz.id}
                  type="button"
                  className={`dash-due-item${isUrgent ? ' dash-due-item--urgent' : ''}`}
                  onClick={onAnswerQuizClick}
                >
                  <div className="dash-due-item__left">
                    <DashboardIcon name="quiz" variant="stat" />
                  </div>
                  <div className="dash-due-item__body">
                    <p className="dash-due-item__title">{quiz.title}</p>
                    <p className="dash-due-item__date">
                      Due: {due.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`dash-due-item__badge${isUrgent ? ' dash-due-item__badge--urgent' : ''}`}>
                    {diffDays <= 0 ? 'Due today' : diffDays === 1 ? 'Due tomorrow' : `${diffDays}d left`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Two-column: My classes + progress ── */}
      <div className="dash-sections">
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">Enrolled Classes</h2>
            <button type="button" className="dash-section__link" onClick={onMyClassesClick}>
              See all →
            </button>
          </div>
          {loading ? (
            <div className="dash-section-empty">Loading…</div>
          ) : enrolledClasses.length === 0 ? (
            <div className="dash-section-empty">
              You haven't joined any classes yet.{' '}
              <button type="button" className="dash-section__link" onClick={onJoinClassClick}>
                Join one →
              </button>
            </div>
          ) : (
            <div className="dash-class-list">
              {enrolledClasses.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  className="dash-class-item"
                  onClick={() => onOpenClassContent?.(cls.id) ?? onCourseClick?.()}
                >
                  <div className="dash-class-item__thumb">
                    {cls.background_image ? <img src={cls.background_image} alt="" /> : <DashboardIcon name="classes" variant="thumb" />}
                  </div>
                  <div className="dash-class-item__info">
                    <p className="dash-class-item__name">{cls.title}</p>
                    <p className="dash-class-item__meta">
                      {cls.instructor_name ? `by ${cls.instructor_name}` : 'No description'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">My Progress</h2>
            {features.quizzes_enabled && (
              <button type="button" className="dash-section__link" onClick={onGradesClick}>
                Full grades →
              </button>
            )}
          </div>
          <div className="dash-glance-list">
            {([
              { icon: 'classes' as IconName, label: 'Enrolled Classes', value: stats.classCount, valueClass: 'dash-glance-row__value--blue' },
              ...(features.quizzes_enabled ? [
                { icon: 'check' as IconName, label: 'Quizzes Completed', value: stats.quizTaken, valueClass: 'dash-glance-row__value--green' },
                { icon: 'clock' as IconName, label: 'Due Soon', value: stats.dueSoonCount, valueClass: 'dash-glance-row__value--amber' },
                { icon: 'grades' as IconName, label: 'Average Score', value: stats.avgScore != null ? `${stats.avgScore}%` : '—', valueClass: 'dash-glance-row__value--pink' },
              ] : []),
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
              const path = notificationTargetPath(n.type, n.metadata, 'Student')
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
        <button type="button" className="dash-tile dash-tile--teal" onClick={onCourseClick}>
          <DashboardIcon name="content" variant="tile" />
          <p className="dash-tile__label">Class Content</p>
          <p className="dash-tile__sub">Materials, quizzes, and learning games</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        {features.quizzes_enabled && (
          <button type="button" className="dash-tile dash-tile--purple" onClick={onAnswerQuizClick}>
            <DashboardIcon name="quiz" variant="tile" />
            <p className="dash-tile__label">Pending Quizzes</p>
            <p className="dash-tile__sub">Shortcut to quizzes across all classes</p>
            <span className="dash-tile__arrow">→</span>
          </button>
        )}

        <button type="button" className="dash-tile dash-tile--orange" onClick={onMyClassesClick}>
          <DashboardIcon name="classes" variant="tile" />
          <p className="dash-tile__label">Enrolled Classes</p>
          <p className="dash-tile__sub">Membership, join codes, and leave class</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        <button type="button" className="dash-tile dash-tile--blue" onClick={onJoinClassClick}>
          <DashboardIcon name="join" variant="tile" />
          <p className="dash-tile__label">Join Class</p>
          <p className="dash-tile__sub">Enter a join code to enrol in a new class</p>
          <span className="dash-tile__arrow">→</span>
        </button>

        {features.quizzes_enabled && (
          <button type="button" className="dash-tile dash-tile--pink" onClick={onGradesClick}>
            <DashboardIcon name="grades" variant="tile" />
            <p className="dash-tile__label">My Grades</p>
            <p className="dash-tile__sub">Review scores and quiz feedback</p>
            <span className="dash-tile__arrow">→</span>
          </button>
        )}

        <button type="button" className="dash-tile dash-tile--amber" onClick={onEduBotClick ?? onMyClassesClick}>
          <DashboardIcon name="chatbot" variant="tile" />
          <p className="dash-tile__label">EduBot</p>
          <p className="dash-tile__sub">Ask the AI tutor any learning question</p>
          <span className="dash-tile__arrow">→</span>
        </button>
      </div>
    </div>
  )
}

export default StudentDashboard
