import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { formatGameSettingsLines, gameTypeMeta } from '../utils/gameSettingsDisplay'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import ClassCard from './ClassCard'
import PanelIcon from './PanelIcon'
import PanelSkeleton from './PanelSkeleton'
import { STUDENT_NAV, studentClassContentCrumb } from '../utils/panelBreadcrumbHelpers'
import { pushRecent } from '../utils/sidebarRecents'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/StudentCourses_CSS.css'

interface Announcement {
  id: number
  content: string
  created_at: string
  instructor_name?: string
}

interface JoinedClass {
  id: number
  title: string
  description?: string
  instructor_name?: string
  background_image?: string | null
}

interface TopicItem {
  id: number
  item_type: 'file' | 'quiz'
  title: string
  file_name?: string | null
  quiz_id?: number | null
}

interface ClassGame {
  class_game_id: number
  game_id: number
  game_title: string
  description: string
  ghost_enabled: boolean
  game_type: 'maze' | 'snake' | 'breakout' | 'race'
  settings: string
  quiz_id: number
  quiz_title: string
}

interface Topic {
  id: number
  name: string
  is_quiz_topic: boolean
  items: TopicItem[]
}

interface StudentCoursesProps {
  studentId?: number
  onStartQuiz?: (quizId: number, classId: number) => void
  onStartGame?: (gameId: number, quizId: number, title: string, description: string, ghostEnabled: boolean, gameType: 'maze' | 'snake' | 'breakout' | 'race', settings: string) => void
}

// Browses course topics, materials, quizzes, and games for a selected class.
function StudentCourses({ studentId, onStartQuiz, onStartGame }: StudentCoursesProps) {
  const [searchParams] = useSearchParams()
  const [classes, setClasses] = useState<JoinedClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [classTitle, setClassTitle] = useState('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState('')
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())
  const [classGames, setClassGames] = useState<ClassGame[]>([])
  const [gamesExpanded, setGamesExpanded] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [previewItemIds, setPreviewItemIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const load = async () => {
      if (!studentId) {
        setLoadingClasses(false)
        return
      }
      try {
        setLoadingClasses(true)
        const res = await fetch(`${API_BASE_URL}/api/classes/student/${studentId}/my-classes`)
        if (!res.ok) throw new Error('Failed to load classes')
        const data = await res.json()
        setClasses(data.classes || [])
      } catch {
        setError('Failed to load your classes')
      } finally {
        setLoadingClasses(false)
      }
    }
    load()
  }, [studentId])

  // Loads topics, files, and published games for the chosen class.
  const loadContent = useCallback(async (classId: number) => {
    if (!studentId) return
    try {
      setLoadingContent(true)
      setError('')
      const [contentRes, gamesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/class-content/class/${classId}/student/${studentId}`),
        fetch(`${API_BASE_URL}/api/games/class/${classId}/student/${studentId}`),
      ])
      const data = await contentRes.json().catch(() => ({}))
      if (!contentRes.ok) throw new Error(data.error || 'Failed to load course')
      setClassTitle(data.class?.title || '')
      setTopics(data.topics || [])
      setExpandedTopics(new Set((data.topics || []).map((t: Topic) => t.id)))
      if (gamesRes.ok) {
        const gData = await gamesRes.json()
        setClassGames(gData.games || [])
        if ((gData.games || []).length > 0) setGamesExpanded(true)
      } else {
        setClassGames([])
      }
      // Load announcements for this class
      try {
        const annRes = await fetch(`${API_BASE_URL}/api/classes/${classId}/announcements`)
        if (annRes.ok) {
          const annData = await annRes.json()
          setAnnouncements(annData.announcements || [])
        }
      } catch { /* non-critical */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course')
      setTopics([])
    } finally {
      setLoadingContent(false)
    }
  }, [studentId])

  useEffect(() => {
    if (selectedClassId !== null) loadContent(selectedClassId)
  }, [selectedClassId, loadContent])

  // Record selected class in sidebar recents (scoped to this student's account).
  useEffect(() => {
    if (selectedClassId == null || !classTitle || !studentId) return
    pushRecent('student-content', studentId, {
      id: selectedClassId,
      label: classTitle,
      path: `/student/courses?class=${selectedClassId}`,
    })
  }, [selectedClassId, classTitle, studentId])

  // Supports /student/courses?class=ID links from the dashboard or notifications.
  useEffect(() => {
    if (loadingClasses || classes.length === 0) return
    const classParam = searchParams.get('class')
    if (!classParam) return
    const id = Number(classParam)
    if (Number.isFinite(id) && classes.some((c) => c.id === id)) {
      setSelectedClassId(id)
    }
  }, [searchParams, classes, loadingClasses])

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

  const fileViewUrl = (itemId: number) =>
    `${API_BASE_URL}/api/class-content/files/${itemId}/view?student_id=${studentId}`

  const fileDownloadUrl = (itemId: number) =>
    `${API_BASE_URL}/api/class-content/files/${itemId}/download?student_id=${studentId}`

  const openFile = (itemId: number) => {
    window.open(fileViewUrl(itemId), '_blank', 'noopener,noreferrer')
  }

  const isPdfFile = (fileName?: string | null) =>
    !!fileName && /\.pdf$/i.test(fileName)

  const isImageFile = (fileName?: string | null) =>
    !!fileName && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName)

  const canPreviewFile = (fileName?: string | null) =>
    isPdfFile(fileName) || isImageFile(fileName)

  const togglePreview = (itemId: number) => {
    setPreviewItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const customTopics = topics.filter((t) => !t.is_quiz_topic)
  const quizTopic = topics.find((t) => t.is_quiz_topic)
  const selectedClass = classes.find((c) => c.id === selectedClassId)

  return (
    <div className="panel-page student-courses-page">
      <PanelBreadcrumbs
        items={
          selectedClassId != null && classTitle
            ? [...studentClassContentCrumb(selectedClassId, classTitle)]
            : studentClassContentCrumb()
        }
      />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Student · Learning</p>
        <h1>{STUDENT_NAV.classContent}</h1>
        <p className="panel-hero-greeting">
          {selectedClassId != null && classTitle
            ? `Browse topics, materials, quizzes, and games for ${classTitle}.`
            : 'Pick a class to open topics, materials, quizzes, and learning games.'}
        </p>
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}

      {loadingClasses ? (
        <PanelSkeleton variant="cards" count={3} />
      ) : classes.length === 0 ? (
        <PanelEmptyState
          icon="classes"
          title="No classes yet"
          description="Join a class first to see course materials here."
        />
      ) : selectedClassId === null ? (
        <>
          <p className="panel-section-kicker">Pick a class</p>
          <div className="panel-grid">
            {classes.map((c) => (
              <ClassCard
                key={c.id}
                variant="banner"
                classItem={c}
                bannerFallbackIcon="content"
                clickable
                onClick={() => setSelectedClassId(c.id)}
                descriptionFallback="View topics and materials for this class"
                bodyExtra={
                  c.instructor_name ? (
                    <span className="panel-meta panel-class-card-submeta">Instructor: {c.instructor_name}</span>
                  ) : undefined
                }
                actionLabel="Open course →"
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="panel-context-bar">
            <div>
              <p className="panel-kicker">Selected class</p>
              <h2>{classTitle || selectedClass?.title}</h2>
            </div>
            <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setSelectedClassId(null)}>
              ← Choose another class
            </button>
          </div>

          {announcements.length > 0 && (
            <div className="panel-card panel-card--spaced">
              <h3 className="panel-section-title">Announcements</h3>
              <div className="announce-list">
                {announcements.map((a) => (
                  <div key={a.id} className="announce-item">
                    <p className="announce-item__content">{a.content}</p>
                    <p className="announce-item__meta">
                      <span>{a.instructor_name} · {new Date(a.created_at).toLocaleString()}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topics.length > 0 && (
            <div className="panel-top-row student-courses__topic-row">
              <div className="panel-row">
                <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={expandAll}>
                  Expand all
                </button>
                <button type="button" className="panel-btn panel-btn-secondary panel-btn-sm" onClick={collapseAll}>
                  Collapse all
                </button>
              </div>
            </div>
          )}

          {loadingContent ? (
            <PanelSkeleton variant="list" count={4} />
          ) : topics.length === 0 ? (
            <PanelEmptyState
              icon="content"
              title="No content yet"
              description="Your instructor has not published topics or materials for this class."
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
                        {topic.items.length === 0 ? (
                          <p className="panel-meta">No materials in this topic yet.</p>
                        ) : (
                          <ul className="course-item-list">
                            {topic.items.map((item) => {
                              const previewOpen = previewItemIds.has(item.id)
                              const showPreview = canPreviewFile(item.file_name)
                              return (
                              <li key={item.id} className="course-item student-courses__file-item">
                                <div className="student-courses__file-body">
                                  <span className="course-item-title">{item.title}</span>
                                  {previewOpen && showPreview && (
                                    <div className="student-courses__file-preview">
                                      {isPdfFile(item.file_name) ? (
                                        <iframe
                                          title={item.title}
                                          src={fileViewUrl(item.id)}
                                          className="student-courses__file-preview-frame"
                                        />
                                      ) : (
                                        <img
                                          src={fileViewUrl(item.id)}
                                          alt={item.title}
                                          className="student-courses__file-preview-img"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="course-item-actions">
                                  {showPreview && (
                                    <button
                                      type="button"
                                      className="panel-btn panel-btn-secondary panel-btn-sm"
                                      onClick={() => togglePreview(item.id)}
                                    >
                                      {previewOpen ? 'Hide' : 'Preview'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="panel-btn panel-btn-primary panel-btn-sm"
                                    onClick={() => openFile(item.id)}
                                  >
                                    Open
                                  </button>
                                  <a
                                    className="panel-btn panel-btn-secondary panel-btn-sm student-courses__download-link"
                                    href={fileDownloadUrl(item.id)}
                                    download
                                  >
                                    Download
                                  </a>
                                </div>
                              </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Games folder */}
              {classGames.length > 0 && (
                <div className={`course-topic course-topic--quiz student-courses__games-topic${gamesExpanded ? ' course-topic--open' : ''}`}>
                  <button
                    type="button"
                    className="course-topic-header"
                    onClick={() => setGamesExpanded(p => !p)}
                    aria-expanded={gamesExpanded}
                  >
                    <span className="course-topic-chevron">{gamesExpanded ? '▼' : '▶'}</span>
                    <span className="course-topic-name student-courses__games-name">Games</span>
                    <span className="panel-meta">{classGames.length} game{classGames.length !== 1 ? 's' : ''}</span>
                  </button>
                  {gamesExpanded && (
                    <div className="course-topic-body">
                      <ul className="course-item-list">
                        {classGames.map((game) => {
                          const settingLines = formatGameSettingsLines(
                            game.game_type || 'maze',
                            game.settings || '{}',
                            game.ghost_enabled
                          )
                          const meta = gameTypeMeta(game.game_type || 'maze')
                          return (
                          <li key={game.class_game_id} className="course-item student-courses__game-item">
                            <span className="course-item-icon course-item-icon--game">{meta.icon}</span>
                            <div className="student-courses__game-body">
                              <span className="course-item-title">{game.game_title}</span>
                              <span className={`student-courses__game-badge student-courses__game-badge--${game.game_type || 'maze'}`}>
                                {meta.label}
                              </span>
                              {game.description && (
                                <p className="panel-meta student-courses__game-desc">
                                  {game.description}
                                </p>
                              )}
                              <p className="panel-meta student-courses__game-meta">
                                Quiz: {game.quiz_title}
                              </p>
                              <ul className="student-courses__game-settings">
                                {settingLines.map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ul>
                            </div>
                            {onStartGame && (
                              <button
                                type="button"
                                className="panel-btn panel-btn-primary panel-btn-sm"
                                onClick={() => onStartGame(game.game_id, game.quiz_id, game.game_title, game.description, game.ghost_enabled, game.game_type || 'maze', game.settings || '{}')}
                              >
                                Play
                              </button>
                            )}
                          </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {quizTopic && (
                <div
                  className={`course-topic course-topic--quiz${
                    expandedTopics.has(quizTopic.id) ? ' course-topic--open' : ''
                  }`}
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
                    <span className="panel-meta">
                      {quizTopic.items.length} quiz{quizTopic.items.length !== 1 ? 'zes' : ''}
                    </span>
                  </button>
                  {expandedTopics.has(quizTopic.id) && (
                    <div className="course-topic-body">
                      {quizTopic.items.length === 0 ? (
                        <p className="panel-meta">No quizzes published yet.</p>
                      ) : (
                        <ul className="course-item-list">
                          {quizTopic.items.map((item) => (
                            <li key={item.id} className="course-item">
                              <span className="course-item-icon course-item-icon--quiz">
                                <PanelIcon name="quiz" variant="inline" />
                              </span>
                              <span className="course-item-title">{item.title}</span>
                              {item.quiz_id && onStartQuiz && selectedClassId !== null && (
                                <button
                                  type="button"
                                  className="panel-btn panel-btn-primary panel-btn-sm"
                                  onClick={() => onStartQuiz(item.quiz_id!, selectedClassId)}
                                >
                                  Start quiz
                                </button>
                              )}
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
        </>
      )}
    </div>
  )
}

export default StudentCourses
