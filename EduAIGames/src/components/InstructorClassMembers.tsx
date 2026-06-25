import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { ROUTES } from '../routes/paths'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import PanelSkeleton from './PanelSkeleton'
import UserAvatar from './UserAvatar'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/InstructorClassMembers_CSS.css'

interface ClassMember {
  id: number
  username: string
  email: string
  avatar_url?: string | null
  joined_at: string
}

interface InstructorClassMembersProps {
  instructorId?: number
  classId?: number
  onBack: () => void
}

// Shows enrolled students and lets the instructor remove members.
function InstructorClassMembers({ instructorId, classId, onBack }: InstructorClassMembersProps) {
  const { toast, confirm } = usePanelUI()
  const [members, setMembers] = useState<ClassMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const breadcrumbs = useMemo(
    () => [
      instructorDashboardCrumb(),
      { label: INSTRUCTOR_NAV.myClasses, to: ROUTES.instructor.classes },
      { label: 'Class Members' },
    ],
    []
  )

  // Loads the roster for the selected class.
  const fetchMembers = async () => {
    if (!instructorId || !classId) {
      setError('Class or instructor information is missing.')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const response = await fetch(
        `${API_BASE_URL}/api/classes/${classId}/instructor/${instructorId}/members`
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to fetch class members')
      }
      setMembers(data?.members || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch class members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [instructorId, classId])

  // Removes a student from the class after confirmation.
  const handleRemoveStudent = async (studentId: number, username: string) => {
    if (!instructorId || !classId) return
    const ok = await confirm({ message: `Remove ${username} from this class?`, danger: true })
    if (!ok) return

    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/classes/${classId}/instructor/${instructorId}/students/${studentId}`,
        { method: 'DELETE' }
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to remove student')
      }
      setMembers((prev) => prev.filter((member) => member.id !== studentId))
      toast(`${username} removed from class.`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove student', 'error')
    }
  }

  return (
    <div className="panel-page">
      <PanelBreadcrumbs items={breadcrumbs} />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Instructor · View Class</p>
        <h1>Class Members</h1>
        <p className="panel-hero-greeting">See who joined your class and remove students when needed.</p>
      </div>

      <div className="panel-top-row">
        <button className="panel-btn panel-btn-secondary" type="button" onClick={onBack}>
          ← Back to My Classes
        </button>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {loading ? (
        <PanelSkeleton variant="table" count={5} />
      ) : members.length === 0 ? (
        <PanelEmptyState
          icon="users"
          title="No students yet"
          description="No students have joined this class yet. Share the join code from My Classes."
        />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Email</th>
                <th>Joined Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <UserAvatar username={member.username} avatarUrl={member.avatar_url ?? null} size="sm" />
                    {member.username}
                  </td>
                  <td>{member.email}</td>
                  <td>{new Date(member.joined_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="panel-btn panel-btn-danger panel-btn-sm"
                      type="button"
                      onClick={() => handleRemoveStudent(member.id, member.username)}
                    >
                      Remove
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

export default InstructorClassMembers
