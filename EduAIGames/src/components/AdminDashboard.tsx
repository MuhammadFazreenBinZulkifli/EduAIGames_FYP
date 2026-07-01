import './App_CSS/AdminDashboard_CSS.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import {
  downloadImportTemplate,
  parseSpreadsheetFile,
  type ParsedImportRow,
} from '../utils/adminBulkImport'
import { downloadAdminExport } from './admin/adminExport'
import {
  OverviewPanel,
  AnalyticsPanel,
  ContentPanel,
  CoursesPanel,
  AuditPanel,
  SettingsPanel,
  AdminNotificationsBell,
  UserDetailModal,
  AdminsManagementPanel,
  SystemHealthPanel,
  InstitutionsPanel,
  type LoginDayBucket,
} from './admin/AdminExtendedPanels'

// ─── Props & Interfaces ──────────────────────────────────────────────────────

interface AdminDashboardProps {
  adminId: number
  adminEmail?: string
  onLogout: () => void
  isSuperAdmin?: boolean
  institutionName?: string
  planName?: string
  onImpersonate?: (user: { id: number; username: string; email: string; role: string }) => void
}

function isStaffRole(role: string) {
  return role === 'Admin' || role === 'SuperAdmin'
}

interface UserRow {
  id: number
  username: string
  email: string
  role: 'Instructor' | 'Student' | 'Admin' | 'SuperAdmin'
  account_status?: 'pending' | 'approved' | 'rejected' | 'suspended'
  created_at?: string
}

interface PendingUserRow {
  id: number
  username: string
  email: string
  role: 'Instructor' | 'Student'
  created_at?: string
}

interface ClassRow {
  id: number
  title: string
  description: string
  join_code: string
  instructor_username: string
  created_at?: string
}

interface QuizRow {
  id: number
  title: string
  description: string
  instructor_username: string
  class_title?: string
  created_at?: string
}

interface ImportSummary {
  created: number
  skipped: number
  failed: number
  validationErrors?: { row: number; email: string; message: string }[]
  importErrors?: { row: number; email: string; message: string }[]
}

type AdminTab =
  | 'overview'
  | 'users'
  | 'approvals'
  | 'analytics'
  | 'content'
  | 'courses'
  | 'classes'
  | 'quizzes'
  | 'import'
  | 'audit'
  | 'settings'
  | 'admins'
  | 'institutions'
  | 'system'
  | 'impersonate'
  | 'data-safety'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function adminHeaders(adminId: number): HeadersInit {
  return { 'Content-Type': 'application/json', 'X-Admin-Id': String(adminId) }
}

function formatDate(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const ROWS_PER_PAGE = 12
const ALERT_AUTO_DISMISS_MS = 4500

function CellText({ text, empty = '—' }: { text?: string; empty?: string }) {
  const display = text?.trim() ? text.trim() : empty
  return (
    <span
      title={text?.trim() || undefined}
      className="admin-os__cell-text"
    >
      {display}
    </span>
  )
}

function Paginator({
  total, page, setPage,
}: { total: number; page: number; setPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE))
  if (pages === 1) return null

  const visible: (number | '…')[] = []
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) visible.push(i)
  } else {
    visible.push(1)
    if (page > 3) visible.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) visible.push(i)
    if (page < pages - 2) visible.push('…')
    visible.push(pages)
  }

  return (
    <div className="admin-os__pagination">
      <span className="admin-os__pagination-info">
        Page {page} of {pages}
      </span>
      <button className={`admin-os__page-btn${page === 1 ? ' admin-os__page-btn--disabled' : ''}`} disabled={page === 1} onClick={() => setPage(1)}>«</button>
      <button className={`admin-os__page-btn${page === 1 ? ' admin-os__page-btn--disabled' : ''}`} disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
      {visible.map((v, i) =>
        v === '…' ? (
          <span key={`e${i}`} className="admin-os__pagination-ellipsis">…</span>
        ) : (
          <button key={v} className={`admin-os__page-btn${v === page ? ' admin-os__page-btn--active' : ''}`} onClick={() => setPage(Number(v))}>
            {v}
          </button>
        )
      )}
      <button className={`admin-os__page-btn${page === pages ? ' admin-os__page-btn--disabled' : ''}`} disabled={page === pages} onClick={() => setPage(page + 1)}>›</button>
      <button className={`admin-os__page-btn${page === pages ? ' admin-os__page-btn--disabled' : ''}`} disabled={page === pages} onClick={() => setPage(pages)}>»</button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

// Main admin console for user approvals, content management, and platform settings.
function AdminDashboard({ adminId, adminEmail, onLogout, isSuperAdmin = false, institutionName, planName }: AdminDashboardProps) {
  const { confirm, prompt } = usePanelUI()
  // SuperAdmin lands on Institutions; Admin lands on Overview.
  const [activeTab, setActiveTab] = useState<AdminTab>(isSuperAdmin ? 'institutions' : 'overview')
  const [users, setUsers] = useState<UserRow[]>([])
  const [pendingUsers, setPendingUsers] = useState<PendingUserRow[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [quizzes, setQuizzes] = useState<QuizRow[]>([])
  const [gamesCount, setGamesCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())
  const [detailUserId, setDetailUserId] = useState<number | null>(null)
  const [loginActivity, setLoginActivity] = useState<LoginDayBucket[]>([])

  // Users filter/page
  const [userSearch, setUserSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'Instructor' | 'Student' | 'Admin'>('all')
  const [userPage, setUserPage] = useState(1)

  // Classes/Quizzes page
  const [classSearch, setClassSearch] = useState('')
  const [classPage, setClassPage] = useState(1)
  const [quizSearch, setQuizSearch] = useState('')
  const [quizPage, setQuizPage] = useState(1)

  // Import
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = null
    }
  }, [])

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  const showSuccess = useCallback((message: string) => {
    clearSuccessTimer()
    setSuccess(message)
    successTimerRef.current = setTimeout(() => {
      setSuccess(null)
      successTimerRef.current = null
    }, ALERT_AUTO_DISMISS_MS)
  }, [clearSuccessTimer])

  const showError = useCallback((message: string) => {
    clearErrorTimer()
    setError(message)
    errorTimerRef.current = setTimeout(() => {
      setError(null)
      errorTimerRef.current = null
    }, ALERT_AUTO_DISMISS_MS)
  }, [clearErrorTimer])

  useEffect(() => () => {
    clearSuccessTimer()
    clearErrorTimer()
  }, [clearSuccessTimer, clearErrorTimer])

  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab)
    setSuccess(null)
    setError(null)
    clearSuccessTimer()
    clearErrorTimer()
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  // SuperAdmin has no access to user/content data — only institutions, admins, settings, audit, system health.
  const fetchAll = async () => {
    if (isSuperAdmin) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const headers = adminHeaders(adminId)
      const [usersRes, pendingRes, classesRes, quizzesRes, gamesRes, loginRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/users`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/users/pending`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/classes`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/quizzes`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/games`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/login-activity?days=14`, { headers }),
      ])
      if (!usersRes.ok || !pendingRes.ok || !classesRes.ok || !quizzesRes.ok) {
        const err = await usersRes.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to fetch admin data')
      }
      const [u, p, c, q, g, loginData] = await Promise.all([
        usersRes.json(),
        pendingRes.json(),
        classesRes.json(),
        quizzesRes.json(),
        gamesRes.ok ? gamesRes.json() : Promise.resolve({ games: [] }),
        loginRes.ok ? loginRes.json() : Promise.resolve({ activity: [] }),
      ])
      setUsers(u.users || [])
      setPendingUsers(p.pending || [])
      setClasses(c.classes || [])
      setQuizzes(q.quizzes || [])
      setGamesCount((g.games as unknown[])?.length ?? 0)
      setLoginActivity(loginData.activity || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchAll() }, [adminId])

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return users.filter((u) => {
      if (isStaffRole(u.role)) return false
      if (u.account_status === 'pending') return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, userSearch, roleFilter])

  const pagedUsers = filteredUsers.slice((userPage - 1) * ROWS_PER_PAGE, userPage * ROWS_PER_PAGE)

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase()
    if (!q) return classes
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.instructor_username.toLowerCase().includes(q) ||
        c.join_code.toLowerCase().includes(q)
    )
  }, [classes, classSearch])

  const pagedClasses = filteredClasses.slice((classPage - 1) * ROWS_PER_PAGE, classPage * ROWS_PER_PAGE)

  const filteredQuizzes = useMemo(() => {
    const q = quizSearch.trim().toLowerCase()
    if (!q) return quizzes
    return quizzes.filter(
      (q2) =>
        q2.title.toLowerCase().includes(q) ||
        q2.instructor_username.toLowerCase().includes(q) ||
        (q2.class_title || '').toLowerCase().includes(q)
    )
  }, [quizzes, quizSearch])

  const pagedQuizzes = filteredQuizzes.slice((quizPage - 1) * ROWS_PER_PAGE, quizPage * ROWS_PER_PAGE)

  // ── User actions ───────────────────────────────────────────────────────────

  const approveRegistration = async (user: PendingUserRow) => {
    try {
      setBusyId(`approve-${user.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/approve`, {
        method: 'POST',
        headers: adminHeaders(adminId),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to approve registration')
      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id))
      await fetchAll()
      const emailNote = data.emailSent
        ? ' Notification email sent.'
        : data.emailError
          ? ` Notification email could not be sent (${data.emailError}).`
          : ' Notification email was not sent.'
      showSuccess(`${user.username} approved. They can now log in.${emailNote}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve registration')
    } finally {
      setBusyId(null)
    }
  }

  const rejectRegistration = async (user: PendingUserRow) => {
    if (!(await confirm({ message: `Reject registration for "${user.username}" (${user.email})?`, danger: true }))) return
    try {
      setBusyId(`reject-${user.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/reject`, {
        method: 'POST',
        headers: adminHeaders(adminId),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to reject registration')
      setPendingUsers((prev) => prev.filter((u) => u.id !== user.id))
      const emailNote = data.emailSent
        ? ' Notification email sent.'
        : data.emailError
          ? ` Notification email could not be sent (${data.emailError}).`
          : ' Notification email was not sent.'
      showSuccess(`Registration rejected.${emailNote}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reject registration')
    } finally {
      setBusyId(null)
    }
  }

  const toggleUserSelect = (id: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDeleteUsers = async () => {
    if (selectedUserIds.size === 0) { showError('Select users first'); return }
    if (!(await confirm({ message: `Delete ${selectedUserIds.size} selected user(s)?`, danger: true }))) return
    try {
      setBusyId('bulk-delete')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/bulk-delete`, {
        method: 'POST',
        headers: adminHeaders(adminId),
        body: JSON.stringify({ user_ids: [...selectedUserIds] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSelectedUserIds(new Set())
      await fetchAll()
      showSuccess(`${data.deleted} user(s) deleted.`)
    } catch (err) { showError(err instanceof Error ? err.message : 'Bulk delete failed') }
    finally { setBusyId(null) }
  }

  const approveAllPending = async () => {
    if (!(await confirm({ message: `Approve all ${pendingUsers.length} pending registration(s)?` }))) return
    try {
      setBusyId('approve-all')
      const res = await fetch(`${API_BASE_URL}/api/admin/users/approve-all`, {
        method: 'POST', headers: adminHeaders(adminId),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchAll()
      showSuccess(`${data.approved} registration(s) approved.`)
    } catch (err) { showError(err instanceof Error ? err.message : 'Bulk approve failed') }
    finally { setBusyId(null) }
  }

  const suspendUser = async (user: UserRow) => {
    try {
      setBusyId(`suspend-${user.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/suspend`, {
        method: 'POST', headers: adminHeaders(adminId),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchAll()
      showSuccess(`${user.username} suspended.`)
    } catch (err) { showError(err instanceof Error ? err.message : 'Suspend failed') }
    finally { setBusyId(null) }
  }

  const unsuspendUser = async (user: UserRow) => {
    try {
      setBusyId(`unsuspend-${user.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}/unsuspend`, {
        method: 'POST', headers: adminHeaders(adminId),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchAll()
      showSuccess(`${user.username} reactivated.`)
    } catch (err) { showError(err instanceof Error ? err.message : 'Unsuspend failed') }
    finally { setBusyId(null) }
  }

  const promoteToAdmin = async (user: UserRow) => {
    if (!isSuperAdmin) return
    if (!(await confirm({ message: `Promote "${user.username}" to administrator?` }))) return
    try {
      setBusyId(`promote-${user.id}`)
      const res = await fetch(`${API_BASE_URL}/api/super-admin/admins/${user.id}/promote`, {
        method: 'POST', headers: adminHeaders(adminId),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await fetchAll()
      showSuccess(`${user.username} is now an administrator.`)
    } catch (err) { showError(err instanceof Error ? err.message : 'Promote failed') }
    finally { setBusyId(null) }
  }

  const deleteUser = async (user: UserRow) => {
    if (isStaffRole(user.role)) { showError('Cannot delete administrator accounts'); return }
    if (!(await confirm({ message: `Delete "${user.username}" (${user.email})?`, danger: true }))) return
    try {
      setBusyId(`user-${user.id}`)
      setError(null)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${user.id}`, {
        method: 'DELETE', headers: adminHeaders(adminId),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete user') }
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      showSuccess('User deleted successfully.')
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to delete user') }
    finally { setBusyId(null) }
  }

  // ── Class actions ──────────────────────────────────────────────────────────

  const deleteClass = async (id: number) => {
    if (!(await confirm({ message: 'Delete this class?', danger: true }))) return
    try {
      setBusyId(`class-${id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/classes/${id}`, { method: 'DELETE', headers: adminHeaders(adminId) })
      if (!res.ok) throw new Error('Failed to delete class')
      setClasses((prev) => prev.filter((c) => c.id !== id))
      showSuccess('Class deleted successfully.')
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to delete class') }
    finally { setBusyId(null) }
  }

  const editClass = async (c: ClassRow) => {
    const title = await prompt({ title: 'Edit class', label: 'Class title', defaultValue: c.title })
    if (!title) return
    const desc = (await prompt({ title: 'Edit class', label: 'Description', defaultValue: c.description || '' })) ?? ''
    try {
      setBusyId(`class-edit-${c.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/classes/${c.id}`, {
        method: 'PUT', headers: adminHeaders(adminId), body: JSON.stringify({ title, description: desc }),
      })
      if (!res.ok) throw new Error('Failed to update class')
      setClasses((prev) => prev.map((cl) => cl.id === c.id ? { ...cl, title, description: desc } : cl))
      showSuccess('Class updated successfully.')
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to update class') }
    finally { setBusyId(null) }
  }

  // ── Quiz actions ───────────────────────────────────────────────────────────

  const deleteQuiz = async (id: number) => {
    if (!(await confirm({ message: 'Delete this quiz?', danger: true }))) return
    try {
      setBusyId(`quiz-${id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/quizzes/${id}`, { method: 'DELETE', headers: adminHeaders(adminId) })
      if (!res.ok) throw new Error('Failed to delete quiz')
      setQuizzes((prev) => prev.filter((q) => q.id !== id))
      showSuccess('Quiz deleted successfully.')
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to delete quiz') }
    finally { setBusyId(null) }
  }

  const editQuiz = async (quiz: QuizRow) => {
    const title = await prompt({ title: 'Edit quiz', label: 'Quiz title', defaultValue: quiz.title })
    if (!title) return
    const desc = (await prompt({ title: 'Edit quiz', label: 'Description', defaultValue: quiz.description || '' })) ?? ''
    try {
      setBusyId(`quiz-edit-${quiz.id}`)
      const res = await fetch(`${API_BASE_URL}/api/admin/quizzes/${quiz.id}`, {
        method: 'PUT', headers: adminHeaders(adminId), body: JSON.stringify({ title, description: desc }),
      })
      if (!res.ok) throw new Error('Failed to update quiz')
      setQuizzes((prev) => prev.map((q) => q.id === quiz.id ? { ...q, title, description: desc } : q))
      showSuccess('Quiz updated successfully.')
    } catch (err) { showError(err instanceof Error ? err.message : 'Failed to update quiz') }
    finally { setBusyId(null) }
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportSummary(null); setError(null)
    try {
      const rows = await parseSpreadsheetFile(file)
      setImportRows(rows); setImportFileName(file.name)
      showSuccess(`Loaded ${rows.length} row(s) from ${file.name}`)
    } catch (err) {
      setImportRows([]); setImportFileName('')
      showError(err instanceof Error ? err.message : 'Failed to parse file')
    }
    e.target.value = ''
  }

  const runImport = async () => {
    if (importRows.length === 0) { showError('Upload a spreadsheet first'); return }
    try {
      setImportLoading(true); setError(null); setSuccess(null)
      const res = await fetch(`${API_BASE_URL}/api/admin/users/import`, {
        method: 'POST', headers: adminHeaders(adminId), body: JSON.stringify({ users: importRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setImportSummary({ created: data.created ?? 0, skipped: data.skipped ?? 0, failed: data.failed ?? 0, validationErrors: data.validationErrors, importErrors: data.importErrors })
      showSuccess(`Import complete: ${data.created} created, ${data.skipped} skipped, ${data.failed} failed.`)
      setImportRows([]); setImportFileName('')
      await fetchAll(); switchTab('users')
    } catch (err) { showError(err instanceof Error ? err.message : 'Import failed') }
    finally { setImportLoading(false) }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  // Admin sees all platform data; SuperAdmin only manages institutions, accounts, system, and platform config.
  const adminOnlyTabs: { id: AdminTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users', count: users.filter((u) => u.account_status !== 'pending' && !isStaffRole(u.role)).length },
    { id: 'approvals', label: 'Approvals', count: pendingUsers.length || undefined },
    { id: 'analytics', label: 'Analytics' },
    { id: 'content', label: 'Content' },
    { id: 'courses', label: 'Courses' },
    { id: 'classes', label: 'Classes', count: classes.length },
    { id: 'quizzes', label: 'Quizzes', count: quizzes.length },
    { id: 'import', label: 'Import' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'settings', label: 'Settings' },
  ]

  const superAdminTabs: { id: AdminTab; label: string; count?: number }[] = [
    { id: 'institutions', label: 'Institutions' },
    { id: 'admins', label: 'Admins' },
    { id: 'settings', label: 'Settings' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'system', label: 'System Health' },
  ]

  const tabs = isSuperAdmin ? superAdminTabs : adminOnlyTabs

  const heroCopy: Record<AdminTab, { title: string; sub: string }> = {
    overview: { title: 'Platform Overview', sub: 'Key metrics and health snapshot for EduAIGames.' },
    users: { title: 'User Management', sub: isSuperAdmin ? 'Suspend, promote, view details, and export user data.' : 'Suspend access, view details, and export user data.' },
    approvals: { title: 'Pending Registrations', sub: 'Review and approve or reject new sign-up requests.' },
    analytics: { title: 'Quiz Analytics', sub: 'Platform-wide quiz performance and exportable attempt data.' },
    content: { title: 'Games & Materials', sub: 'Oversee published games and class learning materials.' },
    courses: { title: 'Course Catalog', sub: 'View instructor courses and student enrollment counts.' },
    classes: { title: 'Class Management', sub: 'Review and administer all classes created by instructors.' },
    quizzes: { title: 'Quiz Management', sub: 'Browse and manage quizzes across all instructors.' },
    import: { title: 'Bulk Account Import', sub: 'Import multiple accounts from Excel or CSV spreadsheets.' },
    audit: { title: 'Audit Log', sub: 'Track admin actions. Export available for compliance.' },
    settings: { title: 'System Settings', sub: isSuperAdmin ? 'Platform-wide rules, maintenance mode, and feature controls.' : 'Control registration rules, email service, and platform options.' },
    admins: { title: 'Administrator Accounts', sub: 'Create, suspend, demote, or remove platform administrators.' },
    institutions: { title: 'Institutions & Plans', sub: 'Manage universities, assign plans, and toggle paid features per institution.' },
    system: { title: 'System Health', sub: 'Database status, integrations, and live platform metrics.' },
    impersonate: { title: 'User Impersonation', sub: 'View the platform as a student or instructor for support.' },
    'data-safety': { title: 'Data & Safety', sub: 'Permanent maintenance tools. Purge old data with a full audit trail.' },
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="admin-os__page">
      {/* Top bar */}
      <div className="admin-os__top-bar">
        <span className="admin-os__top-bar-title">
          {isSuperAdmin ? '★ EduAIGames Super Admin Console' : '⚙ EduAIGames Administration Panel'}
        </span>
        <div className="admin-os__top-bar-right">
          {!isSuperAdmin && institutionName && (
            <span className="admin-os__institution-badge">
              {institutionName}{planName ? ` · ${planName}` : ''}
            </span>
          )}
          {isSuperAdmin && (
            <span className="admin-os__super-badge">SUPER ADMIN</span>
          )}
          {!isSuperAdmin && (
            <AdminNotificationsBell adminId={adminId} onOpenApprovals={() => switchTab('approvals')} />
          )}
          {adminEmail && <span className="admin-os__top-bar-email">{adminEmail}</span>}
          <button className="admin-os__logout-btn" onClick={onLogout}>Log Out</button>
        </div>
      </div>

      {/* Hero */}
      <div className="admin-os__hero">
        <h1 className="admin-os__hero-title">{heroCopy[activeTab].title}</h1>
        <p className="admin-os__hero-sub">{heroCopy[activeTab].sub}</p>
      </div>

      {/* Nav tabs */}
      <nav className="admin-os__nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`admin-os__nav-tab${activeTab === tab.id ? ' admin-os__nav-tab--active' : ''}`}
            onClick={() => switchTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="admin-os__tab-count">
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <div className="admin-os__nav-spacer" />
        {!isSuperAdmin && (
          <button type="button" className="admin-os__logout-btn admin-os__refresh-btn" onClick={() => void fetchAll()}>
            ↻ Refresh
          </button>
        )}
      </nav>

      {/* Body */}
      <div className="admin-os__body">

        {error && (
          <div className="admin-os__alert admin-os__alert--error" role="alert">
            {error}
            <button type="button" className="admin-os__alert-dismiss" onClick={() => { setError(null); clearErrorTimer() }} aria-label="Dismiss">×</button>
          </div>
        )}
        {success && (
          <div className="admin-os__alert admin-os__alert--success" role="status">
            {success}
            <button type="button" className="admin-os__alert-dismiss" onClick={() => { setSuccess(null); clearSuccessTimer() }} aria-label="Dismiss">×</button>
          </div>
        )}
        {loading && !isSuperAdmin && activeTab !== 'overview' && activeTab !== 'analytics' && activeTab !== 'content' && activeTab !== 'courses' && activeTab !== 'audit' && activeTab !== 'settings' && (
          <div className="admin-os__loading">
            Loading data…
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewPanel
            adminId={adminId}
            users={users}
            pendingUsers={pendingUsers}
            classes={classes}
            quizzes={quizzes}
            gamesCount={gamesCount}
            loginActivity={loginActivity}
            onOpenApprovals={() => switchTab('approvals')}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {activeTab === 'content' && (
          <ContentPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {activeTab === 'courses' && (
          <CoursesPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {activeTab === 'audit' && (
          <AuditPanel adminId={adminId} showSuccess={showSuccess} showError={showError} isSuperAdmin={isSuperAdmin} />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel adminId={adminId} showSuccess={showSuccess} showError={showError} isSuperAdmin={isSuperAdmin} />
        )}

        {/* ── SUPER ADMIN TABS (institutions, admins, settings, audit, system only) ── */}
        {isSuperAdmin && activeTab === 'institutions' && (
          <InstitutionsPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {isSuperAdmin && activeTab === 'admins' && (
          <AdminsManagementPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {isSuperAdmin && activeTab === 'system' && (
          <SystemHealthPanel adminId={adminId} showSuccess={showSuccess} showError={showError} />
        )}

        {/* ── USERS TAB ─────────────────────────────────────────── */}
        {!loading && activeTab === 'users' && (
          <>
            <div className="admin-os__toolbar">
              {/* search icon trick with a wrapper */}
              <div className="admin-os__search-wrap">
                <span className="admin-os__search-icon">⌕</span>
                <input
                  className="admin-os__search-input"
                  type="search"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1) }}
                />
              </div>
              <select
                className="admin-os__filter-select"
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value as typeof roleFilter); setUserPage(1) }}
              >
                <option value="all">All Roles</option>
                <option value="Instructor">Instructor</option>
                <option value="Student">Student</option>
                <option value="Admin">Admin</option>
              </select>
              <div className="admin-os__toolbar-spacer" />
              <span className="admin-os__toolbar-count">
                {filteredUsers.length} of {users.length} account{users.length !== 1 ? 's' : ''}
              </span>
              <button className="admin-os__btn-secondary" type="button" onClick={() => downloadAdminExport(adminId, 'users').then(() => showSuccess('Users exported.')).catch((e) => showError(e.message))}>
                ↓ Export
              </button>
              {selectedUserIds.size > 0 && (
                <button className="admin-os__btn-danger" type="button" disabled={busyId === 'bulk-delete'} onClick={() => void bulkDeleteUsers()}>
                  Delete selected ({selectedUserIds.size})
                </button>
              )}
              <button className="admin-os__btn-primary" type="button" onClick={() => switchTab('import')}>
                + Import
              </button>
            </div>

            <div className="admin-os__table-wrap">
              <table className="admin-os__table">
                <colgroup>
                  <col className="admin-os__col-w36" />
                  <col className="admin-os__col-pct20" />
                  <col className="admin-os__col-pct36" />
                  <col className="admin-os__col-w88" />
                  <col className="admin-os__col-w88" />
                  <col className="admin-os__col-w108" />
                  <col className="admin-os__col-w96" />
                </colgroup>
                <thead>
                  <tr>
                    {['', '#', 'Full Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map((h, i) => (
                      <th
                        key={h}
                        className={i === 0 ? 'admin-os__th admin-os__th--checkbox' : 'admin-os__th'}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="admin-os__td admin-os__td--empty">
                        No accounts match your search.
                      </td>
                    </tr>
                  ) : (
                    pagedUsers.map((user, idx) => (
                      <tr
                        key={user.id}
                        
                      >
                        <td className="admin-os__td admin-os__td--center">
                          {!isStaffRole(user.role) && (
                            <input type="checkbox" checked={selectedUserIds.has(user.id)} onChange={() => toggleUserSelect(user.id)} aria-label={`Select ${user.username}`} />
                          )}
                        </td>
                        <td className="admin-os__td admin-os__td-num">
                          {(userPage - 1) * ROWS_PER_PAGE + idx + 1}
                        </td>
                        <td className="admin-os__td admin-os__td--overflow">
                          <div className="admin-os__user-cell">
                            <div className={`admin-os__avatar admin-os__avatar--${user.role}`}>
                              {initials(user.username)}
                            </div>
                            <span
                              title={user.username}
                              className="admin-os__username"
                            >
                              {user.username}
                            </span>
                          </div>
                        </td>
                        <td className="admin-os__td admin-os__td-clamp admin-os__td--muted">
                          <CellText text={user.email} />
                        </td>
                        <td className="admin-os__td"><span className={`admin-os__role-badge admin-os__role-badge--${user.role}`}>{user.role}</span></td>
                        <td className="admin-os__td">
                          <span className={`admin-os__status-badge admin-os__status-badge--${user.account_status || 'approved'}`}>
                            {user.account_status || 'approved'}
                          </span>
                        </td>
                        <td className="admin-os__td admin-os__td--muted admin-os__td--nowrap">{formatDate(user.created_at)}</td>
                        <td className="admin-os__td">
                          {!isStaffRole(user.role) ? (
                            <div className="admin-os__row-actions admin-os__row-actions--sm">
                              <button className="admin-os__btn-secondary admin-os__btn-xs" onClick={() => setDetailUserId(user.id)}>View</button>
                              {isSuperAdmin && (user.role === 'Instructor' || user.role === 'Student') && (
                                <button className="admin-os__btn-secondary admin-os__btn-xs" disabled={busyId === `promote-${user.id}`} onClick={() => void promoteToAdmin(user)}>Promote</button>
                              )}
                              {user.account_status === 'suspended' ? (
                                <button className="admin-os__btn-success admin-os__btn-xs" disabled={busyId === `unsuspend-${user.id}`} onClick={() => void unsuspendUser(user)}>Activate</button>
                              ) : (
                                <button className="admin-os__btn-secondary admin-os__btn-xs" disabled={busyId === `suspend-${user.id}`} onClick={() => void suspendUser(user)}>Suspend</button>
                              )}
                              <button className="admin-os__btn-danger admin-os__btn-xs" disabled={busyId === `user-${user.id}`} onClick={() => deleteUser(user)}>Delete</button>
                            </div>
                          ) : (
                            <span className="admin-os__protected-label">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Paginator total={filteredUsers.length} page={userPage} setPage={setUserPage} />
          </>
        )}

        {/* ── APPROVALS TAB ─────────────────────────────────────── */}
        {!loading && activeTab === 'approvals' && (
          <>
            <div className="admin-os__toolbar">
              <span className="admin-os__toolbar-count">
                {pendingUsers.length} registration request{pendingUsers.length !== 1 ? 's' : ''} awaiting review
              </span>
              <div className="admin-os__toolbar-spacer" />
              {pendingUsers.length > 0 && (
                <button className="admin-os__btn-success" type="button" disabled={busyId === 'approve-all'} onClick={() => void approveAllPending()}>
                  Approve all ({pendingUsers.length})
                </button>
              )}
              <button className="admin-os__btn-secondary" type="button" onClick={() => downloadAdminExport(adminId, 'pending').catch((e) => showError(e.message))}>
                ↓ Export
              </button>
              <button className="admin-os__btn-primary" type="button" onClick={fetchAll}>
                ↻ Refresh
              </button>
            </div>

            <div className="admin-os__table-wrap">
              <table className="admin-os__table">
                <thead>
                  <tr>
                    {['#', 'Full Name', 'Email', 'Role', 'Submitted', 'Actions'].map((h) => (
                      <th key={h} className="admin-os__th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-os__td admin-os__td--empty">
                        No pending registrations. New sign-ups will appear here for approval.
                      </td>
                    </tr>
                  ) : (
                    pendingUsers.map((user, idx) => (
                      <tr key={user.id} >
                        <td className="admin-os__td admin-os__td-num">{idx + 1}</td>
                        <td className="admin-os__td admin-os__td--bold">{user.username}</td>
                        <td className="admin-os__td admin-os__td--muted"><CellText text={user.email} /></td>
                        <td className="admin-os__td"><span className={`admin-os__role-badge admin-os__role-badge--${user.role}`}>{user.role}</span></td>
                        <td className="admin-os__td admin-os__td--muted admin-os__td--nowrap">{formatDate(user.created_at)}</td>
                        <td className="admin-os__td">
                          <div className="admin-os__row-actions">
                            <button
                              className="admin-os__btn-success admin-os__btn-sm"
                              disabled={busyId === `approve-${user.id}`}
                              onClick={() => approveRegistration(user)}
                            >
                              ✓ Approve
                            </button>
                            <button
                              className="admin-os__btn-danger admin-os__btn-sm"
                              disabled={busyId === `reject-${user.id}`}
                              onClick={() => rejectRegistration(user)}
                            >
                              ✕ Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── CLASSES TAB ───────────────────────────────────────── */}
        {!loading && activeTab === 'classes' && (
          <>
            <div className="admin-os__toolbar">
              <div className="admin-os__search-wrap">
                <span className="admin-os__search-icon">⌕</span>
                <input
                  className="admin-os__search-input"
                  type="search"
                  placeholder="Search by title, instructor, or join code…"
                  value={classSearch}
                  onChange={(e) => { setClassSearch(e.target.value); setClassPage(1) }}
                />
              </div>
              <div className="admin-os__toolbar-spacer" />
              <span className="admin-os__toolbar-count">
                {filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''}
              </span>
              <button className="admin-os__btn-secondary" type="button" onClick={() => downloadAdminExport(adminId, 'classes').catch((e) => showError(e.message))}>↓ Export</button>
            </div>

            <div className="admin-os__table-wrap">
              <table className="admin-os__table">
                <colgroup>
                  <col className="admin-os__col-w40" />
                  <col className="admin-os__col-pct14" />
                  <col className="admin-os__col-pct32" />
                  <col className="admin-os__col-pct14" />
                  <col className="admin-os__col-pct10" />
                  <col className="admin-os__col-pct12" />
                  <col className="admin-os__col-pct12" />
                </colgroup>
                <thead>
                  <tr>
                    {['#', 'Class Title', 'Description', 'Instructor', 'Join Code', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="admin-os__th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedClasses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-os__td admin-os__td--empty">
                        No classes found.
                      </td>
                    </tr>
                  ) : (
                    pagedClasses.map((c, idx) => (
                      <tr key={c.id} >
                        <td className="admin-os__td admin-os__td--index">{(classPage - 1) * ROWS_PER_PAGE + idx + 1}</td>
                        <td className="admin-os__td admin-os__td--bold">
                          <CellText text={c.title} />
                        </td>
                        <td className="admin-os__td admin-os__td-clamp admin-os__td--muted">
                          <CellText text={c.description} />
                        </td>
                        <td className="admin-os__td admin-os__td-clamp">
                          <CellText text={c.instructor_username} />
                        </td>
                        <td className="admin-os__td admin-os__td--mono">{c.join_code}</td>
                        <td className="admin-os__td admin-os__td--muted admin-os__td--nowrap">{formatDate(c.created_at)}</td>
                        <td className="admin-os__td">
                          <div className="admin-os__row-actions">
                            <button className="admin-os__btn-secondary admin-os__btn-sm" disabled={busyId === `class-edit-${c.id}`} onClick={() => editClass(c)}>✏ Edit</button>
                            <button className="admin-os__btn-danger admin-os__btn-sm" disabled={busyId === `class-${c.id}`} onClick={() => deleteClass(c.id)}>🗑 Del</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Paginator total={filteredClasses.length} page={classPage} setPage={setClassPage} />
          </>
        )}

        {/* ── QUIZZES TAB ───────────────────────────────────────── */}
        {!loading && activeTab === 'quizzes' && (
          <>
            <div className="admin-os__toolbar">
              <div className="admin-os__search-wrap">
                <span className="admin-os__search-icon">⌕</span>
                <input
                  className="admin-os__search-input"
                  type="search"
                  placeholder="Search by title, instructor, or class…"
                  value={quizSearch}
                  onChange={(e) => { setQuizSearch(e.target.value); setQuizPage(1) }}
                />
              </div>
              <div className="admin-os__toolbar-spacer" />
              <span className="admin-os__toolbar-count">
                {filteredQuizzes.length} quiz{filteredQuizzes.length !== 1 ? 'zes' : ''}
              </span>
              <button className="admin-os__btn-secondary" type="button" onClick={() => downloadAdminExport(adminId, 'quizzes').catch((e) => showError(e.message))}>↓ Export</button>
            </div>

            <div className="admin-os__table-wrap">
              <table className="admin-os__table">
                <colgroup>
                  <col className="admin-os__col-w40" />
                  <col className="admin-os__col-pct14" />
                  <col className="admin-os__col-pct28" />
                  <col className="admin-os__col-pct14" />
                  <col className="admin-os__col-pct14" />
                  <col className="admin-os__col-pct12" />
                  <col className="admin-os__col-pct12" />
                </colgroup>
                <thead>
                  <tr>
                    {['#', 'Quiz Title', 'Description', 'Instructor', 'Class', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="admin-os__th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedQuizzes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-os__td admin-os__td--empty">
                        No quizzes found.
                      </td>
                    </tr>
                  ) : (
                    pagedQuizzes.map((q, idx) => (
                      <tr key={q.id} >
                        <td className="admin-os__td admin-os__td--index">{(quizPage - 1) * ROWS_PER_PAGE + idx + 1}</td>
                        <td className="admin-os__td admin-os__td--bold">
                          <CellText text={q.title} />
                        </td>
                        <td className="admin-os__td admin-os__td-clamp admin-os__td--muted">
                          <CellText text={q.description} />
                        </td>
                        <td className="admin-os__td admin-os__td-clamp">
                          <CellText text={q.instructor_username} />
                        </td>
                        <td className="admin-os__td admin-os__td-clamp admin-os__td--muted">
                          <CellText text={q.class_title || undefined} empty="Unassigned" />
                        </td>
                        <td className="admin-os__td admin-os__td--muted admin-os__td--nowrap">{formatDate(q.created_at)}</td>
                        <td className="admin-os__td">
                          <div className="admin-os__row-actions">
                            <button className="admin-os__btn-secondary admin-os__btn-sm" disabled={busyId === `quiz-edit-${q.id}`} onClick={() => editQuiz(q)}>✏ Edit</button>
                            <button className="admin-os__btn-danger admin-os__btn-sm" disabled={busyId === `quiz-${q.id}`} onClick={() => deleteQuiz(q.id)}>🗑 Del</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Paginator total={filteredQuizzes.length} page={quizPage} setPage={setQuizPage} />
          </>
        )}

        {/* ── IMPORT TAB ────────────────────────────────────────── */}
        {!loading && activeTab === 'import' && (
          <div className="admin-os__import-box">
            <h2 className="admin-os__import-title">Import Accounts</h2>
            <p className="admin-os__import-meta">
              Upload an <strong>Excel</strong> (<code>.xlsx</code>, <code>.xls</code>) or <strong>CSV</strong> file
              with the columns: <strong>full_name</strong>, <strong>email</strong>, <strong>password</strong>,{' '}
              <strong>role</strong> (<em>Instructor</em> or <em>Student</em>).{' '}
              Imported accounts are approved immediately. Passwords are hashed before saving. Duplicate emails are skipped automatically.
            </p>

            <div className="admin-os__import-actions">
              <button type="button" className="admin-os__btn-secondary" onClick={downloadImportTemplate}>
                ↓ Download CSV template
              </button>
              <label className="admin-os__btn-primary admin-os__import-file-label">
                Choose spreadsheet file
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="admin-os__import-file-input" />
              </label>
              {importFileName && (
                <span className="admin-os__import-file-name">
                  <strong>{importFileName}</strong> ({importRows.length} row(s) loaded)
                </span>
              )}
            </div>

            {importRows.length > 0 && (
              <>
                <div className="admin-os__table-wrap admin-os__import-preview">
                  <table className="admin-os__table">
                    <thead>
                      <tr>
                        {['#', 'Full Name', 'Email', 'Role', 'Password'].map((h) => (
                          <th key={h} className="admin-os__th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, i) => (
                        <tr key={i} >
                          <td className="admin-os__td admin-os__td--index">{i + 1}</td>
                          <td className="admin-os__td admin-os__td--bold">{row.username}</td>
                          <td className="admin-os__td admin-os__td--muted">{row.email}</td>
                          <td className="admin-os__td"><span className={`admin-os__role-badge admin-os__role-badge--${row.role}`}>{row.role}</span></td>
                          <td className="admin-os__td admin-os__td--password">••••••</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 10 && (
                  <p className="admin-os__import-meta admin-os__import-meta--compact">
                    Showing first 10 of {importRows.length} rows.
                  </p>
                )}
                <button
                  type="button"
                  className="admin-os__btn-success admin-os__btn-import"
                  onClick={runImport}
                  disabled={importLoading}
                >
                  {importLoading ? 'Importing…' : `Import ${importRows.length} account(s) →`}
                </button>
              </>
            )}

            {importSummary && (
              <div className="admin-os__import-summary">
                <p className="admin-os__import-summary-title">
                  Import result
                </p>
                <p className="admin-os__import-summary-body">
                  ✔ Created: <strong>{importSummary.created}</strong> &nbsp;·&nbsp;
                  Skipped (duplicate): <strong>{importSummary.skipped}</strong> &nbsp;·&nbsp;
                  Failed: <strong className={importSummary.failed > 0 ? 'admin-os__import-failures--warn' : ''}>{importSummary.failed}</strong>
                </p>
                {(importSummary.validationErrors?.length || importSummary.importErrors?.length) ? (
                  <ul className="admin-os__import-failures">
                    {[...(importSummary.validationErrors || []), ...(importSummary.importErrors || [])].slice(0, 10).map((e, i) => (
                      <li key={i}>Row {e.row} ({e.email}): {e.message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {detailUserId != null && (
        <UserDetailModal adminId={adminId} userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}
    </div>
  )
}

export default AdminDashboard
