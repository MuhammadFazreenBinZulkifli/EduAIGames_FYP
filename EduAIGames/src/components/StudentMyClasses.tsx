import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { usePlatformFeatures } from '../hooks/usePlatformFeatures'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import ClassOverviewModal, { type ClassOverviewResult } from './ClassOverviewModal'
import PanelSkeleton from './PanelSkeleton'
import { ROUTES } from '../routes/paths'
import { STUDENT_NAV, studentDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentMyClasses_CSS.css'
import './App_CSS/ClassOverviewModal_CSS.css'

interface Class {
  id: number
  instructor_id: number
  title: string
  description: string
  join_code: string
  instructor_name: string
  background_image?: string | null
  joined_at: string
  student_count: number
  pending_quizzes: number
  quizzes_completed: number
  avg_score: number | null
  latest_quiz_title: string | null
  latest_score: number | null
}

interface StudentMyClassesProps {
  studentId?: number
}

function formatProgressLine(c: Class): string {
  if (c.pending_quizzes > 0 && c.quizzes_completed > 0) {
    return `${c.pending_quizzes} pending quiz${c.pending_quizzes === 1 ? '' : 'zes'} · ${c.quizzes_completed} completed${c.avg_score != null ? ` · ${c.avg_score}% avg` : ''}`
  }
  if (c.pending_quizzes > 0) {
    return `${c.pending_quizzes} quiz${c.pending_quizzes === 1 ? '' : 'zes'} waiting for you`
  }
  if (c.quizzes_completed > 0) {
    const latest =
      c.latest_quiz_title && c.latest_score != null
        ? `Latest: ${c.latest_quiz_title} (${c.latest_score}%)`
        : null
    return latest
      ? `${c.quizzes_completed} quiz${c.quizzes_completed === 1 ? '' : 'zes'} done · ${latest}`
      : `${c.quizzes_completed} quiz${c.quizzes_completed === 1 ? '' : 'zes'} completed${c.avg_score != null ? ` · ${c.avg_score}% avg` : ''}`
  }
  return 'No quizzes completed yet'
}

// Lists classes the student is enrolled in, with search and option to leave.
function StudentMyClasses({ studentId }: StudentMyClassesProps) {
  const navigate = useNavigate()
  const { toast, confirm } = usePanelUI()
  const { features } = usePlatformFeatures()
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [analyseClass, setAnalyseClass] = useState<Class | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [overview, setOverview] = useState<ClassOverviewResult | null>(null)
  const [overviewSparse, setOverviewSparse] = useState(false)

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return classes
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.instructor_name || '').toLowerCase().includes(q) ||
        (c.join_code || '').toLowerCase().includes(q)
    )
  }, [classes, searchQuery])

  useEffect(() => { fetchClasses() }, [studentId])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`)
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json()
      setClasses(data.classes || [])
    } catch {
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyJoinCode = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code)
        toast('Join code copied', 'success')
      } catch {
        toast('Could not copy join code', 'error')
      }
    },
    [toast]
  )

  const closeAnalyse = useCallback(() => {
    setAnalyseClass(null)
    setOverview(null)
    setOverviewError('')
    setOverviewSparse(false)
    setOverviewLoading(false)
  }, [])

  const handleAnalyse = useCallback(
    async (classItem: Class) => {
      if (!studentId || !features.openai_enabled) return
      setAnalyseClass(classItem)
      setOverview(null)
      setOverviewError('')
      setOverviewSparse(false)
      setOverviewLoading(true)
      try {
        const res = await fetch(`${API_BASE_URL}/api/chat/study-coach/class-overview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': String(studentId),
          },
          body: JSON.stringify({ student_id: studentId, class_id: classItem.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error((data as { error?: string }).error || 'Analysis failed')
        }
        setOverview((data as { overview: ClassOverviewResult }).overview)
        setOverviewSparse(Boolean((data as { is_sparse?: boolean }).is_sparse))
      } catch (err) {
        setOverviewError(err instanceof Error ? err.message : 'Could not analyse this class')
      } finally {
        setOverviewLoading(false)
      }
    },
    [studentId, features.openai_enabled]
  )

  const handleLeaveClass = async (classId: number, className: string) => {
    const ok = await confirm({
      message: `Are you sure you want to leave "${className}"?`,
      danger: true,
    })
    if (!ok) return
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/classes/student/${classId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      })
      if (!response.ok) throw new Error('Failed to leave class')
      setClasses(classes.filter((c) => c.id !== classId))
      toast('Left class successfully', 'success')
    } catch {
      toast('Failed to leave class. Please try again.', 'error')
    }
  }

  return (
    <div className="panel-page student-my-classes-page">
      <PanelBreadcrumbs
        items={[
          studentDashboardCrumb(),
          { label: STUDENT_NAV.enrolledClasses, to: ROUTES.student.classes },
        ]}
      />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Student · Enrolment</p>
        <h1>{STUDENT_NAV.enrolledClasses}</h1>
        <p className="panel-hero-greeting">
          View your memberships, join codes, quiz progress, and AI class insights.
        </p>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {!loading && classes.length > 0 && (
        <div className="panel-card panel-toolbar-card panel-toolbar-card--spaced">
          <input
            type="search"
            className="panel-input"
            placeholder="Search by class name, instructor, or join code…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <PanelSkeleton variant="cards" count={3} />
      ) : classes.length === 0 ? (
        <PanelEmptyState
          icon="classes"
          title="No Classes Yet"
          description="You haven't joined any classes. Browse or use a join code to enrol."
        />
      ) : filteredClasses.length === 0 ? (
        <PanelEmptyState
          icon="search"
          title="No Matches"
          description={<>No classes match &quot;{searchQuery.trim()}&quot;.</>}
        />
      ) : (
        <>
          <p className="panel-section-kicker">
            {searchQuery.trim() ? `${filteredClasses.length} of ${classes.length} classes` : 'Your classes'}
          </p>
          <div className="panel-grid">
            {filteredClasses.map((classItem) => (
              <ClassCard
                key={classItem.id}
                variant="banner"
                classItem={classItem}
                bannerFallbackIcon="classes"
                bodyExtra={
                  <>
                    <div className="student-my-classes__stats">
                      <span className="student-my-classes__stat">
                        <strong>{classItem.student_count ?? 0}</strong>
                        {' '}student{classItem.student_count === 1 ? '' : 's'}
                      </span>
                      <span className="student-my-classes__stat student-my-classes__stat--progress">
                        {formatProgressLine(classItem)}
                      </span>
                    </div>
                    <div className="student-my-classes__join-row">
                      <span className="panel-meta student-my-classes__join-label">Join code</span>
                      <div className="student-my-classes__join-code">
                        <code className="student-my-classes__code">{classItem.join_code}</code>
                        <button
                          type="button"
                          className="panel-btn panel-btn-secondary panel-btn-sm student-my-classes__copy-btn"
                          onClick={() => void handleCopyJoinCode(classItem.join_code)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div className="panel-class-card-meta">
                      <span className="panel-meta">
                        Instructor: <strong className="student-my-classes__instructor">{classItem.instructor_name}</strong>
                      </span>
                      <span className="panel-meta">
                        Joined {new Date(classItem.joined_at).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                }
                footer={
                  <div className="panel-class-card-footer student-my-classes__footer">
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary panel-btn-sm"
                      onClick={() => navigate(ROUTES.student.coursesWithClass(classItem.id))}
                    >
                      Open Class →
                    </button>
                    {features.openai_enabled && (
                      <button
                        type="button"
                        className="panel-btn panel-btn-secondary panel-btn-sm student-my-classes__analyse-btn"
                        onClick={() => void handleAnalyse(classItem)}
                      >
                        Analyse
                      </button>
                    )}
                    <button
                      type="button"
                      className="panel-btn panel-btn-danger panel-btn-sm student-my-classes__leave-btn"
                      onClick={() => handleLeaveClass(classItem.id, classItem.title)}
                    >
                      Leave Class
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </>
      )}

      <ClassOverviewModal
        open={analyseClass != null}
        classTitle={analyseClass?.title ?? ''}
        loading={overviewLoading}
        error={overviewError}
        overview={overview}
        isSparse={overviewSparse}
        onClose={closeAnalyse}
      />
    </div>
  )
}

export default StudentMyClasses
