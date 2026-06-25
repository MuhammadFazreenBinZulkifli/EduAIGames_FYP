import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { gameTypeMeta } from '../utils/gameSettingsDisplay'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelEmptyState from './PanelEmptyState'
import { INSTRUCTOR_NAV, instructorDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import { ROUTES } from '../routes/paths'
import PanelSkeleton from './PanelSkeleton'
import './App_CSS/PanelPages_CSS.css'
import './App_CSS/InstructorQuizLibrary_CSS.css'

interface Question {
  question_text: string
  question_type: 'multiple-choice' | 'true-false'
  correct_answer: string
  question_order: number
  explanation?: string
  options?: Array<{ option_text: string; option_order: number }>
}

interface LibraryQuiz {
  id: number
  instructor_id: number
  class_id?: number
  title: string
  description: string
  questions: Question[]
  created_at: string
  class_title?: string
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
  created_at: string
}

interface InstructorQuizLibraryProps {
  instructorId?: number
}

type Screen = 'list' | 'view'
type SortOption = 'newest' | 'oldest' | 'title-asc' | 'title-desc'
type QuestionCountFilter = 'all' | '1-5' | '6-10' | '11+'
type GameTypeFilter = '' | SavedGame['game_type']

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function sortLibraryItems<T extends { created_at: string; title: string }>(items: T[], sort: SortOption): T[] {
  const copy = [...items]
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    case 'title-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'title-desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base' }))
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}

function matchesQuestionCount(count: number, filter: QuestionCountFilter) {
  if (filter === 'all') return true
  if (filter === '1-5') return count >= 1 && count <= 5
  if (filter === '6-10') return count >= 6 && count <= 10
  return count >= 11
}

// Central library for viewing, editing, and deleting quizzes and saved games.
function InstructorQuizLibrary({ instructorId }: InstructorQuizLibraryProps) {
  const navigate = useNavigate()
  const { toast, confirm } = usePanelUI()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'quizzes' | 'games'>(() => {
    const tabParam = searchParams.get('tab')
    return tabParam === 'games' ? 'games' : 'quizzes'
  })
  const [screen, setScreen] = useState<Screen>('list')
  const [quizzes, setQuizzes] = useState<LibraryQuiz[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterClassId, setFilterClassId] = useState<number | ''>('')
  const [selectedQuiz, setSelectedQuiz] = useState<LibraryQuiz | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Games tab state ───────────────────────────────────────────────────────────
  const [games, setGames] = useState<SavedGame[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [gameSearchQuery, setGameSearchQuery] = useState('')
  const [gameFilterClassId, setGameFilterClassId] = useState<number | ''>('')
  const [editingGame, setEditingGame] = useState<SavedGame | null>(null)
  const [gameFormData, setGameFormData] = useState({ title: '', description: '', ghost_enabled: false })
  const [gameSaving, setGameSaving] = useState(false)

  const [filterLibraryOnly, setFilterLibraryOnly] = useState(false)
  const [quizSort, setQuizSort] = useState<SortOption>('newest')
  const [quizQuestionFilter, setQuizQuestionFilter] = useState<QuestionCountFilter>('all')
  const [filtersExpanded, setFiltersExpanded] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 600
  )

  const [gameSort, setGameSort] = useState<SortOption>('newest')
  const [gameTypeFilter, setGameTypeFilter] = useState<GameTypeFilter>('')

  const classOptions = useMemo(() => {
    const map = new Map<number, string>()
    quizzes.forEach((quiz) => {
      if (quiz.class_id && quiz.class_title) map.set(quiz.class_id, quiz.class_title)
    })
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }))
  }, [quizzes])

  const filteredQuizzes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = quizzes.filter((quiz) => {
      if (filterLibraryOnly && quiz.class_id) return false
      if (!filterLibraryOnly && filterClassId && quiz.class_id !== filterClassId) return false
      if (!matchesQuestionCount(quiz.questions.length, quizQuestionFilter)) return false
      if (!query) return true
      return (
        quiz.title.toLowerCase().includes(query) ||
        (quiz.description || '').toLowerCase().includes(query) ||
        (quiz.class_title || 'library').toLowerCase().includes(query)
      )
    })
    return sortLibraryItems(filtered, quizSort)
  }, [quizzes, searchQuery, filterClassId, filterLibraryOnly, quizSort, quizQuestionFilter])

  const quizActiveFilterCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count += 1
    if (filterLibraryOnly || filterClassId) count += 1
    if (quizQuestionFilter !== 'all') count += 1
    if (quizSort !== 'newest') count += 1
    return count
  }, [searchQuery, filterLibraryOnly, filterClassId, quizQuestionFilter, quizSort])

  const clearQuizFilters = () => {
    setSearchQuery('')
    setFilterClassId('')
    setFilterLibraryOnly(false)
    setQuizSort('newest')
    setQuizQuestionFilter('all')
  }

  // Loads every quiz created by this instructor.
  const fetchQuizzes = async () => {
    if (!instructorId) {
      setError('Instructor ID is required')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${API_BASE_URL}/api/quizzes/instructor/${instructorId}`)
      if (!response.ok) throw new Error('Failed to fetch your quizzes')
      const data = await response.json()
      setQuizzes(data.quizzes || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuizzes()
  }, [instructorId])

  // Saved game templates from Content Maker (not yet tied to a class until published).
  const fetchGames = useCallback(async () => {
    if (!instructorId) return
    try {
      setGamesLoading(true)
      setGamesError(null)
      const res = await fetch(`${API_BASE_URL}/api/games/instructor/${instructorId}`)
      if (!res.ok) throw new Error('Failed to load games')
      const data = await res.json()
      setGames(data.games || [])
    } catch (err) {
      setGamesError(err instanceof Error ? err.message : 'Failed to load games')
    } finally {
      setGamesLoading(false)
    }
  }, [instructorId])

  useEffect(() => {
    if (activeTab === 'games') fetchGames()
  }, [activeTab, fetchGames])

  const handleDeleteGame = async (game: SavedGame) => {
    if (!instructorId) return
    const ok = await confirm({
      message: `Delete "${game.title}"? This cannot be undone.`,
      danger: true,
    })
    if (!ok) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/games/${game.id}?instructor_id=${instructorId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete')
      await fetchGames()
      toast('Game deleted successfully!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete game', 'error')
    }
  }

  // Opens the inline modal to rename a saved game or toggle ghost/hunter.
  const openEditGame = (game: SavedGame) => {
    setEditingGame(game)
    setGameFormData({ title: game.title, description: game.description, ghost_enabled: game.ghost_enabled })
  }

  // Persists game metadata; gameplay settings stay as saved from the builder.
  const handleSaveEditGame = async () => {
    if (!instructorId || !editingGame || !gameFormData.title.trim()) return
    try {
      setGameSaving(true)
      const res = await fetch(`${API_BASE_URL}/api/games/${editingGame.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          title: gameFormData.title.trim(),
          description: gameFormData.description.trim(),
          ghost_enabled: gameFormData.ghost_enabled,
          settings: editingGame.settings || '{}',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save')
      setEditingGame(null)
      await fetchGames()
      toast('Game saved successfully!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save game', 'error')
    } finally {
      setGameSaving(false)
    }
  }

  const openView = (quiz: LibraryQuiz) => {
    setSelectedQuiz(quiz)
    setScreen('view')
    setError(null)
  }

  const openEdit = (quiz: LibraryQuiz) => {
    navigate(ROUTES.instructor.libraryQuizEdit(quiz.id))
  }

  const backToList = () => {
    setSelectedQuiz(null)
    setScreen('list')
    setError(null)
  }

  // Deletes a quiz from the library after confirmation.
  const handleDeleteQuiz = async (quiz: LibraryQuiz) => {
    if (!instructorId) return
    const ok = await confirm({
      message: `Delete "${quiz.title}"? This cannot be undone.`,
      danger: true,
    })
    if (!ok) return

    try {
      setSaving(true)
      setError(null)
      const response = await fetch(
        `${API_BASE_URL}/api/quizzes/${quiz.id}?instructor_id=${instructorId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to delete quiz')
      }
      if (selectedQuiz?.id === quiz.id) backToList()
      await fetchQuizzes()
      toast('Quiz deleted successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete quiz'
      setError(message)
      toast(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (screen === 'view' && selectedQuiz) {
    return (
      <div className="panel-page">
        <div className="panel-top-row">
          <div className="panel-hero instructor-quiz-library__hero--inline">
            <p className="panel-kicker">Instructor · Library</p>
            <h1>{selectedQuiz.title}</h1>
            <p>{selectedQuiz.description || 'No description provided.'}</p>
          </div>
          <button className="panel-btn panel-btn-secondary" type="button" onClick={backToList}>
            Back to Library
          </button>
        </div>

        <div className="panel-card">
          <div className="panel-row instructor-quiz-library__meta-row">
            <span className="panel-meta">
              {selectedQuiz.class_id ? `Class: ${selectedQuiz.class_title || 'Assigned'}` : 'Library — usable in all classes'}
            </span>
            <span className="panel-meta">
              {selectedQuiz.questions.length} question{selectedQuiz.questions.length !== 1 ? 's' : ''}
            </span>
            <span className="panel-meta">Created {formatDate(selectedQuiz.created_at)}</span>
          </div>
        </div>

        {error && <div className="panel-alert panel-alert-error">{error}</div>}

        <div className="panel-card">
          <h3 className="panel-section-title">Questions</h3>
          {selectedQuiz.questions.map((question, index) => (
            <div key={index} className="panel-question-item instructor-quiz-library__question-item--column">
              <p className="instructor-quiz-library__question-text">
                {index + 1}. {question.question_text}
              </p>
              <p className="q-label instructor-quiz-library__q-label--spaced">
                {question.question_type === 'multiple-choice' ? 'Multiple Choice' : 'True / False'}
              </p>
              {question.options && question.options.length > 0 && (
                <ul className="instructor-quiz-library__options-list">
                  {question.options.map((opt, optIndex) => {
                    const isCorrect = opt.option_text === question.correct_answer
                    return (
                      <li
                        key={optIndex}
                        className={`instructor-quiz-library__option-item${isCorrect ? ' instructor-quiz-library__option-item--correct' : ''}`}
                      >
                        {isCorrect ? '✓ ' : '○ '}
                        {opt.option_text}
                        {isCorrect ? ' (correct)' : ''}
                      </li>
                    )
                  })}
                </ul>
              )}
              {question.explanation && (
                <p className="instructor-quiz-library__explanation">
                  Explanation: {question.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="panel-row instructor-quiz-library__actions-row">
          <button
            className="panel-btn panel-btn-secondary instructor-quiz-library__action-btn"
            type="button"
            onClick={() => openEdit(selectedQuiz)}
          >
            Edit Quiz
          </button>
          <button
            className="panel-btn panel-btn-danger instructor-quiz-library__action-btn"
            type="button"
            onClick={() => handleDeleteQuiz(selectedQuiz)}
            disabled={saving}
          >
            Delete Quiz
          </button>
        </div>
      </div>
    )
  }

  // ─── Filtered games ──────────────────────────────────────────────────────────
  const quizClassByQuizId = useMemo(() => {
    const map = new Map<number, number>()
    quizzes.forEach((quiz) => {
      if (quiz.class_id) map.set(quiz.id, quiz.class_id)
    })
    return map
  }, [quizzes])

  const filteredGames = useMemo(() => {
    const q = gameSearchQuery.trim().toLowerCase()
    const filtered = games.filter((g) => {
      if (gameTypeFilter && g.game_type !== gameTypeFilter) return false
      if (gameFilterClassId) {
        const classId = quizClassByQuizId.get(g.quiz_id)
        if (classId !== gameFilterClassId) return false
      }
      if (!q) return true
      return (
        g.title.toLowerCase().includes(q) ||
        g.quiz_title.toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
      )
    })
    return sortLibraryItems(filtered, gameSort)
  }, [games, gameSearchQuery, gameFilterClassId, gameTypeFilter, gameSort, quizClassByQuizId])

  const gameActiveFilterCount = useMemo(() => {
    let count = 0
    if (gameSearchQuery.trim()) count += 1
    if (gameFilterClassId) count += 1
    if (gameTypeFilter) count += 1
    if (gameSort !== 'newest') count += 1
    return count
  }, [gameSearchQuery, gameFilterClassId, gameTypeFilter, gameSort])

  const clearGameFilters = () => {
    setGameSearchQuery('')
    setGameFilterClassId('')
    setGameTypeFilter('')
    setGameSort('newest')
  }

  return (
    <div className="panel-page">
      <PanelBreadcrumbs items={[instructorDashboardCrumb(), { label: INSTRUCTOR_NAV.library }]} />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">Instructor · Library</p>
        <h1>Library</h1>
        <p className="panel-hero-greeting">Your quizzes and saved games — reuse quizzes across any class you teach.</p>
      </div>

      {/* Tab Bar */}
      <div className="instructor-quiz-library__tabs">
        {(['quizzes', 'games'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`instructor-quiz-library__tab${activeTab === tab ? ' instructor-quiz-library__tab--active' : ''}`}
          >
            {tab === 'quizzes' ? 'Quizzes' : '🎮 Games'}
            {tab === 'quizzes' && quizzes.length > 0 && (
              <span className="instructor-quiz-library__tab-count">({quizzes.length})</span>
            )}
            {tab === 'games' && games.length > 0 && (
              <span className="instructor-quiz-library__tab-count">({games.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── GAMES TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === 'games' && (
        <div>
          {/* Edit Game Modal */}
          {editingGame && (
            <div className="instructor-quiz-library__modal-overlay">
              <div className="instructor-quiz-library__modal">
                <h2 className="instructor-quiz-library__modal-title">Edit Game</h2>
                <div className="panel-form-group">
                  <label className="panel-label">Game Title *</label>
                  <input className="panel-input" value={gameFormData.title}
                    onChange={e => setGameFormData(p => ({ ...p, title: e.target.value }))}
                    placeholder="Game title" maxLength={120} />
                </div>
                <div className="panel-form-group">
                  <label className="panel-label">Description</label>
                  <textarea className="panel-textarea" value={gameFormData.description}
                    onChange={e => setGameFormData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Description (optional)" rows={2} />
                </div>
                <p className="panel-meta instructor-quiz-library__meta--game-info">
                  Type: <strong className={`instructor-quiz-library__game-type-label--${editingGame.game_type}`}>
                    {gameTypeMeta(editingGame.game_type).icon} {gameTypeMeta(editingGame.game_type).label}
                  </strong>
                  {' · '}Quiz: {editingGame.quiz_title}
                </p>
                {(editingGame.game_type === 'maze' || editingGame.game_type === 'snake') && (
                  <label className="instructor-quiz-library__checkbox-label">
                    <input
                      type="checkbox"
                      className="instructor-quiz-library__checkbox"
                      checked={gameFormData.ghost_enabled}
                      onChange={e => setGameFormData(p => ({ ...p, ghost_enabled: e.target.checked }))}
                    />
                    <span className="instructor-quiz-library__checkbox-text">
                      {editingGame.game_type === 'snake' ? 'Hunter Enemy 👾' : 'Ghost Enemy 👻'}
                    </span>
                  </label>
                )}
                <div className="panel-row instructor-quiz-library__modal-actions">
                  <button className="panel-btn panel-btn-success instructor-quiz-library__action-btn" onClick={handleSaveEditGame} disabled={!gameFormData.title.trim() || gameSaving}>
                    {gameSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button className="panel-btn panel-btn-secondary instructor-quiz-library__action-btn" onClick={() => setEditingGame(null)} disabled={gameSaving}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search & filter */}
          <div className="panel-card panel-toolbar-card instructor-quiz-library__filters-card">
            <div className="instructor-quiz-library__filters-header">
              <div>
                <p className="instructor-quiz-library__filters-title">Find games</p>
                <p className="instructor-quiz-library__filters-sub">
                  {gameActiveFilterCount > 0
                    ? `${gameActiveFilterCount} filter${gameActiveFilterCount !== 1 ? 's' : ''} active`
                    : 'Search, sort, and filter saved games'}
                </p>
              </div>
              <div className="instructor-quiz-library__filters-header-actions">
                {gameActiveFilterCount > 0 && (
                  <button type="button" className="instructor-quiz-library__clear-btn" onClick={clearGameFilters}>
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  className="instructor-quiz-library__filters-toggle"
                  aria-expanded={filtersExpanded}
                  onClick={() => setFiltersExpanded((v) => !v)}
                >
                  {filtersExpanded ? 'Less' : 'More'}
                </button>
              </div>
            </div>

            <div className="panel-form-group instructor-quiz-library__search-group instructor-quiz-library__search-group--full">
              <label className="panel-label" htmlFor="game-search">Search</label>
              <input
                id="game-search"
                className="panel-input"
                type="search"
                value={gameSearchQuery}
                onChange={(e) => setGameSearchQuery(e.target.value)}
                placeholder="Search by title, quiz, or description…"
              />
            </div>

            <div className="instructor-quiz-library__chip-row" aria-label="Game type">
              <button
                type="button"
                className={`instructor-quiz-library__chip${gameTypeFilter === '' ? ' instructor-quiz-library__chip--active' : ''}`}
                onClick={() => setGameTypeFilter('')}
              >
                All types
              </button>
              {(['maze', 'snake', 'breakout', 'race'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`instructor-quiz-library__chip instructor-quiz-library__chip--${type}${gameTypeFilter === type ? ' instructor-quiz-library__chip--active' : ''}`}
                  onClick={() => setGameTypeFilter(gameTypeFilter === type ? '' : type)}
                >
                  {gameTypeMeta(type).icon} {gameTypeMeta(type).label}
                </button>
              ))}
            </div>

            {filtersExpanded && (
              <div className="instructor-quiz-library__filters-grid">
                <div className="panel-form-group instructor-quiz-library__filter-group">
                  <label className="panel-label" htmlFor="game-class-filter">Class</label>
                  <select
                    id="game-class-filter"
                    className="panel-select"
                    value={gameFilterClassId}
                    onChange={(e) => setGameFilterClassId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">All classes</option>
                    {classOptions.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="panel-form-group instructor-quiz-library__filter-group">
                  <label className="panel-label" htmlFor="game-sort">Sort by</label>
                  <select
                    id="game-sort"
                    className="panel-select"
                    value={gameSort}
                    onChange={(e) => setGameSort(e.target.value as SortOption)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="title-asc">Title A–Z</option>
                    <option value="title-desc">Title Z–A</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {gamesError && <div className="panel-alert panel-alert-error">{gamesError}</div>}
          {gamesLoading && <PanelSkeleton variant="cards" count={3} />}

          {!gamesLoading && !gamesError && games.length === 0 && (
            <div className="panel-empty panel-empty--polished">
              <div className="panel-empty-icon">🎮</div>
              <h3>No Saved Games Yet</h3>
              <p>Go to Content Maker → Maze Quest, configure a game, then click &quot;Save Game&quot;.</p>
            </div>
          )}

          {!gamesLoading && games.length > 0 && filteredGames.length === 0 && (
            <PanelEmptyState icon="search" title="No Matches" description="Try a different search term." />
          )}

          {!gamesLoading && filteredGames.length > 0 && (
            <>
              <p className="panel-section-kicker">
                Showing {filteredGames.length} of {games.length} game{games.length !== 1 ? 's' : ''}
              </p>
              <div className="panel-grid">
                {filteredGames.map(game => (
                  <div key={game.id} className={`panel-class-card instructor-quiz-library__game-card--${game.game_type}`}>
                    <div className="instructor-quiz-library__game-header">
                      <span className="instructor-quiz-library__game-icon">{gameTypeMeta(game.game_type).icon}</span>
                      <div className="instructor-quiz-library__game-body">
                        <h3 className="instructor-quiz-library__game-title">{game.title}</h3>
                        <span className={`instructor-quiz-library__game-badge instructor-quiz-library__game-badge--${game.game_type}`}>
                          {gameTypeMeta(game.game_type).label}
                        </span>
                      </div>
                    </div>
                    <p className="panel-class-card-description instructor-quiz-library__game-desc">
                      {game.description || 'No description'}
                    </p>
                    <div className="instructor-quiz-library__game-meta-row">
                      <span className="panel-meta">Quiz: {game.quiz_title}</span>
                      {game.game_type === 'maze' && (
                        <span className={`panel-meta${game.ghost_enabled ? ' instructor-quiz-library__ghost-meta--on' : ' instructor-quiz-library__ghost-meta--off'}`}>
                          {game.ghost_enabled ? '👻 Ghost on' : '👻 Ghost off'}
                        </span>
                      )}
                    </div>
                    <span className="panel-meta">Saved {formatDate(game.created_at)}</span>
                    <div className="panel-row instructor-quiz-library__game-actions">
                      <button className="panel-btn panel-btn-secondary panel-btn-sm instructor-quiz-library__game-action-btn" type="button" onClick={() => openEditGame(game)}>
                        Edit
                      </button>
                      <button className="panel-btn panel-btn-danger panel-btn-sm instructor-quiz-library__game-action-btn" type="button" onClick={() => handleDeleteGame(game)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── QUIZZES TAB ───────────────────────────────────────────────────────── */}
      {activeTab === 'quizzes' && (<>
      <div className="panel-top-row instructor-quiz-library__quiz-toolbar">
        <p className="panel-section-kicker" style={{ margin: 0 }}>Your quizzes</p>
        <div className="instructor-quiz-library__toolbar-actions">
          <button
            type="button"
            className="panel-btn panel-btn-secondary panel-btn-sm instructor-quiz-library__ai-create-btn"
            onClick={() => navigate(`${ROUTES.instructor.studioQuiz}?openAi=1`)}
          >
            ✨ AI Quiz
          </button>
          <button
            type="button"
            className="panel-btn panel-btn-primary panel-btn-sm"
            onClick={() => navigate(ROUTES.instructor.studioQuiz)}
          >
            + Create Quiz
          </button>
        </div>
      </div>
      <div className="panel-card panel-toolbar-card instructor-quiz-library__filters-card">
        <div className="instructor-quiz-library__filters-header">
          <div>
            <p className="instructor-quiz-library__filters-title">Find quizzes</p>
            <p className="instructor-quiz-library__filters-sub">
              {quizActiveFilterCount > 0
                ? `${quizActiveFilterCount} filter${quizActiveFilterCount !== 1 ? 's' : ''} active`
                : 'Search, sort, and filter your library'}
            </p>
          </div>
          <div className="instructor-quiz-library__filters-header-actions">
            {quizActiveFilterCount > 0 && (
              <button type="button" className="instructor-quiz-library__clear-btn" onClick={clearQuizFilters}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="instructor-quiz-library__filters-toggle"
              aria-expanded={filtersExpanded}
              onClick={() => setFiltersExpanded((v) => !v)}
            >
              {filtersExpanded ? 'Less' : 'More'}
            </button>
          </div>
        </div>

        <div className="panel-form-group instructor-quiz-library__search-group instructor-quiz-library__search-group--full">
          <label className="panel-label" htmlFor="library-search">
            Search
          </label>
          <input
            id="library-search"
            className="panel-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, description, or class…"
          />
        </div>

        <div className="instructor-quiz-library__chip-row" aria-label="Quiz scope">
          <button
            type="button"
            className={`instructor-quiz-library__chip${!filterLibraryOnly && !filterClassId ? ' instructor-quiz-library__chip--active' : ''}`}
            onClick={() => {
              setFilterLibraryOnly(false)
              setFilterClassId('')
            }}
          >
            All quizzes
          </button>
          <button
            type="button"
            className={`instructor-quiz-library__chip${filterLibraryOnly ? ' instructor-quiz-library__chip--active' : ''}`}
            onClick={() => {
              setFilterLibraryOnly(true)
              setFilterClassId('')
            }}
          >
            Library only
          </button>
        </div>

        {filtersExpanded && (
          <div className="instructor-quiz-library__filters-grid">
            <div className="panel-form-group instructor-quiz-library__filter-group">
              <label className="panel-label" htmlFor="library-class-filter">
                Class
              </label>
              <select
                id="library-class-filter"
                className="panel-select"
                value={filterLibraryOnly ? '' : (filterClassId || '')}
                disabled={filterLibraryOnly}
                onChange={(e) => {
                  setFilterLibraryOnly(false)
                  setFilterClassId(e.target.value ? Number(e.target.value) : '')
                }}
              >
                <option value="">Any class</option>
                {classOptions.map((classItem) => (
                  <option key={classItem.id} value={classItem.id}>
                    {classItem.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="panel-form-group instructor-quiz-library__filter-group">
              <label className="panel-label" htmlFor="library-sort">Sort by</label>
              <select
                id="library-sort"
                className="panel-select"
                value={quizSort}
                onChange={(e) => setQuizSort(e.target.value as SortOption)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
              </select>
            </div>
            <div className="panel-form-group instructor-quiz-library__filter-group">
              <label className="panel-label" htmlFor="library-questions">Questions</label>
              <select
                id="library-questions"
                className="panel-select"
                value={quizQuestionFilter}
                onChange={(e) => setQuizQuestionFilter(e.target.value as QuestionCountFilter)}
              >
                <option value="all">Any count</option>
                <option value="1-5">1–5 questions</option>
                <option value="6-10">6–10 questions</option>
                <option value="11+">11+ questions</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && <div className="panel-alert panel-alert-error">{error}</div>}
      {loading && <PanelSkeleton variant="cards" count={3} />}

      {!loading && !error && quizzes.length === 0 && (
        <PanelEmptyState
          icon="library"
          title="No Quizzes Yet"
          description="Create a quiz in Content Maker. It will be saved here and can be published to any of your classes."
          action={{ label: '+ Create Quiz', onClick: () => navigate(ROUTES.instructor.studioQuiz) }}
        />
      )}

      {!loading && !error && quizzes.length > 0 && filteredQuizzes.length === 0 && (
        <PanelEmptyState
          icon="search"
          title="No Matches"
          description="Try a different search term or clear the class filter."
        />
      )}

      {!loading && filteredQuizzes.length > 0 && (
        <>
          <p className="panel-section-kicker">
            Showing {filteredQuizzes.length} of {quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}
          </p>
          <div className="panel-grid">
            {filteredQuizzes.map((quiz) => (
              <div key={quiz.id} className="panel-class-card panel-class-card--polished panel-class-card--quiz-text">
                <h3>{quiz.title}</h3>
                <p className="panel-class-card-description">
                  {quiz.description || 'No description'}
                </p>
                <div className="panel-row instructor-quiz-library__card-meta-row">
                  <span className="panel-meta">
                    {quiz.class_id ? (quiz.class_title || 'Class quiz') : 'Library — all classes'}
                  </span>
                  <span className="panel-meta">
                    {quiz.questions.length} question{quiz.questions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="panel-meta">Created {formatDate(quiz.created_at)}</span>
                <div className="panel-row instructor-quiz-library__card-actions">
                  <button
                    className="panel-btn panel-btn-primary panel-btn-sm instructor-quiz-library__card-action-btn"
                    type="button"
                    onClick={() => openView(quiz)}
                  >
                    View
                  </button>
                  <button
                    className="panel-btn panel-btn-secondary panel-btn-sm instructor-quiz-library__card-action-btn"
                    type="button"
                    onClick={() => openEdit(quiz)}
                  >
                    Edit
                  </button>
                  <button
                    className="panel-btn panel-btn-danger panel-btn-sm instructor-quiz-library__card-action-btn"
                    type="button"
                    onClick={() => handleDeleteQuiz(quiz)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </>)} {/* end quizzes tab */}
    </div>
  )
}

export default InstructorQuizLibrary
