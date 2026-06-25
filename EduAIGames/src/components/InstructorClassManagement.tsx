import { useState, useEffect, useMemo, useCallback } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { CLASS_DESCRIPTION_MAX_LENGTH, truncateClassDescription } from '../constants/classLimits'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import PanelIcon from './PanelIcon'
import PanelSkeleton from './PanelSkeleton'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import ImageDropZone from './ImageDropZone'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/InstructorClassManagement_CSS.css'

type ClassVisibility = 'public' | 'private'

interface Class {
  id: number
  instructor_id: number
  title: string
  description: string
  join_code: string
  visibility: ClassVisibility
  background_image?: string | null
  created_at: string
  updated_at: string
}

const BG_MAX_DIM = 1200
const BG_QUALITY = 0.8

// Compress a class background image to a base64 data URL.
function compressBgImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, BG_MAX_DIM / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', BG_QUALITY))
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

interface InstructorClassManagementProps {
  instructorId?: number
  onManageQuizzes?: (classId: number) => void
  onManageCourse?: (classId: number) => void
  onViewClass?: (classId: number) => void
}

// CRUD for instructor classes with search, visibility filters, and background image upload.
function InstructorClassManagement({ instructorId, onManageQuizzes, onManageCourse, onViewClass }: InstructorClassManagementProps) {
  const { confirm, toast } = usePanelUI()
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [editingClass, setEditingClass] = useState<Class | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ClassVisibility>('public')
  const [bgPreview, setBgPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | ClassVisibility>('all')

  useEffect(() => { fetchClasses() }, [instructorId])

  const filteredClasses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return classes.filter((c) => {
      if (visibilityFilter !== 'all' && c.visibility !== visibilityFilter) return false
      if (!q) return true
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        c.join_code.toLowerCase().includes(q)
      )
    })
  }, [classes, searchQuery, visibilityFilter])

  // Loads all classes owned by this instructor.
  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/classes/instructor/${instructorId}`)
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json()
      const list = data.classes || []
      setClasses(list)
      if (list.length === 0) setShowCreateForm(true)
    } catch {
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEditingClass(null)
    setTitle('')
    setDescription('')
    setVisibility('public')
    setBgPreview(null)
    setError('')
  }

  // Compresses a banner image before it is sent with create/update class.
  const handleBgFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Please select an image file.', 'error'); return }
    try {
      const dataUrl = await compressBgImage(file)
      setBgPreview(dataUrl)
    } catch { toast('Failed to process image.', 'error') }
  }

  // Creates a new public or private class with a join code.
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!title.trim()) { setError('Class title is required'); return }
    const desc = description.trim()
    if (desc.length > CLASS_DESCRIPTION_MAX_LENGTH) {
      setError(`Description must be at most ${CLASS_DESCRIPTION_MAX_LENGTH} characters`)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          title: title.trim(),
          description: desc,
          visibility,
        }),
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to create class')
      }
      const data = await response.json()
      let newClass: Class = data.class

      // Upload background image if one was selected.
      if (bgPreview) {
        try {
          const bgRes = await fetch(`${API_BASE_URL}/api/classes/${newClass.id}/background`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ background_image: bgPreview }),
          })
          if (bgRes.ok) {
            const bgData = await bgRes.json()
            newClass = { ...newClass, background_image: bgData.class?.background_image ?? null }
          }
        } catch { /* non-fatal */ }
      }

      setClasses([newClass, ...classes])
      resetForm()
      setShowCreateForm(false)
      setSuccess(
        visibility === 'public'
          ? 'Public class created! Students can browse or use the join code.'
          : 'Private class created! Share the join code only with invited students.'
      )
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class. Please try again.')
    }
  }

  // Saves edits to an existing class.
  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!editingClass || !title.trim()) { setError('Class title is required'); return }
    const desc = description.trim()
    if (desc.length > CLASS_DESCRIPTION_MAX_LENGTH) {
      setError(`Description must be at most ${CLASS_DESCRIPTION_MAX_LENGTH} characters`)
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`${API_BASE_URL}/api/classes/${editingClass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc,
          visibility,
        }),
      })
      if (!response.ok) throw new Error('Failed to update class')
      const data = await response.json()
      let updatedClass: Class = data.class

      // Upload/clear background image.
      try {
        const bgRes = await fetch(`${API_BASE_URL}/api/classes/${editingClass.id}/background`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ background_image: bgPreview ?? null }),
        })
        if (bgRes.ok) {
          const bgData = await bgRes.json()
          updatedClass = { ...updatedClass, background_image: bgData.class?.background_image ?? null }
        }
      } catch { /* non-fatal */ }

      setClasses(classes.map((c) => (c.id === editingClass.id ? updatedClass : c)))
      resetForm()
      setEditModalOpen(false)
      setSuccess('Class updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Failed to update class. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Permanently deletes a class after confirmation.
  const handleDeleteClass = async (classId: number) => {
    const ok = await confirm({ message: 'Are you sure you want to delete this class?', danger: true })
    if (!ok) return
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/api/classes/${classId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete class')
      setClasses(classes.filter((c) => c.id !== classId))
      if (editingClass?.id === classId) resetForm()
      setSuccess('Class deleted successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Failed to delete class. Please try again.')
    }
  }

  // Opens the edit modal pre-filled with an existing class.
  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem)
    setTitle(classItem.title)
    setDescription(classItem.description?.slice(0, CLASS_DESCRIPTION_MAX_LENGTH) ?? '')
    setVisibility(classItem.visibility === 'private' ? 'private' : 'public')
    setBgPreview(classItem.background_image ?? null)
    setError('')
    setSuccess('')
    setShowCreateForm(false)
    setEditModalOpen(true)
  }

  const closeEditModal = useCallback(() => {
    if (saving) return
    setEditModalOpen(false)
    resetForm()
  }, [saving])

  // Close the edit modal on Escape and lock body scroll while it is open.
  useEffect(() => {
    if (!editModalOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEditModal() }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [editModalOpen, closeEditModal])

  const toggleCreateForm = () => {
    setShowCreateForm((open) => {
      if (!open) resetForm()
      return !open
    })
  }

  // Shared form fields used by both the Create collapsible and the Edit modal.
  const renderClassFields = (idPrefix: string) => (
    <>
      <div className="panel-form-group">
        <label className="panel-label" htmlFor={`${idPrefix}-title`}>Class Title *</label>
        <input
          id={`${idPrefix}-title`}
          className="panel-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter class title"
          required
        />
      </div>
      <div className="panel-form-group">
        <label className="panel-label" htmlFor={`${idPrefix}-desc`}>Description</label>
        <textarea
          id={`${idPrefix}-desc`}
          className="panel-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, CLASS_DESCRIPTION_MAX_LENGTH))}
          placeholder="Describe this class (optional)"
          rows={3}
          maxLength={CLASS_DESCRIPTION_MAX_LENGTH}
        />
        <p
          className={`panel-char-count${
            description.length >= CLASS_DESCRIPTION_MAX_LENGTH ? ' panel-char-count--limit' : ''
          }`}
        >
          {description.length}/{CLASS_DESCRIPTION_MAX_LENGTH} characters
        </p>
      </div>
      <div className="panel-form-group">
        <span className="panel-label">Class visibility *</span>
        <div className="auth-visibility-options" role="radiogroup" aria-label="Class visibility">
          <label className={`auth-visibility-option${visibility === 'public' ? ' selected' : ''}`}>
            <input
              type="radio"
              name={`${idPrefix}-visibility`}
              value="public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
            />
            <span>
              <strong>Public</strong>
              <small>Listed in Browse Classes; students can also join with a code.</small>
            </span>
          </label>
          <label className={`auth-visibility-option${visibility === 'private' ? ' selected' : ''}`}>
            <input
              type="radio"
              name={`${idPrefix}-visibility`}
              value="private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
            />
            <span>
              <strong>Private</strong>
              <small>Hidden from browse; students must use the join code.</small>
            </span>
          </label>
        </div>
      </div>
      <div className="panel-form-group">
        <span className="panel-label">Class Background Image</span>
        <ImageDropZone
          preview={bgPreview}
          onFile={handleBgFile}
          onRemove={() => setBgPreview(null)}
          label="Drag & drop a background image, or click to browse"
          hint="Recommended 1200 × 400 px · JPG or PNG"
        />
      </div>
    </>
  )

  return (
    <div className="panel-page instructor-class-mgmt">
      <PanelBreadcrumbs items={[instructorDashboardCrumb(), { label: INSTRUCTOR_NAV.myClasses }]} />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Instructor · Classes</p>
        <h1>My Classes</h1>
        <p className="panel-hero-greeting">Create public or private classes and share join codes with your students.</p>
      </div>

      {success && <div className="panel-alert panel-alert-success">{success}</div>}
      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      <div className={`panel-card panel-collapsible panel-toolbar-card${showCreateForm ? ' panel-collapsible--open' : ''}`}>
        <button
          type="button"
          className="panel-collapsible-trigger"
          onClick={toggleCreateForm}
          aria-expanded={showCreateForm}
        >
          <span className="panel-collapsible-trigger-text">
            Create Class
            {!showCreateForm && classes.length > 0 && (
              <span className="panel-collapsible-hint"> (click to expand)</span>
            )}
          </span>
          <span className="panel-collapsible-chevron" aria-hidden>
            {showCreateForm ? '▲' : '▼'}
          </span>
        </button>

        {showCreateForm && (
        <form className="panel-collapsible-body" onSubmit={handleCreateClass}>
          {renderClassFields('cls')}
          <div className="panel-row">
            <button type="submit" className="panel-btn panel-btn-primary">
              Create Class
            </button>
          </div>
        </form>
        )}
      </div>


      {!loading && classes.length > 0 && (
        <div className="panel-card panel-toolbar-card instructor-class-mgmt__filter-card">
          <div className="panel-row instructor-class-mgmt__filter-row">
            <div className="panel-form-group instructor-class-mgmt__search-group">
              <label className="panel-label" htmlFor="class-search">Search Classes</label>
              <input
                id="class-search"
                className="panel-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, description, or join code…"
              />
            </div>
            <div className="panel-form-group instructor-class-mgmt__filter-group">
              <label className="panel-label" htmlFor="class-visibility-filter">Filter</label>
              <select
                id="class-visibility-filter"
                className="panel-select"
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as 'all' | ClassVisibility)}
              >
                <option value="all">All classes</option>
                <option value="public">Public only</option>
                <option value="private">Private only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <PanelSkeleton variant="cards" count={3} />
      ) : classes.length === 0 ? (
        <PanelEmptyState
          icon="classes"
          title="No Classes Yet"
          description={<>Expand &quot;Create Class&quot; above to add your first public or private class.</>}
        />
      ) : filteredClasses.length === 0 ? (
        <PanelEmptyState
          icon="search"
          title="No Matches"
          description="Try a different search term or filter."
        />
      ) : (
        <>
          <p className="panel-section-kicker">
            Showing {filteredClasses.length} of {classes.length} class{classes.length !== 1 ? 'es' : ''}
          </p>
          <div className="panel-grid">
          {filteredClasses.map((classItem) => (
            <div key={classItem.id} className="panel-class-card panel-class-card--polished panel-class-card--managed">
              <div
                className="panel-class-card__banner"
                style={classItem.background_image ? { backgroundImage: `url(${classItem.background_image})` } : undefined}
              >
                {!classItem.background_image && <PanelIcon name="classes" variant="card-banner" color="orange" />}
              </div>
              <div className="panel-class-card-body">
                <div className="panel-class-card-header">
                  <h3>{classItem.title}</h3>
                  <div className="panel-class-actions">
                    <button
                      className="panel-icon-btn"
                      type="button"
                      title="Edit"
                      aria-label={`Edit ${classItem.title}`}
                      onClick={() => handleEdit(classItem)}
                    >
                      <PanelIcon name="edit" variant="inline" color="orange" />
                    </button>
                    <button
                      className="panel-icon-btn"
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${classItem.title}`}
                      onClick={() => handleDeleteClass(classItem.id)}
                    >
                      <PanelIcon name="trash" variant="inline" color="orange" />
                    </button>
                  </div>
                </div>

                <span
                  className={`panel-visibility-badge panel-visibility-badge--${
                    classItem.visibility === 'private' ? 'private' : 'public'
                  }`}
                >
                  {classItem.visibility === 'private' ? (
                    <><PanelIcon name="lock" variant="inline" /> Private</>
                  ) : (
                    <><PanelIcon name="globe" variant="inline" /> Public</>
                  )}
                </span>

                <p
                  className={`panel-class-card-description${classItem.description ? '' : ' panel-class-card-description--empty'}`}
                  title={classItem.description || undefined}
                >
                  {classItem.description
                    ? truncateClassDescription(classItem.description)
                    : 'No description'}
                </p>
              </div>

              <div className="panel-class-card-meta">
                <span className="panel-meta panel-meta--inline">
                  Join Code: <span className="panel-code-badge">{classItem.join_code}</span>
                  <button
                    type="button"
                    className="panel-icon-btn"
                    title="Copy join code"
                    aria-label={`Copy join code ${classItem.join_code}`}
                    onClick={() => {
                      navigator.clipboard.writeText(classItem.join_code)
                        .then(() => toast('Join code copied!', 'success'))
                        .catch(() => toast('Failed to copy join code', 'error'))
                    }}
                  >
                    <PanelIcon name="copy" variant="inline" color="orange" />
                  </button>
                </span>
                <span className="panel-meta">
                  Created {new Date(classItem.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="panel-class-card-footer">
                <button
                  className="panel-btn panel-btn-primary panel-btn-sm panel-btn-with-icon"
                  onClick={() => onManageCourse?.(classItem.id)}
                >
                  <PanelIcon name="content" variant="inline" /> Manage Course
                </button>
                <button
                  className="panel-btn panel-btn-secondary panel-btn-sm panel-btn-with-icon"
                  onClick={() => onManageQuizzes?.(classItem.id)}
                >
                  <PanelIcon name="quiz" variant="inline" /> Quizzes
                </button>
                <button
                  className="panel-btn panel-btn-secondary panel-btn-sm panel-btn-with-icon"
                  onClick={() => onViewClass?.(classItem.id)}
                >
                  <PanelIcon name="users" variant="inline" /> Members
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {editModalOpen && editingClass && (
        <div
          className="panel-modal-overlay class-edit-modal-overlay"
          role="presentation"
          onClick={closeEditModal}
        >
          <div
            className="class-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-class-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="class-edit-modal__header">
              <div className="class-edit-modal__heading">
                <h2 className="class-edit-modal__title" id="edit-class-modal-title">Edit Class</h2>
                <p className="class-edit-modal__subtitle">
                  Update the details for “{editingClass.title}”.
                </p>
              </div>
              <button
                type="button"
                className="class-edit-modal__close"
                aria-label="Close edit class"
                onClick={closeEditModal}
              >
                ×
              </button>
            </div>

            {error && (
              <div className="panel-alert panel-alert-error class-edit-modal__alert">{error}</div>
            )}

            <form
              id="edit-class-form"
              className="class-edit-modal__body"
              onSubmit={handleUpdateClass}
            >
              {renderClassFields('edit-cls')}
            </form>

            <div className="class-edit-modal__footer">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={closeEditModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-class-form"
                className="panel-btn panel-btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InstructorClassManagement
