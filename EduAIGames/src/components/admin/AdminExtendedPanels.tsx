import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../../config'
import { usePanelUI } from '../../context/PanelUIContext'
import { downloadAdminExport } from './adminExport'
import { invalidatePlatformFeaturesCache } from '../../hooks/usePlatformFeatures'
import '../App_CSS/AdminDashboard_CSS.css'
import '../App_CSS/AdminExtendedPanels_CSS.css'

function adminHeaders(adminId: number): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Admin-Id': String(adminId) }
}

function formatDate(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface PanelProps {
  adminId: number
  showSuccess: (m: string) => void
  showError: (m: string) => void
}

export interface LoginDayBucket {
  label: string
  date: string
  students: number
  instructors: number
  admin: number
}

interface OverviewPanelProps {
  adminId: number
  users: { id: number; username: string; role: string; account_status?: string; created_at?: string }[]
  pendingUsers: { id: number; username: string; email: string; role: string; created_at?: string }[]
  classes: { id: number; instructor_username: string }[]
  quizzes: { id: number }[]
  loginActivity: LoginDayBucket[]
  onOpenApprovals?: () => void
}

function DonutChart({ segments, size = 120 }: {
  segments: { label: string; value: number; color: string }[]
  size?: number
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 38
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r

  let offset = 0
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0
    const dash = pct * circ
    const gap = circ - dash
    const arc = { ...seg, dash, gap, offset }
    offset += dash
    return arc
  })

  if (total === 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={18} />
      </svg>
    )
  }

  return (
    <svg width={size} height={size} className="admin-panels__donut-svg">
      {arcs.map((arc) => (
        <circle
          key={arc.label}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={18}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
        />
      ))}
    </svg>
  )
}

// Dashboard overview with KPIs, role breakdown, and recent login activity.
export function OverviewPanel({ users, pendingUsers, classes, quizzes, loginActivity, onOpenApprovals }: OverviewPanelProps) {
  const approvedUsers = users.filter((u) => u.role !== 'Admin' && u.role !== 'SuperAdmin')
  const students = approvedUsers.filter((u) => u.role === 'Student' && u.account_status !== 'pending')
  const instructors = approvedUsers.filter((u) => u.role === 'Instructor' && u.account_status !== 'pending')
  const suspended = approvedUsers.filter((u) => u.account_status === 'suspended')

  const sevenDaysAgo = Date.now() - 7 * 86400000
  const newUsers = approvedUsers.filter(
    (u) => u.created_at && new Date(u.created_at).getTime() >= sevenDaysAgo
  )

  const kpis = [
    { label: 'Total students', value: students.length, icon: '🎓', color: '#059669', bg: '#ecfdf5' },
    { label: 'Total instructors', value: instructors.length, icon: '👩‍🏫', color: '#2563eb', bg: '#eff6ff' },
    { label: 'Active classes', value: classes.length, icon: '🏫', color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Total quizzes', value: quizzes.length, icon: '📝', color: '#c2410c', bg: '#fff7ed' },
    { label: 'Pending approvals', value: pendingUsers.length, icon: '⏳', color: '#b45309', bg: '#fffbeb' },
    { label: 'New this week', value: newUsers.length, icon: '🆕', color: '#0284c7', bg: '#f0f9ff' },
  ]

  const bars = loginActivity
  const maxBar = Math.max(1, ...bars.map((b) => b.students + b.instructors))

  const donutSegments = [
    { label: 'Students', value: students.length, color: '#059669' },
    { label: 'Instructors', value: instructors.length, color: '#2563eb' },
    { label: 'Pending', value: pendingUsers.length, color: '#f59e0b' },
    { label: 'Suspended', value: suspended.length, color: '#b91c1c' },
  ]

  return (
    <div className="admin-panels__root">
      {/* KPI cards */}
      <div className="admin-os__import-actions">
        {kpis.map((k) => (
          <div key={k.label} className="admin-panels__kpi-card">
            <div className="admin-panels__kpi-header">
              <span className="admin-panels__kpi-icon" style={{ background: k.bg }}>{k.icon}</span>
              <span className="admin-panels__kpi-label">{k.label}</span>
            </div>
            <div className="admin-panels__kpi-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="admin-panels__chart-card admin-panels__chart-card--spaced">
        <div className="admin-panels__chart-header">
          <span className="admin-panels__chart-title">Logins in the last 14 days</span>
          <div className="admin-panels__chart-legend">
            <span><span className="admin-panels__legend-dot admin-panels__legend-dot--students" />Students</span>
            <span><span className="admin-panels__legend-dot admin-panels__legend-dot--instructors" />Instructors</span>
          </div>
        </div>
        <div className="admin-panels__bar-chart">
          {bars.map((b, i) => {
            const total = b.students + b.instructors
            const ih = (b.instructors / maxBar) * 110
            const sh = (b.students / maxBar) * 110
            return (
              <div key={b.date || i} className="admin-panels__bar-col">
                <div className="admin-panels__bar-stack">
                  {ih > 0 && <div className="admin-panels__bar-instructor" style={{ height: ih }} title={`${b.instructors} instructor login(s)`} />}
                  {sh > 0 && <div className={`admin-panels__bar-student${ih === 0 ? ' admin-panels__bar-student--solo' : ''}`} style={{ height: sh }} title={`${b.students} student login(s)`} />}
                  {total === 0 && <div className="admin-panels__bar-empty" />}
                </div>
                <span className="admin-panels__bar-label">{b.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom row: donut + top instructors */}
      <div className="admin-panels__grid-2">
        {/* Donut */}
        <div className="admin-panels__chart-card">
          <div className="admin-panels__chart-title admin-panels__chart-title--mb">Users by role</div>
          <div className="admin-panels__donut-wrap">
            <div className="admin-panels__donut-chart-wrap">
              <DonutChart segments={donutSegments} size={120} />
              <div className="admin-panels__donut-center">
                {students.length + instructors.length}
              </div>
            </div>
            <ul className="admin-panels__legend-list">
              {donutSegments.map((s) => {
                const total = donutSegments.reduce((a, x) => a + x.value, 0)
                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
                return (
                  <li key={s.label} className="admin-panels__legend-item">
                    <span>
                      <span className="admin-panels__legend-swatch" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="admin-panels__legend-pct">{pct}%</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Pending registrations — actionable */}
        <div className="admin-panels__chart-card">
          <div className="admin-panels__chart-header">
            <span className="admin-panels__chart-title">Awaiting approval</span>
            {pendingUsers.length > 0 && onOpenApprovals && (
              <button
                type="button"
                onClick={onOpenApprovals}
                className="admin-panels__review-link"
              >
                Review all →
              </button>
            )}
          </div>
          {pendingUsers.length === 0 ? (
            <p className="admin-panels__empty-msg">No pending registrations. You are all caught up.</p>
          ) : (
            <ul className="admin-panels__pending-list">
              {pendingUsers.slice(0, 6).map((p) => (
                <li key={p.id} className="admin-panels__pending-item">
                  <div className="admin-panels__pending-user">
                    <div className="admin-panels__pending-name">{p.username}</div>
                    <div className="admin-panels__pending-email">{p.email}</div>
                  </div>
                  <span className={`admin-panels__pending-role admin-panels__pending-role--${p.role}`}>{p.role}</span>
                </li>
              ))}
              {pendingUsers.length > 6 && (
                <li className="admin-panels__pending-more">
                  +{pendingUsers.length - 6} more waiting
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// Platform analytics charts and exportable reports.
export function AnalyticsPanel({ adminId }: PanelProps) {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [byQuiz, setByQuiz] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/analytics/quizzes`, { headers: adminHeaders(adminId) })
      .then((r) => r.json())
      .then((d) => { setSummary(d.summary); setByQuiz(d.by_quiz || []) })
      .catch(() => {})
  }, [adminId])

  return (
    <>
      <div className="admin-os__toolbar">
        <span className="admin-os__toolbar-count">
          Platform avg score: <strong>{summary?.platform_avg_score != null ? `${summary.platform_avg_score}` : '—'}%</strong>
          {' · '}Below pass (&lt;60%): <strong>{Number(summary?.below_pass_count ?? 0)}</strong>
          {' · '}Total attempts: <strong>{Number(summary?.total_attempts ?? 0)}</strong>
        </span>
        <div className="admin-os__toolbar-spacer" />
        <button type="button" className="admin-os__btn-secondary" onClick={() => downloadAdminExport(adminId, 'attempts').catch(() => {})}>
          ↓ Export attempts CSV
        </button>
      </div>
      <div className="admin-os__table-wrap">
        <table className="admin-os__table">
          <thead>
            <tr>{['Quiz', 'Class', 'Instructor', 'Attempts', 'Avg %', 'Failed'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {byQuiz.length === 0 ? (
              <tr><td colSpan={6} className="admin-os__td admin-os__td--empty">No quiz data yet.</td></tr>
            ) : byQuiz.map((q: any) => (
              <tr key={q.id} >
                <td className="admin-os__td admin-os__td--bold">{q.title}</td>
                <td className="admin-os__td">{q.class_title || '—'}</td>
                <td className="admin-os__td">{q.instructor_name}</td>
                <td className="admin-os__td">{q.attempt_count}</td>
                <td className="admin-os__td">{q.avg_score ?? '—'}</td>
                <td className={`admin-os__td${Number(q.fail_count) > 0 ? ' admin-panels__td--fail' : ''}`}>{q.fail_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Browse and delete platform-wide quizzes, games, and class content.
export function ContentPanel({ adminId, showSuccess, showError }: PanelProps) {
  const { confirm } = usePanelUI()
  const [games, setGames] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [sub, setSub] = useState<'games' | 'materials'>('games')

  const load = () => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/admin/games`, { headers: adminHeaders(adminId) }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/admin/content`, { headers: adminHeaders(adminId) }).then((r) => r.json()),
    ]).then(([g, c]) => { setGames(g.games || []); setItems(c.items || []) })
  }
  useEffect(() => { load() }, [adminId])

  const deleteGame = async (id: number) => {
    if (!(await confirm({ message: 'Delete this game?', danger: true }))) return
    const res = await fetch(`${API_BASE_URL}/api/admin/games/${id}`, { method: 'DELETE', headers: adminHeaders(adminId) })
    if (!res.ok) { showError('Failed to delete game'); return }
    showSuccess('Game deleted.'); load()
  }
  const deleteItem = async (id: number) => {
    if (!(await confirm({ message: 'Remove this content item?', danger: true }))) return
    const res = await fetch(`${API_BASE_URL}/api/admin/content/${id}`, { method: 'DELETE', headers: adminHeaders(adminId) })
    if (!res.ok) { showError('Failed to remove content'); return }
    showSuccess('Content removed.'); load()
  }

  return (
    <>
      <div className="admin-os__toolbar">
        <button type="button" className={sub === 'games' ? 'admin-os__btn-primary' : 'admin-os__btn-secondary'} onClick={() => setSub('games')}>Games ({games.length})</button>
        <button type="button" className={sub === 'materials' ? 'admin-os__btn-primary' : 'admin-os__btn-secondary'} onClick={() => setSub('materials')}>Materials ({items.length})</button>
        <div className="admin-os__toolbar-spacer" />
        <button type="button" className="admin-os__btn-secondary" onClick={load}>↻ Refresh</button>
      </div>
      <div className="admin-os__table-wrap">
        <table className="admin-os__table">
          <thead>
            <tr>
              {sub === 'games'
                ? ['Title', 'Type', 'Instructor', 'Quiz', 'Published', 'Actions'].map((h) => <th key={h} className="admin-os__th">{h}</th>)
                : ['Title', 'Type', 'Class', 'Topic', 'Instructor', 'Actions'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sub === 'games' ? games.map((g) => (
              <tr key={g.id} >
                <td className="admin-os__td admin-os__td--bold">{g.title}</td>
                <td className="admin-os__td">{g.game_type}</td>
                <td className="admin-os__td">{g.instructor_name}</td>
                <td className="admin-os__td">{g.quiz_title}</td>
                <td className="admin-os__td">{g.published_count}</td>
                <td className="admin-os__td"><button className="admin-os__btn-danger" onClick={() => deleteGame(g.id)}>Delete</button></td>
              </tr>
            )) : items.map((it) => (
              <tr key={it.id} >
                <td className="admin-os__td admin-os__td--bold">{it.title}</td>
                <td className="admin-os__td">{it.item_type}</td>
                <td className="admin-os__td">{it.class_title}</td>
                <td className="admin-os__td">{it.topic_name}</td>
                <td className="admin-os__td">{it.instructor_name}</td>
                <td className="admin-os__td"><button className="admin-os__btn-danger" onClick={() => deleteItem(it.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Lists all classes and their instructors across the platform.
export function CoursesPanel({ adminId }: PanelProps) {
  const [courses, setCourses] = useState<any[]>([])
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/courses`, { headers: adminHeaders(adminId) })
      .then((r) => r.json()).then((d) => setCourses(d.courses || []))
  }, [adminId])
  return (
    <div className="admin-os__table-wrap">
      <table className="admin-os__table">
        <thead>
          <tr>{['Title', 'Instructor', 'Enrollments', 'Created'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}</tr>
        </thead>
        <tbody>
          {courses.length === 0 ? (
            <tr><td colSpan={4} className="admin-os__td admin-os__td--empty">No courses yet.</td></tr>
          ) : courses.map((c) => (
            <tr key={c.id} >
              <td className="admin-os__td admin-os__td--bold">{c.title}</td>
              <td className="admin-os__td">{c.instructor_name}</td>
              <td className="admin-os__td">{c.enrollment_count}</td>
              <td className="admin-os__td">{formatDate(c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// View and export the admin audit log of platform actions.
export function AuditPanel({ adminId, showSuccess, showError, isSuperAdmin }: PanelProps & { isSuperAdmin?: boolean }) {
  const { confirm } = usePanelUI()
  const [entries, setEntries] = useState<any[]>([])
  const [clearing, setClearing] = useState(false)

  const load = () => {
    fetch(`${API_BASE_URL}/api/admin/audit-log`, { headers: adminHeaders(adminId) })
      .then((r) => r.json()).then((d) => setEntries(d.entries || []))
  }
  useEffect(() => { load() }, [adminId])

  const exportAudit = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/audit-log/export`, { headers: adminHeaders(adminId) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showSuccess?.('Audit log exported.')
    } catch (e) {
      showError?.(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const scopeLabel = isSuperAdmin ? 'your Super Admin actions' : 'Administrator actions'

  const clearLog = async () => {
    const ok = await confirm({
      message: `Clear ${scopeLabel} from the audit log? ${
        isSuperAdmin
          ? 'Administrator history will be kept and remains visible.'
          : 'Super Admin history cannot be erased by this action.'
      } This cannot be undone.`,
      danger: true,
      confirmLabel: 'Clear history',
    })
    if (!ok) return
    setClearing(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/audit-log`, {
        method: 'DELETE', headers: adminHeaders(adminId),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to clear log')
      showSuccess?.(`Cleared ${data.deleted ?? 0} log entr${(data.deleted ?? 0) === 1 ? 'y' : 'ies'}.`)
      load()
    } catch (e) {
      showError?.(e instanceof Error ? e.message : 'Failed to clear log')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <div className="admin-panels__toolbar-end admin-audit__toolbar">
        {isSuperAdmin && (
          <button type="button" className="admin-os__btn-secondary" onClick={() => void exportAudit()}>↓ Export full audit log (CSV)</button>
        )}
        <button type="button" className="admin-os__btn-danger" disabled={clearing} onClick={() => void clearLog()}>
          {clearing ? 'Clearing…' : '🗑 Clear log history'}
        </button>
      </div>
    <div className="admin-os__table-wrap">
      <table className="admin-os__table admin-os__table--audit">
        <colgroup>
          <col className="admin-os__col-when" />
          <col className="admin-os__col-admin" />
          <col className="admin-os__col-action" />
          <col className="admin-os__col-target" />
          <col className="admin-os__col-details" />
        </colgroup>
        <thead>
          <tr>{['When', 'Admin', 'Action', 'Target', 'Details'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}</tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={5} className="admin-os__td admin-os__td--empty">No audit entries yet.</td></tr>
          ) : entries.map((e) => (
            <tr key={e.id} >
              <td className="admin-os__td">{formatDate(e.created_at)}</td>
              <td className="admin-os__td">{e.admin_name || '—'}</td>
              <td className="admin-os__td admin-os__td--bold">{e.action}</td>
              <td className="admin-os__td">{e.target_type ? `${e.target_type} #${e.target_id}` : '—'}</td>
              <td className="admin-os__td admin-os__td--details">{e.details ? JSON.stringify(e.details) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}

// Platform feature toggles, email config, and maintenance settings.
export function SettingsPanel({ adminId, showSuccess, showError, isSuperAdmin }: PanelProps & { isSuperAdmin?: boolean }) {
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [requireApproval, setRequireApproval] = useState(true)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [openaiEnabled, setOpenaiEnabled] = useState(true)
  const [gamesEnabled, setGamesEnabled] = useState(true)
  const [quizzesEnabled, setQuizzesEnabled] = useState(true)
  const [chatbotEnabled, setChatbotEnabled] = useState(true)
  const [aiQuizEnabled, setAiQuizEnabled] = useState(true)
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [frontendUrl, setFrontendUrl] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    fetch(`${API_BASE_URL}/api/admin/settings`, { headers: adminHeaders(adminId) })
      .then((r) => r.json())
      .then((d) => {
        setRegistrationOpen(d.settings?.registration_open !== false)
        setRequireApproval(d.settings?.require_admin_approval !== false)
        setMaintenanceMode(d.settings?.maintenance_mode === true)
        setOpenaiEnabled(d.settings?.openai_enabled !== false)
        setGamesEnabled(d.settings?.games_enabled !== false)
        setQuizzesEnabled(d.settings?.quizzes_enabled !== false)
        setChatbotEnabled(d.settings?.chatbot_enabled !== false)
        setAiQuizEnabled(d.settings?.ai_quiz_enabled !== false)
        setSmtpConfigured(!!d.smtp_configured)
        setFrontendUrl(d.frontend_url || '')
      })
  }
  useEffect(() => { load() }, [adminId, isSuperAdmin])

  const save = async () => {
    setSaving(true)
    try {
      const url = isSuperAdmin ? `${API_BASE_URL}/api/super-admin/settings` : `${API_BASE_URL}/api/admin/settings`
      const body: Record<string, unknown> = {
        registration_open: registrationOpen,
        require_admin_approval: requireApproval,
      }
      if (isSuperAdmin) {
        body.maintenance_mode = maintenanceMode
        body.openai_enabled = openaiEnabled
        body.games_enabled = gamesEnabled
        body.quizzes_enabled = quizzesEnabled
        body.chatbot_enabled = chatbotEnabled
        body.ai_quiz_enabled = aiQuizEnabled
      }
      const res = await fetch(url, {
        method: 'PUT', headers: adminHeaders(adminId),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (isSuperAdmin) invalidatePlatformFeaturesCache()
      showSuccess('Settings saved.')
    } catch (e) { showError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const sendTest = async () => {
    if (!testEmail.trim()) { showError('Enter an email address'); return }
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/settings/test-email`, {
        method: 'POST', headers: adminHeaders(adminId), body: JSON.stringify({ email: testEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(data.message)
    } catch (e) { showError(e instanceof Error ? e.message : 'Test failed') }
  }

  // ── Super Admin: platform-wide control center (distinct from admin's view) ──
  if (isSuperAdmin) {
    const features: { key: string; name: string; desc: string; value: boolean; set: (v: boolean) => void }[] = [
      { key: 'openai', name: 'OpenAI services', desc: 'Core API powering the chatbot and AI quiz generation.', value: openaiEnabled, set: setOpenaiEnabled },
      { key: 'chatbot', name: 'AI chatbot', desc: 'Floating assistant for guests, students & instructors.', value: chatbotEnabled, set: setChatbotEnabled },
      { key: 'aiquiz', name: 'AI Quiz generator', desc: 'Instructor AI quiz builder tools.', value: aiQuizEnabled, set: setAiQuizEnabled },
      { key: 'quizzes', name: 'Quizzes', desc: 'Create, answer, and manage quizzes.', value: quizzesEnabled, set: setQuizzesEnabled },
      { key: 'games', name: 'Games', desc: 'Maze & snake game studio and play.', value: gamesEnabled, set: setGamesEnabled },
    ]

    return (
      <div className="admin-settings">
        {/* Global feature kill-switches */}
        <div className="admin-os__import-box">
          <h2 className="admin-os__import-title">Global feature controls</h2>
          <p className="admin-os__import-meta">
            Master switches for the <strong>entire platform</strong>. Turning a feature off here disables it for
            every institution regardless of their plan. For paid-feature gating per university, use the
            overrides under <strong>Institutions</strong>.
          </p>
          <div className="admin-settings__feature-grid">
            {features.map((f) => (
              <label key={f.key} className={`admin-settings__feature${f.value ? ' admin-settings__feature--on' : ''}`}>
                <span className="admin-settings__feature-info">
                  <span className="admin-settings__feature-name">{f.name}</span>
                  <span className="admin-settings__feature-desc">{f.desc}</span>
                </span>
                <span className="admin-settings__switch">
                  <input type="checkbox" checked={f.value} onChange={(e) => f.set(e.target.checked)} />
                  <span className="admin-settings__switch-track" aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
          {!openaiEnabled && (chatbotEnabled || aiQuizEnabled) && (
            <p className="admin-panels__settings-note">
              Note: The chatbot and AI Quiz both require OpenAI services to be enabled in order to work.
            </p>
          )}
        </div>

        {/* Platform access & maintenance */}
        <div className="admin-os__import-box">
          <h2 className="admin-os__import-title">Platform access</h2>
          <p className="admin-os__import-meta">Control sign-ups and site availability across the whole platform.</p>
          <label className={`admin-panels__checkbox-label${maintenanceMode ? ' admin-panels__checkbox-label--warn' : ''}`}>
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
            Maintenance mode (show a maintenance notice to all users)
          </label>
          <label className="admin-panels__checkbox-label">
            <input type="checkbox" checked={registrationOpen} onChange={(e) => setRegistrationOpen(e.target.checked)} />
            Registration open (allow new sign-ups platform-wide)
          </label>
          <label className="admin-panels__checkbox-label">
            <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
            Require admin approval for new registrations
          </label>
        </div>

        <div className="admin-panels__settings-actions">
          <button type="button" className="admin-os__btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save platform settings'}</button>
        </div>

        {/* Email service status (read-only + test) */}
        <div className="admin-os__import-box">
          <h2 className="admin-os__import-title">Email service</h2>
          <p className="admin-os__import-meta">
            SMTP: <strong>{smtpConfigured ? 'Configured' : 'Not configured'}</strong> · Login link in emails: <strong>{frontendUrl || '—'}</strong>
          </p>
          <div className="admin-os__row-actions">
            <input className="admin-os__search-input" type="email" placeholder="test@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <button type="button" className="admin-os__btn-secondary" onClick={sendTest}>Send test email</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Admin: operational settings (unchanged) ──
  return (
    <div className="admin-os__import-box">
      <h2 className="admin-os__import-title">Platform settings</h2>
      <label className="admin-panels__checkbox-label"><input type="checkbox" checked={registrationOpen} onChange={(e) => setRegistrationOpen(e.target.checked)} /> Registration open (new sign-ups allowed)</label>
      <label className="admin-panels__checkbox-label"><input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} /> Require admin approval for new registrations</label>

      <p className="admin-os__import-meta">SMTP: <strong>{smtpConfigured ? 'Configured' : 'Not configured'}</strong> · Login link in emails: <strong>{frontendUrl}</strong></p>
      <div className="admin-panels__settings-actions">
        <button type="button" className="admin-os__btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
      <h3 className="admin-os__import-title admin-panels__settings-heading">Test email</h3>
      <div className="admin-os__row-actions">
        <input className="admin-os__search-input" type="email" placeholder="test@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
        <button type="button" className="admin-os__btn-secondary" onClick={sendTest}>Send test</button>
      </div>
    </div>
  )
}

// Notification bell variant used in the admin dashboard header.
export function AdminNotificationsBell({
  adminId, onOpenApprovals,
}: { adminId: number;  onOpenApprovals: () => void }) {
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<any[]>([])

  const load = () => {
    fetch(`${API_BASE_URL}/api/admin/notifications`, { headers: adminHeaders(adminId) })
      .then((r) => r.json())
      .then((d) => { setUnread(d.unreadCount ?? 0); setList(d.notifications || []) })
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [adminId])

  const markRead = async () => {
    await fetch(`${API_BASE_URL}/api/admin/notifications/mark-read`, { method: 'POST', headers: adminHeaders(adminId), body: '{}' })
    load()
  }

  return (
    <div className="admin-panels__notification-wrap">
      <button type="button" className="admin-os__logout-btn" onClick={() => { setOpen((v) => !v); if (!open) load() }}>
        🔔 Alerts{unread > 0 ? ` (${unread})` : ''}
      </button>
      {open && (
        <div className="admin-panels__notification-panel">
          <div className="admin-panels__notification-header">
            <span className="admin-panels__notification-title">Admin alerts</span>
            <button type="button" className="admin-panels__notification-mark-read" onClick={() => void markRead()}>Mark all read</button>
          </div>
          {list.length === 0 ? (
            <p className="admin-panels__notification-empty">No alerts.</p>
          ) : list.slice(0, 15).map((n) => (
            <div key={n.id} className={`admin-panels__notification-item${n.read_at ? '' : ' admin-panels__notification-item--unread'}`}>
              <div className="admin-panels__notification-item-title">{n.title}</div>
              <div className="admin-panels__notification-item-body">{n.body}</div>
            </div>
          ))}
          <button type="button" className="admin-os__btn-primary" onClick={() => { setOpen(false); onOpenApprovals() }}>
            Open pending approvals →
          </button>
        </div>
      )}
    </div>
  )
}

// Modal showing full account details for a selected user.
export function UserDetailModal({
  adminId, userId, onClose,
}: { adminId: number; userId: number;  onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/users/${userId}/detail`, { headers: adminHeaders(adminId) })
      .then((r) => r.json()).then(setDetail)
  }, [adminId, userId])

  return (
    <div className="admin-panels__modal-overlay">
      <div className="admin-panels__modal-content">
        <h3 className="admin-panels__modal-title">User detail</h3>
        {!detail ? <p>Loading…</p> : (
          <>
            <p className="admin-panels__root"><strong>{detail.user.username}</strong> · {detail.user.email} · {detail.user.role} · {detail.user.account_status}</p>
            <p className="admin-panels__modal-meta">Classes: {detail.classes?.length ?? 0} · Attempts: {detail.quiz_attempts?.length ?? 0}</p>
            {detail.quiz_attempts?.length > 0 && (
              <ul className="admin-panels__modal-list">
                {detail.quiz_attempts.slice(0, 8).map((a: any) => (
                  <li key={a.id}>{a.quiz_title}: {a.score}%</li>
                ))}
              </ul>
            )}
          </>
        )}
        <button type="button" className="admin-os__btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ─── Super Admin exclusive panels ────────────────────────────────────────────

function superHeaders(adminId: number): HeadersInit {
  return adminHeaders(adminId)
}

interface SuperPanelProps extends PanelProps {
  onImpersonate?: (user: { id: number; username: string; email: string; role: string }) => void
}

// Super-admin panel for creating and managing admin accounts.
export function AdminsManagementPanel({ adminId, showSuccess, showError }: PanelProps) {
  const { confirm } = usePanelUI()
  const [admins, setAdmins] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '' })

  const load = () => {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/super-admin/admins`, { headers: superHeaders(adminId) })
      .then((r) => r.json())
      .then((d) => setAdmins(d.admins || []))
      .catch(() => showError('Failed to load admins'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [adminId])

  const act = async (key: string, url: string, method: string, successMsg: string) => {
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: superHeaders(adminId) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Action failed')
      showSuccess(successMsg)
      load()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const createAdmin = async () => {
    if (!form.username.trim() || !form.email.trim() || !form.password) {
      showError('Fill in full name, email, and password.')
      return
    }
    setBusy('create')
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/admins`, {
        method: 'POST', headers: superHeaders(adminId),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(`Admin account created for ${form.email}`)
      setForm({ username: '', email: '', password: '' })
      setShowCreate(false)
      load()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="admin-panels__panel-header">
        <p className="admin-panels__panel-intro">
          Create, suspend, or remove administrator accounts. Super Admin accounts are managed separately.
        </p>
        <button type="button" className="admin-os__btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New admin'}
        </button>
      </div>

      {showCreate && (
        <div className="admin-panels__kpi-card">
          <h3 className="admin-panels__section-title">Create administrator</h3>
          <input className="admin-os__search-input" placeholder="Full name" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <input className="admin-os__search-input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <input className="admin-os__search-input" type="password" placeholder="Password (min 6 chars)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <button type="button" className="admin-os__btn-primary" onClick={() => void createAdmin()} disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create admin'}</button>
        </div>
      )}

      {loading ? (
        <p className="admin-panels__loading-text">Loading administrators…</p>
      ) : (
        <div className="admin-os__table-wrap">
          <table className="admin-os__table">
            <thead>
              <tr>{['Name', 'Email', 'Status', 'Created', 'Actions'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <tr><td colSpan={5} className="admin-os__td admin-os__td--empty">No admin accounts yet. Create one above.</td></tr>
              ) : admins.map((a) => (
                <tr key={a.id} >
                  <td className="admin-os__td admin-os__td--bold">{a.username}</td>
                  <td className="admin-os__td">{a.email}</td>
                  <td className="admin-os__td">{a.account_status}</td>
                  <td className="admin-os__td">{formatDate(a.created_at)}</td>
                  <td className="admin-os__td">
                    <div className="admin-os__row-actions admin-os__row-actions--sm">
                      {a.account_status === 'suspended' ? (
                        <button className="admin-os__btn-success admin-os__btn-xs" disabled={busy === `u-${a.id}`} onClick={() => void act(`u-${a.id}`, `${API_BASE_URL}/api/super-admin/admins/${a.id}/unsuspend`, 'POST', 'Admin activated.')}>Activate</button>
                      ) : (
                        <button className="admin-os__btn-secondary admin-os__btn-xs" disabled={busy === `s-${a.id}`} onClick={() => void act(`s-${a.id}`, `${API_BASE_URL}/api/super-admin/admins/${a.id}/suspend`, 'POST', 'Admin suspended.')}>Suspend</button>
                      )}
                      <button className="admin-os__btn-secondary admin-os__btn-xs" disabled={busy === `d-${a.id}`} onClick={() => void act(`d-${a.id}`, `${API_BASE_URL}/api/super-admin/admins/${a.id}/demote`, 'POST', 'Demoted to instructor.')}>Demote</button>
                      <button className="admin-os__btn-danger admin-os__btn-xs" disabled={busy === `x-${a.id}`} onClick={() => void (async () => { if (await confirm({ message: `Delete admin ${a.username}?`, danger: true })) void act(`x-${a.id}`, `${API_BASE_URL}/api/super-admin/admins/${a.id}`, 'DELETE', 'Admin deleted.') })()}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Shows backend health checks and service status indicators.
export function SystemHealthPanel({ adminId }: PanelProps) {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch(`${API_BASE_URL}/api/super-admin/system-health`, { headers: superHeaders(adminId) })
      .then((r) => r.json())
      .then(setHealth)
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [adminId])

  if (loading) return <p className="admin-panels__empty-msg">Running health checks…</p>
  if (!health) return <p className="admin-panels__error-text">Health check unavailable.</p>

  return (
    <div>
      <div className="admin-panels__toolbar-end">
        <button type="button" className="admin-os__btn-secondary" onClick={load}>↻ Refresh health</button>
      </div>
      <div className="admin-panels__health-kpi-grid">
        <div className="admin-panels__kpi-card">
          <div className="admin-panels__health-stat-label">Database</div>
          <div className={`admin-panels__health-stat-value${health.database?.connected ? ' admin-panels__health-stat-value--ok' : ' admin-panels__health-stat-value--err'}`}>
            {health.database?.connected ? 'Connected' : 'Offline'}
          </div>
        </div>
        <div className="admin-panels__kpi-card">
          <div className="admin-panels__health-stat-label">SMTP email</div>
          <div className="admin-panels__health-stat-value">{health.integrations?.smtpConfigured ? 'Configured' : 'Not set'}</div>
        </div>
        <div className="admin-panels__kpi-card">
          <div className="admin-panels__health-stat-label">OpenAI</div>
          <div className="admin-panels__health-stat-value">{health.integrations?.openAiConfigured ? 'Configured' : 'Not set'}</div>
        </div>
        <div className="admin-panels__kpi-card">
          <div className="admin-panels__health-stat-label">Maintenance mode</div>
          <div className={`admin-panels__health-stat-value${health.settings?.maintenance_mode ? ' admin-panels__health-stat-value--warn' : ' admin-panels__health-stat-value--ok'}`}>
            {health.settings?.maintenance_mode ? 'ON' : 'Off'}
          </div>
        </div>
        <div className="admin-panels__kpi-card">
          <div className="admin-panels__health-stat-label">Feature controls</div>
          <div className="admin-panels__health-feature-list">
            OpenAI: <strong>{health.settings?.openai_enabled !== false ? 'On' : 'Off'}</strong>
            {' · '}Chatbot: <strong>{health.settings?.chatbot_enabled !== false ? 'On' : 'Off'}</strong>
            {' · '}AI Quiz: <strong>{health.settings?.ai_quiz_enabled !== false ? 'On' : 'Off'}</strong>
            {' · '}Quizzes: <strong>{health.settings?.quizzes_enabled !== false ? 'On' : 'Off'}</strong>
            {' · '}Games: <strong>{health.settings?.games_enabled !== false ? 'On' : 'Off'}</strong>
          </div>
        </div>
      </div>

      <div className="admin-panels__kpi-card">
        <h3 className="admin-panels__section-title">Table record counts</h3>
        <div className="admin-panels__table-counts-grid">
          {Object.entries(health.tableCounts || {}).map(([table, count]) => (
            <div key={table} className="admin-panels__table-count-row">
              <span className="admin-panels__table-count-name">{table}</span>
              <span className="admin-panels__table-count-value">{String(count)}</span>
            </div>
          ))}
        </div>
        <p className="admin-panels__health-checked-at">Last checked: {formatDate(health.checkedAt)}</p>
      </div>
    </div>
  )
}

// Lets super admins search for and impersonate another user.
export function ImpersonationPanel({ adminId, showSuccess, showError, onImpersonate }: SuperPanelProps) {
  const [targets, setTargets] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/super-admin/impersonate/targets`, { headers: superHeaders(adminId) })
      .then((r) => r.json())
      .then((d) => setTargets(d.targets || []))
      .finally(() => setLoading(false))
  }, [adminId])

  const filtered = targets.filter((t) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return t.username.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
  })

  const start = async (userId: number) => {
    setBusy(userId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/impersonate`, {
        method: 'POST', headers: superHeaders(adminId),
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(`Now viewing as ${data.user.username}. Use the banner to return.`)
      onImpersonate?.(data.user)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Impersonation failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="admin-panels__panel-intro admin-panels__panel-intro--spaced">
        View the platform as a student or instructor for support. All impersonation sessions are logged in the audit trail.
      </p>
      <input className="admin-os__search-input admin-panels__impersonate-search" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading ? (
        <p className="admin-panels__loading-text">Loading users…</p>
      ) : (
        <div className="admin-os__table-wrap">
          <table className="admin-os__table">
            <thead>
              <tr>{['Name', 'Email', 'Role', 'Action'].map((h) => <th key={h} className="admin-os__th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="admin-os__td admin-os__td--empty">No users match.</td></tr>
              ) : filtered.slice(0, 50).map((t) => (
                <tr key={t.id} >
                  <td className="admin-os__td admin-os__td--bold">{t.username}</td>
                  <td className="admin-os__td">{t.email}</td>
                  <td className="admin-os__td">{t.role}</td>
                  <td className="admin-os__td">
                    <button className="admin-os__btn-primary admin-os__btn-xs" disabled={busy === t.id} onClick={() => void start(t.id)}>
                      {busy === t.id ? 'Starting…' : 'View as user'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Institutions & plans (multi-tenant paid features) ───────────────────────

type FeatureKey = 'quizzes_enabled' | 'games_enabled' | 'chatbot_enabled' | 'ai_quiz_enabled' | 'openai_enabled'

const FEATURE_META: { key: FeatureKey; label: string; hint: string }[] = [
  { key: 'quizzes_enabled', label: 'Quizzes', hint: 'Create, answer & manage quizzes' },
  { key: 'games_enabled', label: 'Games', hint: 'Game studio & gameplay' },
  { key: 'chatbot_enabled', label: 'AI Chatbot', hint: 'Floating AI assistant' },
  { key: 'ai_quiz_enabled', label: 'AI Quiz Generator', hint: 'Instructor AI quiz builder' },
  { key: 'openai_enabled', label: 'OpenAI Services', hint: 'Backend AI integration' },
]

interface PlanInfo {
  id: number
  name: string
  price: number
  features: Record<FeatureKey, boolean>
  is_default: boolean
}

interface InstitutionInfo {
  id: number
  name: string
  slug: string
  status: 'active' | 'suspended' | 'trial'
  plan_id: number | null
  plan_name: string | null
  seats_limit: number | null
  email_domains: string[]
  feature_overrides: Partial<Record<FeatureKey, boolean>>
  effective_features: Record<FeatureKey, boolean>
  is_default: boolean
  created_at: string
}

// Super-admin tenant console: add universities, set plans, toggle paid features.
export function InstitutionsPanel({ adminId, showSuccess, showError }: PanelProps) {
  const { confirm } = usePanelUI()
  const [institutions, setInstitutions] = useState<InstitutionInfo[]>([])
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', plan_id: '', seats_limit: '', email_domains: '' })

  const [editTarget, setEditTarget] = useState<InstitutionInfo | null>(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE_URL}/api/super-admin/institutions`, { headers: superHeaders(adminId) }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/super-admin/plans`, { headers: superHeaders(adminId) }).then((r) => r.json()),
    ])
      .then(([i, p]) => {
        setInstitutions(i.institutions || [])
        setPlans(p.plans || [])
      })
      .catch(() => showError('Failed to load institutions'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [adminId])

  const createInstitution = async () => {
    if (!createForm.name.trim()) { showError('Institution name is required'); return }
    setBusy('create')
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/institutions`, {
        method: 'POST', headers: superHeaders(adminId),
        body: JSON.stringify({
          name: createForm.name.trim(),
          plan_id: createForm.plan_id ? Number(createForm.plan_id) : null,
          seats_limit: createForm.seats_limit ? Number(createForm.seats_limit) : null,
          email_domains: createForm.email_domains.split(',').map((d) => d.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(`Institution "${createForm.name.trim()}" created.`)
      setCreateForm({ name: '', plan_id: '', seats_limit: '', email_domains: '' })
      setShowCreate(false)
      load()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleStatus = async (inst: InstitutionInfo) => {
    const nextStatus = inst.status === 'suspended' ? 'active' : 'suspended'
    if (nextStatus === 'suspended' && !(await confirm({
      message: `Suspend "${inst.name}"? Students and instructors there will be blocked from signing in.`,
      danger: true,
    }))) return
    setBusy(`status-${inst.id}`)
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/institutions/${inst.id}`, {
        method: 'PUT', headers: superHeaders(adminId),
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(nextStatus === 'suspended' ? 'Institution suspended.' : 'Institution reactivated.')
      load()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  const removeInstitution = async (inst: InstitutionInfo) => {
    if (!(await confirm({
      message: `Delete "${inst.name}"? Members will be moved back to the Default Institution.`,
      danger: true,
    }))) return
    setBusy(`del-${inst.id}`)
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/institutions/${inst.id}`, {
        method: 'DELETE', headers: superHeaders(adminId),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error)
      showSuccess('Institution deleted.')
      load()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const suspendedCount = institutions.filter((i) => i.status === 'suspended').length

  return (
    <div className="admin-inst">
      <div className="admin-inst__summary">
        <div className="admin-inst__summary-card">
          <span className="admin-inst__summary-value">{institutions.length}</span>
          <span className="admin-inst__summary-label">Institutions</span>
        </div>
        <div className="admin-inst__summary-card">
          <span className="admin-inst__summary-value">{plans.length}</span>
          <span className="admin-inst__summary-label">Plans</span>
        </div>
        <div className={`admin-inst__summary-card${suspendedCount > 0 ? ' admin-inst__summary-card--warn' : ''}`}>
          <span className="admin-inst__summary-value">{suspendedCount}</span>
          <span className="admin-inst__summary-label">Suspended</span>
        </div>
        <div className="admin-inst__summary-card">
          <span className="admin-inst__summary-value">{institutions.filter((i) => i.status === 'active').length}</span>
          <span className="admin-inst__summary-label">Active</span>
        </div>
        <div className="admin-inst__summary-card">
          <span className="admin-inst__summary-value">{institutions.filter((i) => i.status === 'trial').length}</span>
          <span className="admin-inst__summary-label">Trial</span>
        </div>
      </div>

      {/* Plan legend */}
      {plans.length > 0 && (
        <div className="admin-inst__plans">
          <span className="admin-inst__plans-title">Available plans</span>
          <div className="admin-inst__plans-row">
            {plans.map((p) => (
              <div key={p.id} className="admin-inst__plan-chip">
                <span className="admin-inst__plan-name">{p.name}</span>
                <span className="admin-inst__plan-price">{p.price > 0 ? `$${p.price}/mo` : 'Free'}</span>
                <span className="admin-inst__plan-features">
                  {FEATURE_META.filter((f) => p.features?.[f.key]).map((f) => f.label).join(' · ') || 'No features'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="admin-panels__panel-header">
        <p className="admin-panels__panel-intro">
          Each institution is billed by plan. Toggle individual features as paid add-ons or restrictions per university.
        </p>
        <div className="admin-os__row-actions">
          <button type="button" className="admin-os__btn-secondary" onClick={load}>↻ Refresh</button>
          <button type="button" className="admin-os__btn-primary" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Cancel' : '+ New institution'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="admin-inst__create-card">
          <h3 className="admin-panels__section-title">Add institution</h3>
          <div className="admin-inst__form-grid">
            <label className="admin-inst__field">
              <span className="admin-inst__field-label">University / college name</span>
              <input className="admin-os__search-input" placeholder="e.g. Springfield University" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="admin-inst__field">
              <span className="admin-inst__field-label">Plan</span>
              <select className="admin-os__filter-select" value={createForm.plan_id} onChange={(e) => setCreateForm((f) => ({ ...f, plan_id: e.target.value }))}>
                <option value="">Default plan</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price > 0 ? ` ($${p.price}/mo)` : ' (Free)'}</option>)}
              </select>
            </label>
            <label className="admin-inst__field">
              <span className="admin-inst__field-label">Seat limit (optional)</span>
              <input className="admin-os__search-input" type="number" min={1} placeholder="Unlimited" value={createForm.seats_limit} onChange={(e) => setCreateForm((f) => ({ ...f, seats_limit: e.target.value }))} />
            </label>
            <label className="admin-inst__field">
              <span className="admin-inst__field-label">Email domains (comma separated, optional)</span>
              <input className="admin-os__search-input" placeholder="springfield.edu, mail.springfield.edu" value={createForm.email_domains} onChange={(e) => setCreateForm((f) => ({ ...f, email_domains: e.target.value }))} />
            </label>
          </div>
          <button type="button" className="admin-os__btn-primary" disabled={busy === 'create'} onClick={() => void createInstitution()}>
            {busy === 'create' ? 'Creating…' : 'Create institution'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="admin-panels__loading-text">Loading institutions…</p>
      ) : institutions.length === 0 ? (
        <p className="admin-panels__empty-msg">No institutions yet. Add your first university above.</p>
      ) : (
        <div className="admin-inst__grid">
          {institutions.map((inst) => (
            <div key={inst.id} className={`admin-inst__card${inst.status === 'suspended' ? ' admin-inst__card--suspended' : ''}`}>
              <div className="admin-inst__card-head">
                <div className="admin-inst__card-title-wrap">
                  <h3 className="admin-inst__card-title">{inst.name}</h3>
                  <span className="admin-inst__card-slug">/{inst.slug}</span>
                </div>
                <span className={`admin-inst__status admin-inst__status--${inst.status}`}>{inst.status}</span>
              </div>

              <div className="admin-inst__card-meta">
                <span className="admin-inst__plan-badge">{inst.plan_name || 'No plan'}</span>
                {inst.is_default && <span className="admin-inst__default-badge">Default</span>}
                {inst.seats_limit && (
                  <span className="admin-inst__seats">Limit: {inst.seats_limit} seats</span>
                )}
              </div>

              <div className="admin-inst__features">
                {FEATURE_META.map((f) => {
                  const on = inst.effective_features?.[f.key] !== false
                  const overridden = f.key in inst.feature_overrides
                  return (
                    <span
                      key={f.key}
                      className={`admin-inst__feature-chip${on ? ' admin-inst__feature-chip--on' : ' admin-inst__feature-chip--off'}`}
                      title={`${f.hint}${overridden ? ' (overridden)' : ' (from plan)'}`}
                    >
                      {on ? '✓' : '✕'} {f.label}{overridden ? ' *' : ''}
                    </span>
                  )
                })}
              </div>

              <div className="admin-inst__card-actions">
                <button type="button" className="admin-os__btn-secondary admin-os__btn-xs" onClick={() => setEditTarget(inst)}>Edit & features</button>
                {inst.status === 'suspended' ? (
                  <button type="button" className="admin-os__btn-success admin-os__btn-xs" disabled={busy === `status-${inst.id}`} onClick={() => void toggleStatus(inst)}>Activate</button>
                ) : (
                  <button type="button" className="admin-os__btn-secondary admin-os__btn-xs" disabled={busy === `status-${inst.id}`} onClick={() => void toggleStatus(inst)}>Suspend</button>
                )}
                {!inst.is_default && (
                  <button type="button" className="admin-os__btn-danger admin-os__btn-xs" disabled={busy === `del-${inst.id}`} onClick={() => void removeInstitution(inst)}>Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editTarget && (
        <InstitutionEditModal
          adminId={adminId}
          institution={editTarget}
          plans={plans}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load() }}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

    </div>
  )
}

// Edit institution profile, plan, and per-feature overrides.
function InstitutionEditModal({
  adminId, institution, plans, onClose, onSaved, showSuccess, showError,
}: {
  adminId: number
  institution: InstitutionInfo
  plans: PlanInfo[]
  onClose: () => void
  onSaved: () => void
  showSuccess: (m: string) => void
  showError: (m: string) => void
}) {
  const [name, setName] = useState(institution.name)
  const [planId, setPlanId] = useState<string>(institution.plan_id ? String(institution.plan_id) : '')
  const [status, setStatus] = useState(institution.status)
  const [seats, setSeats] = useState<string>(institution.seats_limit ? String(institution.seats_limit) : '')
  const [domains, setDomains] = useState(institution.email_domains.join(', '))
  // 'inherit' | 'on' | 'off' per feature
  const [overrides, setOverrides] = useState<Record<FeatureKey, 'inherit' | 'on' | 'off'>>(() => {
    const init = {} as Record<FeatureKey, 'inherit' | 'on' | 'off'>
    for (const f of FEATURE_META) {
      const v = institution.feature_overrides[f.key]
      init[f.key] = v === undefined ? 'inherit' : v ? 'on' : 'off'
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  const selectedPlan = plans.find((p) => String(p.id) === planId)

  const save = async () => {
    setSaving(true)
    try {
      const featurePatch: Record<string, boolean | null> = {}
      for (const f of FEATURE_META) {
        const mode = overrides[f.key]
        featurePatch[f.key] = mode === 'inherit' ? null : mode === 'on'
      }
      const res = await fetch(`${API_BASE_URL}/api/super-admin/institutions/${institution.id}`, {
        method: 'PUT', headers: superHeaders(adminId),
        body: JSON.stringify({
          name: name.trim(),
          plan_id: planId ? Number(planId) : null,
          status,
          seats_limit: seats ? Number(seats) : null,
          email_domains: domains.split(',').map((d) => d.trim()).filter(Boolean),
          feature_overrides: featurePatch,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(`"${name.trim()}" updated.`)
      onSaved()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-panels__modal-overlay" onClick={onClose}>
      <div className="admin-panels__modal-content admin-inst__modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="admin-panels__modal-title">Edit {institution.name}</h3>

        <div className="admin-inst__form-grid">
          <label className="admin-inst__field">
            <span className="admin-inst__field-label">Name</span>
            <input className="admin-os__search-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="admin-inst__field">
            <span className="admin-inst__field-label">Plan</span>
            <select className="admin-os__filter-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">No plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price > 0 ? ` ($${p.price}/mo)` : ' (Free)'}</option>)}
            </select>
          </label>
          <label className="admin-inst__field">
            <span className="admin-inst__field-label">Status</span>
            <select className="admin-os__filter-select" value={status} onChange={(e) => setStatus(e.target.value as InstitutionInfo['status'])}>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="admin-inst__field">
            <span className="admin-inst__field-label">Seat limit</span>
            <input className="admin-os__search-input" type="number" min={1} placeholder="Unlimited" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
          <label className="admin-inst__field admin-inst__field--wide">
            <span className="admin-inst__field-label">Email domains (comma separated)</span>
            <input className="admin-os__search-input" value={domains} onChange={(e) => setDomains(e.target.value)} />
          </label>
        </div>

        <div className="admin-inst__feature-editor">
          <h4 className="admin-inst__feature-editor-title">Feature access (paid features)</h4>
          <p className="admin-inst__feature-editor-hint">
            “Plan default” follows {selectedPlan ? `the ${selectedPlan.name} plan` : 'the assigned plan'}. Force a feature on or off to override.
          </p>
          {FEATURE_META.map((f) => {
            const planDefault = selectedPlan ? selectedPlan.features?.[f.key] !== false : true
            return (
              <div key={f.key} className="admin-inst__feature-row">
                <div className="admin-inst__feature-info">
                  <span className="admin-inst__feature-name">{f.label}</span>
                  <span className="admin-inst__feature-hint">{f.hint} · plan default: {planDefault ? 'On' : 'Off'}</span>
                </div>
                <select
                  className="admin-os__filter-select admin-inst__feature-select"
                  value={overrides[f.key]}
                  onChange={(e) => setOverrides((o) => ({ ...o, [f.key]: e.target.value as 'inherit' | 'on' | 'off' }))}
                >
                  <option value="inherit">Plan default ({planDefault ? 'On' : 'Off'})</option>
                  <option value="on">Force On</option>
                  <option value="off">Force Off</option>
                </select>
              </div>
            )
          })}
        </div>

        <div className="admin-inst__modal-actions">
          <button type="button" className="admin-os__btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="admin-os__btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Backup, restore, and data export tools for platform safety.
export function DataSafetyPanel({ adminId, showSuccess, showError }: PanelProps) {
  const { confirm } = usePanelUI()
  const [keepDays, setKeepDays] = useState(90)
  const [purging, setPurging] = useState(false)

  const purgeLogins = async () => {
    if (!(await confirm({ message: `Delete login events older than ${keepDays} days? This cannot be undone.`, danger: true }))) return
    setPurging(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/super-admin/purge-login-events`, {
        method: 'POST', headers: superHeaders(adminId),
        body: JSON.stringify({ keep_days: keepDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showSuccess(`Removed ${data.deleted} login event(s). Kept last ${keepDays} days.`)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Purge failed')
    } finally {
      setPurging(false)
    }
  }

  return (
    <div>
      <p className="admin-panels__danger-meta">
        Irreversible maintenance operations. Each action is recorded in the audit log.
      </p>

      <div className="admin-panels__danger-zone">
        <h3 className="admin-panels__section-title admin-panels__section-title--sm">Purge old login events</h3>
        <p className="admin-panels__section-desc">
          Remove login history older than the retention period to keep the database lean.
        </p>
        <div className="admin-panels__purge-row">
          <label className="admin-panels__purge-label">
            Keep last{' '}
            <input type="number" min={7} max={365} value={keepDays} onChange={(e) => setKeepDays(Number(e.target.value))} className="admin-panels__number-input" />
            {' '}days
          </label>
          <button type="button" className="admin-os__btn-danger" onClick={() => void purgeLogins()} disabled={purging}>
            {purging ? 'Purging…' : 'Purge login events'}
          </button>
        </div>
      </div>

      <div className="admin-panels__danger-zone admin-panels__bulk-ops">
        <h3 className="admin-panels__section-title admin-panels__section-title--sm admin-panels__section-title--warn">Bulk user operations</h3>
        <p className="admin-panels__section-desc admin-panels__section-desc--warn">
          Use the <strong>Users</strong> tab for bulk suspend and delete. Export user data from the Users toolbar. Full audit exports are available on the <strong>Audit Log</strong> tab.
        </p>
      </div>
    </div>
  )
}
