import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { ROUTES } from '../routes/paths'
import { INSTRUCTOR_NAV } from '../utils/panelBreadcrumbHelpers'
import { pushRecent } from '../utils/sidebarRecents'
import { gameTypeMeta } from '../utils/gameSettingsDisplay'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import PanelIcon from './PanelIcon'
import PanelSkeleton from './PanelSkeleton'
import QuizSearchSelect from './QuizSearchSelect'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/InstructorManageClass_CSS.css'

interface TopicItem {
  id: number
  item_type: 'file' | 'quiz'
  title: string
  file_name?: string | null
  quiz_id?: number | null
  quiz_title?: string
}

interface Topic {
  id: number
  name: string
  is_quiz_topic: boolean
  items: TopicItem[]
}

interface QuizOption {
  id: number
  title: string
}

interface PreviewQuestion {
  question_text: string
  question_type: string
  correct_answer: string
  explanation?: string
  options?: Array<{ option_text: string }>
}

interface PreviewQuiz {
  id: number
  title: string
  questions: PreviewQuestion[]
}

interface SavedGame {
  id: number
  quiz_id: number
  title: string
  description: string
  ghost_enabled: boolean
  game_type: 'maze' | 'snake' | 'breakout' | 'race'
  settings: string
  quiz_title: string
}

interface ClassGame {
  class_game_id: number
  game_id: number
  game_title: string
  description: string
  ghost_enabled: boolean
  game_type: 'maze' | 'snake' | 'breakout' | 'race'
  settings: string
  quiz_title: string
  published_at: string
}

interface Announcement {
  id: number
  content: string
  created_at: string
  instructor_name?: string
}

interface InstructorManageClassProps {
  instructorId?: number
  classId?: number
  onBack: () => void
  onCreateQuiz?: () => void
}

// Manages course topics, file uploads, quiz publishing, and games for one class.
function InstructorManageClass({
  instructorId,
  classId,
  onBack,
  onCreateQuiz,
}: InstructorManageClassProps) {
  const { confirm, toast } = usePanelUI()
  const [classTitle, setClassTitle] = useState('')
  const [classBackground, setClassBackground] = useState<string | null>(null)
  const [classJoinCode, setClassJoinCode] = useState('')
  const [classVisibility, setClassVisibility] = useState('public')
  const [topics, setTopics] = useState<Topic[]>([])
  const [quizzes, setQuizzes] = useState<QuizOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())
  const [uploadingTopicId, setUploadingTopicId] = useState<number | null>(null)
  const [selectedQuizByTopic, setSelectedQuizByTopic] = useState<Record<number, string>>({})
  // Quiz settings popup shown when publishing a quiz to students.
  const [publishTopicId, setPublishTopicId] = useState<number | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishSettings, setPublishSettings] = useState({
    time_limit_minutes: '',
    max_attempts: '',
    shuffle_questions: false,
    shuffle_options: false,
  })
  // Quiz preview popup (student view) for published quizzes.
  const [previewQuiz, setPreviewQuiz] = useState<PreviewQuiz | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewAnswers, setPreviewAnswers] = useState<Record<number, string>>({})
  const [previewConfirmed, setPreviewConfirmed] = useState<Set<number>>(new Set())
  const [gamesExpanded, setGamesExpanded] = useState(false)
  const [savedGames, setSavedGames] = useState<SavedGame[]>([])
  const [classGames, setClassGames] = useState<ClassGame[]>([])
  const [selectedGameId, setSelectedGameId] = useState('')
  const [gamesLoading, setGamesLoading] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newAnnouncement, setNewAnnouncement] = useState('')
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)

  const breadcrumbs = useMemo(
    () => [
      { label: 'Dashboard', to: ROUTES.instructor.dashboard },
      { label: INSTRUCTOR_NAV.myClasses, to: ROUTES.instructor.classes },
      {
        label: classTitle || 'Class',
        to: classId ? ROUTES.instructor.classManage(classId) : undefined,
      },
      { label: 'Manage Course' },
    ],
    [classTitle, classId]
  )

  // Record this class in sidebar recents (scoped to this instructor's account).
  useEffect(() => {
    if (classTitle && classId && instructorId) {
      pushRecent('instructor-classes', instructorId, {
        id: classId,
        label: classTitle,
        path: ROUTES.instructor.classManage(classId),
      })
    }
  }, [classTitle, classId, instructorId])

  // Fetches topics, materials, and available quizzes for this class.
  const loadContent = useCallback(async () => {
    if (!instructorId || !classId) return
    try {
      setLoading(true)
      setError('')
      const [contentRes, quizzesRes, classRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/class-content/class/${classId}/instructor/${instructorId}`),
        fetch(`${API_BASE_URL}/api/class-content/class/${classId}/quizzes/${instructorId}`),
        fetch(`${API_BASE_URL}/api/classes/${classId}`),
      ])
      const contentData = await contentRes.json().catch(() => ({}))
      if (!contentRes.ok) throw new Error(contentData.error || 'Failed to load class content')
      setClassTitle(contentData.class?.title || 'Class')
      if (classRes.ok) {
        const classData = await classRes.json()
        const cls = classData.class || {}
        setClassBackground(cls.background_image ?? null)
        setClassJoinCode(cls.join_code || '')
        setClassVisibility(cls.visibility || 'public')
      }
      setTopics(contentData.topics || [])
      if (quizzesRes.ok) {
        const qData = await quizzesRes.json()
        setQuizzes(qData.quizzes || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [instructorId, classId])

  // Loads saved games and which ones are published to this class.
  const loadGames = useCallback(async () => {
    if (!instructorId || !classId) return
    try {
      setGamesLoading(true)
      const [savedRes, classRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/games/instructor/${instructorId}`),
        fetch(`${API_BASE_URL}/api/games/class/${classId}/instructor/${instructorId}`),
      ])
      if (savedRes.ok) setSavedGames((await savedRes.json()).games || [])
      if (classRes.ok) setClassGames((await classRes.json()).games || [])
    } catch {
      // non-critical
    } finally {
      setGamesLoading(false)
    }
  }, [instructorId, classId])

  const loadAnnouncements = useCallback(async () => {
    if (!classId) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${classId}/announcements`)
      if (res.ok) {
        const data = await res.json()
        setAnnouncements(data.announcements || [])
      }
    } catch { /* non-critical */ }
  }, [classId])

  useEffect(() => {
    loadContent()
    loadGames()
    loadAnnouncements()
  }, [loadContent, loadGames, loadAnnouncements])

  const handlePostAnnouncement = async () => {
    if (!classId || !instructorId || !newAnnouncement.trim()) return
    setPostingAnnouncement(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${classId}/announcements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructor_id: instructorId, content: newAnnouncement.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to post')
      }
      setNewAnnouncement('')
      await loadAnnouncements()
      toast('Announcement posted!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post announcement', 'error')
    } finally {
      setPostingAnnouncement(false)
    }
  }

  const handleDeleteAnnouncement = async (id: number) => {
    if (!classId || !instructorId) return
    const ok = await confirm({ message: 'Delete this announcement?', danger: true })
    if (!ok) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${classId}/announcements/${id}?instructor_id=${instructorId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      setAnnouncements((prev) => prev.filter((a) => a.id !== id))
      toast('Announcement deleted.', 'success')
    } catch {
      toast('Failed to delete announcement.', 'error')
    }
  }

  const flash = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }

  const toggleTopic = (id: number) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    setExpandedTopics(new Set(topics.map((t) => t.id)))
    if (classGames.length > 0) setGamesExpanded(true)
  }
  const collapseAll = () => {
    setExpandedTopics(new Set())
    setGamesExpanded(false)
  }

  // Creates a new custom topic folder in the course.
  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTopicName.trim() || !classId || !instructorId) return
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/class-content/class/${classId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructor_id: instructorId, name: newTopicName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create topic')
      setNewTopicName('')
      await loadContent()
      if (data.topic?.id) {
        setExpandedTopics((prev) => new Set([...prev, data.topic.id]))
      }
      flash('Topic created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create topic')
    }
  }

  const handleDeleteTopic = async (topicId: number) => {
    const ok = await confirm({ message: 'Delete this topic and all its materials?', danger: true })
    if (!ok) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/class-content/topics/${topicId}?instructor_id=${instructorId}`,
        { method: 'DELETE' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete topic')
      await loadContent()
      flash('Topic deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete topic')
    }
  }

  // Uploads a PDF or Word file and publishes it to students.
  const handleUpload = async (topicId: number, file: File) => {
    if (!instructorId || !classId) return
    setUploadingTopicId(topicId)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('instructor_id', String(instructorId))
      form.append('class_id', String(classId))
      const res = await fetch(`${API_BASE_URL}/api/class-content/topics/${topicId}/files`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      await loadContent()
      setExpandedTopics((prev) => new Set([...prev, topicId]))
      flash('File published to students')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingTopicId(null)
    }
  }

  // Opens the quiz settings popup before publishing.
  const openPublishSettings = (topicId: number) => {
    if (!selectedQuizByTopic[topicId]) return
    setPublishSettings({
      time_limit_minutes: '',
      max_attempts: '',
      shuffle_questions: false,
      shuffle_options: false,
    })
    setPublishTopicId(topicId)
  }

  // Adds the selected quiz to the class quiz topic for students, applying the
  // play settings chosen in the popup so they take effect on the student side.
  const handlePublishQuiz = async () => {
    const topicId = publishTopicId
    if (topicId == null) return
    const quizId = parseInt(selectedQuizByTopic[topicId] || '', 10)
    if (!quizId || !instructorId) return
    setError('')
    setPublishing(true)
    try {
      const settings = {
        time_limit_minutes: publishSettings.time_limit_minutes
          ? parseInt(publishSettings.time_limit_minutes, 10)
          : null,
        max_attempts: publishSettings.max_attempts
          ? parseInt(publishSettings.max_attempts, 10)
          : null,
        shuffle_questions: publishSettings.shuffle_questions,
        shuffle_options: publishSettings.shuffle_options,
      }
      const res = await fetch(`${API_BASE_URL}/api/class-content/topics/${topicId}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructor_id: instructorId, quiz_id: quizId, settings }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to publish quiz')
      setPublishTopicId(null)
      await loadContent()
      flash('Quiz published to students')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish quiz')
    } finally {
      setPublishing(false)
    }
  }

  // Loads a published quiz (with questions) and opens the student-view preview.
  const openQuizPreview = async (quizId?: number | null, title?: string) => {
    if (!quizId || !instructorId) return
    setPreviewIndex(0)
    setPreviewAnswers({})
    setPreviewConfirmed(new Set())
    setPreviewError('')
    setPreviewLoading(true)
    setPreviewQuiz({ id: quizId, title: title || 'Quiz', questions: [] })
    try {
      const res = await fetch(`${API_BASE_URL}/api/quizzes/${quizId}?instructor_id=${instructorId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load quiz')
      const q = data.quiz
      setPreviewQuiz({ id: q.id, title: q.title, questions: q.questions || [] })
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load quiz')
    } finally {
      setPreviewLoading(false)
    }
  }

  const fileViewUrl = (itemId: number) =>
    `${API_BASE_URL}/api/class-content/files/${itemId}/view?instructor_id=${instructorId}`

  const fileDownloadUrl = (itemId: number) =>
    `${API_BASE_URL}/api/class-content/files/${itemId}/download?instructor_id=${instructorId}`

  const openFile = (itemId: number) => {
    window.open(fileViewUrl(itemId), '_blank', 'noopener,noreferrer')
  }

  const handleDeleteItem = async (itemId: number) => {
    const ok = await confirm({ message: 'Remove this item from the course?', danger: true })
    if (!ok) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/class-content/items/${itemId}?instructor_id=${instructorId}`,
        { method: 'DELETE' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to remove item')
      await loadContent()
      flash('Item removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item')
    }
  }

  // Publishes a saved game from the instructor's library to this class.
  const handlePublishGame = async () => {
    if (!selectedGameId || !instructorId || !classId) return
    setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/games/${selectedGameId}/publish/${classId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructor_id: instructorId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to publish game')
      setSelectedGameId('')
      await loadGames()
      flash('Game published to students')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish game')
    }
  }

  const handleUnpublishGame = async (classGameId: number) => {
    const ok = await confirm({ message: 'Remove this game from the class?', danger: true })
    if (!ok) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/games/class-game/${classGameId}?instructor_id=${instructorId}`,
        { method: 'DELETE' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to unpublish')
      await loadGames()
      flash('Game removed from class')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish game')
    }
  }

  const customTopics = topics.filter((t) => !t.is_quiz_topic)
  const quizTopic = topics.find((t) => t.is_quiz_topic)

  return (
    <div className="panel-page instructor-manage-class">
      <PanelBreadcrumbs items={breadcrumbs} />
      {classBackground ? (
        <div
          className="class-hero-banner"
          style={{ backgroundImage: `url(${classBackground})` }}
        >
          <div className="class-hero-banner__overlay">
            <p className="panel-kicker class-hero-banner__kicker">
              Instructor · Manage Class
            </p>
            <h1 className="class-hero-banner__title">{classTitle || 'Manage Class'}</h1>
            <div className="class-hero-banner__meta">
              {classJoinCode && (
                <span className="class-hero-banner__code">{classJoinCode}</span>
              )}
              <span className="class-hero-banner__visibility">{classVisibility}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel-hero panel-hero--page">
          <p className="panel-kicker">Instructor · Manage Class</p>
          <h1>{classTitle || 'Manage Class'}</h1>
          <p className="panel-hero-greeting">
            Create topics, upload PDF or Word files, and publish quizzes for your students.
          </p>
        </div>
      )}

      <div className="panel-top-row">
        <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={onBack}>
          ← Back to Classes
        </button>
        {topics.length > 0 && (
          <div className="panel-row">
            <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        )}
      </div>

      {success && <div className="panel-alert panel-alert-success">{success}</div>}
      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      <div className="panel-card">
        <h3 className="panel-section-title">Add a topic</h3>
        <form onSubmit={handleAddTopic} className="panel-row instructor-manage-class__topic-form">
          <div className="panel-form-group instructor-manage-class__topic-input-group">
            <label className="panel-label" htmlFor="new-topic">Topic name</label>
            <input
              id="new-topic"
              className="panel-input"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="e.g. Week 1: Introduction"
              maxLength={120}
            />
          </div>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={!newTopicName.trim()}>
            Add topic
          </button>
        </form>
        <p className="panel-meta instructor-manage-class__topic-hint">
          After you add a topic, a <strong>Quiz</strong> section appears at the bottom for published quizzes.
        </p>
      </div>

      {loading ? (
        <PanelSkeleton variant="list" count={4} />
      ) : topics.length === 0 ? (
        <PanelEmptyState
          icon="file"
          title="No topics yet"
          description="Add your first topic above, then upload PDF or Word files for students."
        />
      ) : (
        <div className="course-accordion">
          {customTopics.map((topic) => {
            const open = expandedTopics.has(topic.id)
            return (
              <div key={topic.id} className={`course-topic${open ? ' course-topic--open' : ''}`}>
                <button
                  type="button"
                  className="course-topic-header"
                  onClick={() => toggleTopic(topic.id)}
                  aria-expanded={open}
                >
                  <span className="course-topic-chevron">{open ? '▼' : '▶'}</span>
                  <span className="course-topic-name">{topic.name}</span>
                  <span className="panel-meta">{topic.items.length} item{topic.items.length !== 1 ? 's' : ''}</span>
                </button>
                {open && (
                  <div className="course-topic-body">
                    <div className="course-upload-row">
                      <label className="panel-btn panel-btn-primary panel-btn-sm">
                        {uploadingTopicId === topic.id ? 'Uploading…' : '📎 Upload PDF / Word'}
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          hidden
                          disabled={uploadingTopicId === topic.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleUpload(topic.id, f)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="panel-btn panel-btn-danger panel-btn-sm"
                        onClick={() => handleDeleteTopic(topic.id)}
                      >
                        Delete topic
                      </button>
                    </div>
                    {topic.items.length === 0 ? (
                      <p className="panel-meta">No files yet. Upload a PDF or Word document.</p>
                    ) : (
                      <ul className="course-item-list">
                        {topic.items.map((item) => (
                          <li key={item.id} className="course-item">
                            <span className="course-item-icon course-item-icon--file">
                              <PanelIcon name="file" variant="inline" />
                            </span>
                            <span className="course-item-title">{item.title}</span>
                            <div className="course-item-actions">
                              <button
                                type="button"
                                className="panel-btn panel-btn-primary panel-btn-sm"
                                onClick={() => openFile(item.id)}
                              >
                                Open
                              </button>
                              <a
                                className="panel-btn panel-btn-secondary panel-btn-sm instructor-manage-class__download-link"
                                href={fileDownloadUrl(item.id)}
                                download
                              >
                                Download
                              </a>
                              <button
                                type="button"
                                className="panel-icon-btn"
                                title="Remove"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                <PanelIcon name="trash" variant="inline" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Games folder */}
          <div className={`course-topic course-topic--quiz instructor-manage-class__games-topic${gamesExpanded ? ' course-topic--open' : ''}`}>
            <button
              type="button"
              className="course-topic-header"
              onClick={() => { setGamesExpanded(p => !p); if (!gamesExpanded) loadGames() }}
              aria-expanded={gamesExpanded}
            >
              <span className="course-topic-chevron">{gamesExpanded ? '▼' : '▶'}</span>
              <span className="course-topic-name instructor-manage-class__games-topic-name">Games</span>
              <span className="panel-meta">{classGames.length} game{classGames.length !== 1 ? 's' : ''}</span>
            </button>
            {gamesExpanded && (
              <div className="course-topic-body">
                {gamesLoading ? (
                  <PanelSkeleton variant="list" count={2} />
                ) : savedGames.length === 0 ? (
                  <p className="panel-meta">
                    No saved games yet. Go to{' '}
                    <strong className="instructor-manage-class__games-hint">Content Maker → Maze Quest</strong>
                    {' '}to create and save a game first.
                  </p>
                ) : (
                  <div className="course-quiz-publish">
                    <QuizSearchSelect
                      options={savedGames.map((g) => ({
                        id: g.id,
                        title: `${g.title} (${g.quiz_title})${g.ghost_enabled ? ' · Ghost mode' : ''}`,
                        icon: gameTypeMeta(g.game_type).icon,
                      }))}
                      value={selectedGameId}
                      onChange={setSelectedGameId}
                      placeholder="Type a game name to search…"
                      emptyText="No matching saved games"
                      ariaLabel="Search games to publish"
                      optionIcon="game"
                    />
                    <button
                      type="button"
                      className="panel-btn panel-btn-primary panel-btn-sm"
                      onClick={handlePublishGame}
                      disabled={!selectedGameId}
                    >
                      Publish to students
                    </button>
                  </div>
                )}
                {classGames.length > 0 && (
                  <ul className="course-item-list instructor-manage-class__game-list">
                    {classGames.map((cg) => {
                      const meta = gameTypeMeta(cg.game_type)
                      return (
                      <li key={cg.class_game_id} className="course-item course-item--compact">
                        <span className="course-item-icon course-item-icon--game">{meta.icon}</span>
                        <span className="course-item-title">
                          {cg.game_title}
                          <span className={`instructor-manage-class__game-badge instructor-manage-class__game-badge--${cg.game_type}`}>
                            {meta.label}
                          </span>
                          {cg.ghost_enabled && <span className="instructor-manage-class__ghost-icon">Hunter</span>}
                        </span>
                        <button
                          type="button"
                          className="panel-icon-btn"
                          title="Unpublish"
                          onClick={() => handleUnpublishGame(cg.class_game_id)}
                        >
                          <PanelIcon name="trash" variant="inline" />
                        </button>
                      </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {quizTopic && (
            <div
              className={`course-topic course-topic--quiz${expandedTopics.has(quizTopic.id) ? ' course-topic--open' : ''}`}
            >
              <button
                type="button"
                className="course-topic-header"
                onClick={() => toggleTopic(quizTopic.id)}
                aria-expanded={expandedTopics.has(quizTopic.id)}
              >
                <span className="course-topic-chevron">
                  {expandedTopics.has(quizTopic.id) ? '▼' : '▶'}
                </span>
                <span className="course-topic-name">Quiz</span>
                <span className="panel-meta">{quizTopic.items.length} quiz{quizTopic.items.length !== 1 ? 'zes' : ''}</span>
              </button>
              {expandedTopics.has(quizTopic.id) && (
                <div className="course-topic-body">
                  {quizzes.length === 0 ? (
                    <p className="panel-meta">
                      No quizzes in your library yet.{' '}
                      {onCreateQuiz && (
                        <button type="button" className="link-btn" onClick={onCreateQuiz}>
                          Create a quiz in Content Maker
                        </button>
                      )}
                    </p>
                  ) : (
                    <div className="course-quiz-publish">
                      <QuizSearchSelect
                        options={quizzes}
                        value={selectedQuizByTopic[quizTopic.id] || ''}
                        onChange={(id) =>
                          setSelectedQuizByTopic((prev) => ({
                            ...prev,
                            [quizTopic.id]: id,
                          }))
                        }
                        placeholder="Type a quiz name to search…"
                        emptyText="No matching quizzes in your library"
                        ariaLabel="Search quizzes to publish"
                      />
                      <button
                        type="button"
                        className="panel-btn panel-btn-primary panel-btn-sm"
                        onClick={() => openPublishSettings(quizTopic.id)}
                        disabled={!selectedQuizByTopic[quizTopic.id]}
                      >
                        Publish to students
                      </button>
                    </div>
                  )}
                  {quizTopic.items.length > 0 && (
                    <ul className="course-item-list">
                      {quizTopic.items.map((item) => (
                        <li key={item.id} className="course-item course-item--compact">
                          <span className="course-item-icon course-item-icon--quiz">
                            <PanelIcon name="quiz" variant="inline" />
                          </span>
                          <span className="course-item-title">{item.title}</span>
                          <div className="course-item-actions">
                            <button
                              type="button"
                              className="panel-btn panel-btn-secondary panel-btn-sm course-quiz-preview-btn"
                              onClick={() => openQuizPreview(item.quiz_id, item.title)}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className="panel-icon-btn"
                              title="Unpublish"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <PanelIcon name="trash" variant="inline" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Announcements ── */}
      {!loading && (
        <div className="panel-card panel-card--spaced-lg">
          <h3 className="panel-section-title">Announcements</h3>
          <div className="panel-form-group">
            <textarea
              className="panel-textarea"
              rows={3}
              maxLength={500}
              placeholder="Write an announcement for all students in this class…"
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value.slice(0, 500))}
            />
            <p className="panel-char-count">{newAnnouncement.length}/500 characters</p>
          </div>
          <button
            type="button"
            className="panel-btn panel-btn-primary panel-btn-sm"
            onClick={handlePostAnnouncement}
            disabled={postingAnnouncement || !newAnnouncement.trim()}
          >
            {postingAnnouncement ? 'Posting…' : 'Post Announcement'}
          </button>
          {announcements.length > 0 && (
            <div className="announce-list">
              {announcements.map((a) => (
                <div key={a.id} className="announce-item">
                  <p className="announce-item__content">{a.content}</p>
                  <p className="announce-item__meta">
                    <span>{a.instructor_name} · {new Date(a.created_at).toLocaleString()}</span>
                    <button
                      type="button"
                      className="panel-icon-btn"
                      title="Delete"
                      onClick={() => handleDeleteAnnouncement(a.id)}
                    ><PanelIcon name="trash" variant="inline" /></button>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Quiz settings popup (shown on Publish to students) ── */}
      {publishTopicId != null && (
        <div
          className="quiz-publish-modal__overlay"
          onClick={() => { if (!publishing) setPublishTopicId(null) }}
        >
          <div
            className="quiz-publish-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Quiz settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="quiz-publish-modal__header">
              <h3 className="quiz-publish-modal__title">Quiz Settings</h3>
              <button
                type="button"
                className="quiz-publish-modal__close"
                aria-label="Close"
                onClick={() => { if (!publishing) setPublishTopicId(null) }}
              >
                ✕
              </button>
            </div>
            <p className="quiz-publish-modal__subtitle">
              Choose how students take{' '}
              <strong>
                {quizzes.find((q) => String(q.id) === selectedQuizByTopic[publishTopicId])?.title || 'this quiz'}
              </strong>
              . These settings apply to the student side.
            </p>

            <div className="quiz-publish-modal__grid">
              <div className="panel-form-group">
                <label className="panel-label">
                  Time Limit <span className="quiz-publish-modal__hint">(minutes, blank = none)</span>
                </label>
                <input
                  className="panel-input"
                  type="number"
                  min="0"
                  max="300"
                  value={publishSettings.time_limit_minutes}
                  onChange={(e) => setPublishSettings((p) => ({ ...p, time_limit_minutes: e.target.value }))}
                  placeholder="No limit"
                />
              </div>
              <div className="panel-form-group">
                <label className="panel-label">
                  Max Attempts <span className="quiz-publish-modal__hint">(blank = unlimited)</span>
                </label>
                <input
                  className="panel-input"
                  type="number"
                  min="0"
                  max="100"
                  value={publishSettings.max_attempts}
                  onChange={(e) => setPublishSettings((p) => ({ ...p, max_attempts: e.target.value }))}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="quiz-publish-modal__toggles">
              <label className="quiz-publish-modal__check">
                <input
                  type="checkbox"
                  checked={publishSettings.shuffle_questions}
                  onChange={(e) => setPublishSettings((p) => ({ ...p, shuffle_questions: e.target.checked }))}
                />
                Shuffle question order for each student
              </label>
              <label className="quiz-publish-modal__check">
                <input
                  type="checkbox"
                  checked={publishSettings.shuffle_options}
                  onChange={(e) => setPublishSettings((p) => ({ ...p, shuffle_options: e.target.checked }))}
                />
                Shuffle answer options for each student
              </label>
            </div>

            <div className="quiz-publish-modal__actions">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => setPublishTopicId(null)}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                onClick={handlePublishQuiz}
                disabled={publishing}
              >
                {publishing ? 'Publishing…' : 'Publish to students'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quiz preview popup (student view) ── */}
      {previewQuiz && (
        <div className="quiz-publish-modal__overlay" onClick={() => setPreviewQuiz(null)}>
          <div
            className="quiz-preview-pop"
            role="dialog"
            aria-modal="true"
            aria-label="Quiz preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="quiz-preview-pop__header">
              <div>
                <p className="quiz-preview-pop__kicker">Preview · Student view</p>
                <h3 className="quiz-preview-pop__title">{previewQuiz.title}</h3>
              </div>
              <button
                type="button"
                className="quiz-publish-modal__close"
                aria-label="Close"
                onClick={() => setPreviewQuiz(null)}
              >
                ✕
              </button>
            </div>

            {previewLoading ? (
              <p className="quiz-preview-pop__status">Loading quiz…</p>
            ) : previewError ? (
              <p className="quiz-preview-pop__status quiz-preview-pop__status--error">{previewError}</p>
            ) : previewQuiz.questions.length === 0 ? (
              <p className="quiz-preview-pop__status">This quiz has no questions.</p>
            ) : (
              (() => {
                const q = previewQuiz.questions[previewIndex]
                const opts = q.question_type === 'true-false'
                  ? ['True', 'False']
                  : (q.options?.map((o) => o.option_text) ?? [])
                const isConfirmed = previewConfirmed.has(previewIndex)
                const answer = previewAnswers[previewIndex]
                const isLast = previewIndex === previewQuiz.questions.length - 1
                return (
                  <div className="quiz-preview-pop__body">
                    <div className="quiz-preview-pop__progress">
                      <div
                        className="quiz-preview-pop__progress-fill"
                        style={{ width: `${((previewIndex + 1) / previewQuiz.questions.length) * 100}%` }}
                      />
                    </div>
                    <p className="quiz-preview-pop__qnum">
                      Question {previewIndex + 1} of {previewQuiz.questions.length}
                    </p>
                    <p className="quiz-preview-pop__qtext">{q.question_text}</p>
                    <div className="quiz-preview-pop__options">
                      {opts.map((opt) => {
                        const isSelected = answer === opt
                        const isCorrect = isConfirmed && opt === q.correct_answer
                        const isWrong = isConfirmed && isSelected && opt !== q.correct_answer
                        return (
                          <button
                            key={opt}
                            type="button"
                            className={`quiz-preview-pop__option${isSelected ? ' quiz-preview-pop__option--selected' : ''}${isCorrect ? ' quiz-preview-pop__option--correct' : ''}${isWrong ? ' quiz-preview-pop__option--wrong' : ''}`}
                            onClick={() => !isConfirmed && setPreviewAnswers({ ...previewAnswers, [previewIndex]: opt })}
                            disabled={isConfirmed}
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                    {isConfirmed && q.explanation && (
                      <div className="quiz-preview-pop__explanation">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                    <div className="quiz-preview-pop__nav">
                      <button
                        type="button"
                        className="panel-btn panel-btn-secondary panel-btn-sm"
                        onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                        disabled={previewIndex === 0}
                      >
                        ← Previous
                      </button>
                      {!isConfirmed ? (
                        <button
                          type="button"
                          className="panel-btn panel-btn-primary panel-btn-sm"
                          onClick={() => answer && setPreviewConfirmed(new Set([...previewConfirmed, previewIndex]))}
                          disabled={!answer}
                        >
                          Confirm Answer
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="panel-btn panel-btn-primary panel-btn-sm"
                          onClick={() => { if (!isLast) setPreviewIndex(previewIndex + 1) }}
                          disabled={isLast}
                        >
                          Next →
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default InstructorManageClass
