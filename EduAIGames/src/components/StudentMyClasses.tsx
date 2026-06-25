import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import PanelSkeleton from './PanelSkeleton'
import { ROUTES } from '../routes/paths'
import { STUDENT_NAV, studentDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentMyClasses_CSS.css'

interface Class {
  id: number
  instructor_id: number
  title: string
  description: string
  join_code: string
  instructor_name: string
  background_image?: string | null
  created_at: string
}

interface StudentMyClassesProps {
  studentId?: number
}

// Lists classes the student is enrolled in, with search and option to leave.
function StudentMyClasses({ studentId }: StudentMyClassesProps) {
  const navigate = useNavigate()
  const { toast, confirm } = usePanelUI()
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return classes
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.instructor_name || '').toLowerCase().includes(q)
    )
  }, [classes, searchQuery])

  useEffect(() => { fetchClasses() }, [studentId])

  // Fetches the student's enrolled classes from the API.
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

  // Removes the student from a class after confirmation.
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
        <p className="panel-hero-greeting">View your memberships, join codes, and leave classes when needed.</p>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {!loading && classes.length > 0 && (
        <div className="panel-card panel-toolbar-card panel-toolbar-card--spaced">
          <input
            type="search"
            className="panel-input"
            placeholder="Search by class name or instructor…"
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
                  <div className="panel-class-card-meta">
                    <span className="panel-meta">
                      Instructor: <strong className="student-my-classes__instructor">{classItem.instructor_name}</strong>
                    </span>
                    <span className="panel-meta">
                      Joined {new Date(classItem.created_at).toLocaleDateString()}
                    </span>
                  </div>
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
                    <button
                      type="button"
                      className="panel-btn panel-btn-danger panel-btn-sm"
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
    </div>
  )
}

export default StudentMyClasses
