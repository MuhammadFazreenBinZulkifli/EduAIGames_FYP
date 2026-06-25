import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '../config'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import PanelSkeleton from './PanelSkeleton'
import { ROUTES } from '../routes/paths'
import { STUDENT_NAV, studentDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentJoinClass_CSS.css'

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

interface StudentJoinClassProps {
  studentId?: number
  onClassJoined: () => void
}

// Lets students browse public classes or join via a code.
function StudentJoinClass({ studentId, onClassJoined }: StudentJoinClassProps) {
  const [availableClasses, setAvailableClasses] = useState<Class[]>([])
  const [joinedClasses, setJoinedClasses] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'browse' | 'join-code'>('browse')

  useEffect(() => { fetchClasses() }, [studentId])

  // Loads available classes and tracks which ones the student already joined.
  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/classes/available/all`)
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json()
      setAvailableClasses(data.classes || [])

      if (studentId) {
        const myRes = await fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`)
        if (myRes.ok) {
          const myData = await myRes.json()
          setJoinedClasses(new Set<number>((myData.classes || []).map((c: Class) => c.id)))
        }
      }
    } catch {
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return availableClasses
    return availableClasses.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      (c.instructor_name || '').toLowerCase().includes(q)
    )
  }, [availableClasses, searchQuery])

  // Submits a join code to enrol in a public or private class.
  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!joinCode.trim()) { setError('Please enter a join code'); return }

    try {
      const response = await fetch(`${API_BASE_URL}/api/classes/student/join-by-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, join_code: joinCode.toUpperCase() }),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to join class')
      }
      const data = await response.json()
      setJoinedClasses(new Set([...joinedClasses, data.class.id]))
      setJoinCode('')
      setSuccess('Successfully joined the class!')
      setTimeout(() => setSuccess(''), 3000)
      onClassJoined()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join class')
    }
  }

  // Enrols the student in a class from the browse list.
  const handleJoinClass = async (classId: number) => {
    setError('')
    setSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/classes/student/join/${classId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId }),
      })
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to join class')
      }
      setJoinedClasses(new Set([...joinedClasses, classId]))
      setSuccess('Successfully joined the class!')
      setTimeout(() => setSuccess(''), 3000)
      onClassJoined()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join class')
    }
  }

  return (
    <div className="panel-page student-join-class-page">
      <PanelBreadcrumbs
        items={[
          studentDashboardCrumb(),
          { label: STUDENT_NAV.joinClass, to: ROUTES.student.join },
        ]}
      />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Student · Enrolment</p>
        <h1>{STUDENT_NAV.joinClass}</h1>
        <p className="panel-hero-greeting">Browse public classes or enter a join code (works for public and private classes).</p>
      </div>

      {success && <div className="panel-alert panel-alert-success">{success}</div>}
      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      <div className="panel-tabs">
        <button
          className={`panel-tab${activeTab === 'browse' ? ' active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          Browse Classes
        </button>
        <button
          className={`panel-tab${activeTab === 'join-code' ? ' active' : ''}`}
          onClick={() => setActiveTab('join-code')}
        >
          Join by Code
        </button>
      </div>

      {activeTab === 'join-code' && (
        <div className="panel-card panel-toolbar-card">
          <h3 className="panel-section-title">Enter Join Code</h3>
          <p className="panel-meta student-join-class__meta">
            Use this for private classes or when you already have a code from your instructor.
          </p>
          <form onSubmit={handleJoinWithCode}>
            <div className="panel-form-group">
              <label className="panel-label" htmlFor="join-code">Class Code *</label>
              <input
                id="join-code"
                className="panel-input"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                maxLength={6}
                required
              />
            </div>
            <button type="submit" className="panel-btn panel-btn-primary student-join-class__submit-btn">
              Join Class →
            </button>
          </form>
        </div>
      )}

      {activeTab === 'browse' && (
        <>
          <div className="panel-card panel-toolbar-card panel-search-card">
            <label className="panel-label" htmlFor="class-search">Search public classes</label>
            <input
              id="class-search"
              className="panel-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by class name…"
              autoComplete="off"
            />
            {searchQuery.trim() && (
              <p className="panel-meta student-join-class__search-meta">
                {filteredClasses.length} class{filteredClasses.length === 1 ? '' : 'es'} found
              </p>
            )}
          </div>

          {loading ? (
            <PanelSkeleton variant="cards" count={3} />
          ) : availableClasses.length === 0 ? (
            <PanelEmptyState
              icon="classes"
              title="No Public Classes Available"
              description="There are no public classes open for enrolment right now. Try joining with a code instead."
            />
          ) : filteredClasses.length === 0 ? (
            <PanelEmptyState
              icon="search"
              title="No Matches Found"
              description={<>No public class names match &quot;{searchQuery.trim()}&quot;. Try a different search or use Join by Code.</>}
            />
          ) : (
            <>
              <p className="panel-section-kicker">Available classes</p>
              <div className="panel-grid">
              {filteredClasses.map((classItem) => (
                <ClassCard
                  key={classItem.id}
                  variant="banner"
                  classItem={classItem}
                  bannerFallbackIcon="join"
                  bodyExtra={
                    <div className="panel-class-card-meta">
                      <span className="panel-meta">
                        Instructor: <strong>{classItem.instructor_name}</strong>
                      </span>
                      <span className="panel-meta">
                        Code: <span className="panel-code-badge">{classItem.join_code}</span>
                      </span>
                    </div>
                  }
                  footer={
                    <div className="panel-class-card-footer">
                      {joinedClasses.has(classItem.id) ? (
                        <button type="button" className="panel-btn panel-btn-success panel-btn-sm" disabled>
                          Already joined
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="panel-btn panel-btn-primary panel-btn-sm"
                          onClick={() => handleJoinClass(classItem.id)}
                        >
                          Join class
                        </button>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default StudentJoinClass
