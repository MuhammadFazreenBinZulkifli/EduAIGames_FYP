import { useCallback, useEffect, useRef, useState } from 'react'
import './App_CSS/TriviaRaceGameQuiz_CSS.css'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import PanelSkeleton from './PanelSkeleton'
import PanelEmptyState from './PanelEmptyState'
import {
  countPlayableQuestions,
  normalizeQuestionsForGame,
  type GamePlayQuestion,
  type RawQuizQuestion,
} from '../utils/gameQuizUtils'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RaceStudentGameData {
  gameId: number
  quizId: number
  gameType: 'race'
  title: string
  description: string
  settings: string
}

type Theme = 'city' | 'forest' | 'space'

interface RaceSettings {
  runSpeed: 'slow' | 'normal' | 'fast'
  lives: number
  chaserEnabled: boolean
  theme: Theme
}

type Phase =
  | 'setup'
  | 'loading'
  | 'playing'
  | 'feedback'
  | 'game-over'
  | 'game-complete'
  | 'paused'

interface LibraryQuiz {
  id: number
  title: string
  description?: string
  questions: RawQuizQuestion[]
  class_title?: string
}

// ─── Constants ─────────────────────────────────────────────────────────────

const LIVES_UNLIMITED = -1
const OPTION_LABELS = ['A', 'B', 'C', 'D']
const LANE_COLORS = ['#38bdf8', '#a78bfa', '#fb7185', '#fbbf24']

const TIME_PER_Q: Record<RaceSettings['runSpeed'], number> = {
  slow: 14,
  normal: 10,
  fast: 7,
}

const THEMES: Record<Theme, { bg: string; accent: string; ground: string; label: string }> = {
  city: { bg: 'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)', accent: '#38bdf8', ground: '#334155', label: '🏙 City' },
  forest: { bg: 'linear-gradient(180deg,#052e16 0%,#064e3b 100%)', accent: '#34d399', ground: '#14532d', label: '🌲 Forest' },
  space: { bg: 'linear-gradient(180deg,#1e1b4b 0%,#0f0a2e 100%)', accent: '#a78bfa', ground: '#312e81', label: '🚀 Space' },
}

const DEFAULT_SETTINGS: RaceSettings = {
  runSpeed: 'normal',
  lives: 3,
  chaserEnabled: true,
  theme: 'city',
}

// Parses trivia race game settings from stored JSON.
function parseSettings(raw: string): RaceSettings {
  try {
    const p = JSON.parse(raw || '{}')
    return {
      runSpeed: ['slow', 'normal', 'fast'].includes(p.runSpeed) ? p.runSpeed : DEFAULT_SETTINGS.runSpeed,
      lives: typeof p.lives === 'number' ? p.lives : DEFAULT_SETTINGS.lives,
      chaserEnabled: typeof p.chaserEnabled === 'boolean' ? p.chaserEnabled : DEFAULT_SETTINGS.chaserEnabled,
      theme: ['city', 'forest', 'space'].includes(p.theme) ? p.theme : DEFAULT_SETTINGS.theme,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  instructorId?: number
  studentGameData?: RaceStudentGameData
  onExit: () => void
}

// Trivia race quiz game — answer lane questions while outrunning a chaser.
export default function TriviaRaceGameQuiz({ instructorId, studentGameData, onExit }: Props) {
  const { toast } = usePanelUI()
  const isStudentMode = !!studentGameData

  // ── Setup state ──
  const [quizList, setQuizList] = useState<LibraryQuiz[]>([])
  const [selectedQuizId, setSelectedQuizId] = useState<number | ''>('')
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [settings, setSettings] = useState<RaceSettings>(
    isStudentMode ? parseSettings(studentGameData!.settings) : DEFAULT_SETTINGS
  )

  // ── Game state ──
  const [phase, setPhase] = useState<Phase>(isStudentMode ? 'loading' : 'setup')

  useGameImmersiveMode(phase !== 'setup' && phase !== 'loading')
  const [questions, setQuestions] = useState<GamePlayQuestion[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)
  const [lives, setLives] = useState(DEFAULT_SETTINGS.lives)
  const [wrongCount, setWrongCount] = useState(0)
  const [questionsCleared, setQuestionsCleared] = useState(0)
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q[DEFAULT_SETTINGS.runSpeed])
  const [selectedLane, setSelectedLane] = useState<number | null>(null)
  const [revealCorrect, setRevealCorrect] = useState(false)
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | 'timeout' | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [finalSecs, setFinalSecs] = useState(0)
  const [runnerHop, setRunnerHop] = useState(false)
  const [gameOverReason, setGameOverReason] = useState<'lives' | 'caught'>('lives')

  // ── Refs ──
  const phaseRef = useRef<Phase>(phase)
  const livesRef = useRef(DEFAULT_SETTINGS.lives)
  const questionIdxRef = useRef(0)
  const questionsRef = useRef<GamePlayQuestion[]>([])
  const settingsRef = useRef<RaceSettings>(settings)
  const answeredRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerStartRef = useRef<number | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { livesRef.current = lives }, [lives])
  useEffect(() => { questionIdxRef.current = questionIdx }, [questionIdx])
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { settingsRef.current = settings }, [settings])

  const theme = THEMES[settings.theme]

  // ── Load quiz list (instructor) ──
  useEffect(() => {
    if (isStudentMode || !instructorId) return
    setListLoading(true)
    fetch(`${API_BASE_URL}/api/quizzes/instructor/${instructorId}`)
      .then((r) => r.json())
      .then((d) => { setQuizList(d.quizzes || []); setListError(null) })
      .catch(() => setListError('Failed to load your quizzes.'))
      .finally(() => setListLoading(false))
  }, [instructorId, isStudentMode])

  // ── Student auto-load ──
  useEffect(() => {
    if (isStudentMode && studentGameData) void loadQuestions(studentGameData.quizId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudentMode])

  function clearTimers() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (totalTimerRef.current) { clearInterval(totalTimerRef.current); totalTimerRef.current = null }
  }
  useEffect(() => () => clearTimers(), [])

  function beginTotalTimer() {
    if (!timerStartRef.current) timerStartRef.current = Date.now()
    if (totalTimerRef.current) return
    totalTimerRef.current = setInterval(() => {
      if (timerStartRef.current && (phaseRef.current === 'playing' || phaseRef.current === 'feedback')) {
        setElapsedSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
      }
    }, 250)
  }

  function startQuestionTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const total = TIME_PER_Q[settingsRef.current.runSpeed]
    setTimeLeft(total)
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      const remaining = total - (Date.now() - startedAt) / 1000
      if (remaining <= 0) {
        setTimeLeft(0)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        if (!answeredRef.current && phaseRef.current === 'playing') handleTimeout()
      } else {
        setTimeLeft(remaining)
      }
    }, 100)
  }

  async function loadQuestions(quizId: number) {
    setPhase('loading')
    setListError(null)
    try {
      const qParam = instructorId && !isStudentMode ? `?instructor_id=${instructorId}` : ''
      const res = await fetch(`${API_BASE_URL}/api/quizzes/${quizId}${qParam}`)
      if (!res.ok) throw new Error('Failed to load quiz')
      const data = await res.json()
      const raw: RawQuizQuestion[] = data.quiz?.questions ?? data.questions ?? []
      const playable = normalizeQuestionsForGame(raw)
      if (playable.length === 0) {
        setListError('This quiz has no playable questions. Use multiple-choice (2–4 options) or true/false questions with a valid answer.')
        setPhase('setup')
        return
      }
      startRun(playable)
    } catch {
      setListError('Failed to load quiz. Please try again.')
      setPhase('setup')
    }
  }

  function startRun(playable: GamePlayQuestion[]) {
    const cfg = settingsRef.current
    clearTimers()
    setQuestions(playable)
    questionsRef.current = playable
    const initialLives = cfg.lives === LIVES_UNLIMITED ? LIVES_UNLIMITED : (cfg.lives || 3)
    setLives(initialLives)
    livesRef.current = initialLives
    setWrongCount(0)
    setQuestionsCleared(0)
    setElapsedSecs(0)
    setFinalSecs(0)
    timerStartRef.current = null
    beginTotalTimer()
    goToQuestion(0)
  }

  function startGame() {
    if (!selectedQuizId) return
    const libQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    if (!libQuiz) return
    const playable = normalizeQuestionsForGame(libQuiz.questions)
    if (playable.length === 0) {
      setListError('This quiz has no playable questions. Use multiple-choice (2–4 options) or true/false questions.')
      return
    }
    startRun(playable)
  }

  function goToQuestion(idx: number) {
    setQuestionIdx(idx)
    questionIdxRef.current = idx
    setSelectedLane(null)
    setRevealCorrect(false)
    setLastResult(null)
    answeredRef.current = false
    setPhase('playing')
    phaseRef.current = 'playing'
    startQuestionTimer()
  }

  const handleAnswer = useCallback((laneIdx: number) => {
    if (answeredRef.current || phaseRef.current !== 'playing') return
    const q = questionsRef.current[questionIdxRef.current]
    if (!q || !q.options[laneIdx]) return
    answeredRef.current = true
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setSelectedLane(laneIdx)

    const correct = q.options[laneIdx].is_correct
    if (correct) {
      setLastResult('correct')
      setRunnerHop(true)
      setTimeout(() => setRunnerHop(false), 600)
      const cleared = questionsCleared + 1
      setQuestionsCleared(cleared)
      setPhase('feedback')
      phaseRef.current = 'feedback'
      setTimeout(() => {
        const nextIdx = questionIdxRef.current + 1
        if (nextIdx >= questionsRef.current.length) endRun('game-complete')
        else goToQuestion(nextIdx)
      }, 900)
    } else {
      setLastResult('wrong')
      setRevealCorrect(true)
      setWrongCount((w) => w + 1)
      registerLifeLoss()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsCleared])

  function handleTimeout() {
    answeredRef.current = true
    setLastResult('timeout')
    setRevealCorrect(true)
    setSelectedLane(null)
    registerLifeLoss()
  }

  function registerLifeLoss() {
    setPhase('feedback')
    phaseRef.current = 'feedback'
    const unlimited = livesRef.current === LIVES_UNLIMITED
    const next = unlimited ? LIVES_UNLIMITED : livesRef.current - 1
    if (!unlimited) { livesRef.current = next; setLives(next) }
    setTimeout(() => {
      if (!unlimited && next <= 0) {
        setGameOverReason(settingsRef.current.chaserEnabled ? 'caught' : 'lives')
        endRun('game-over')
      } else {
        // Retry same question
        goToQuestion(questionIdxRef.current)
      }
    }, 1300)
  }

  function endRun(result: 'game-over' | 'game-complete') {
    clearTimers()
    if (timerStartRef.current) setFinalSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
    setPhase(result)
    phaseRef.current = result
  }

  function pauseGame() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setPhase('paused')
    phaseRef.current = 'paused'
  }
  function resumeGame() {
    setPhase('playing')
    phaseRef.current = 'playing'
    answeredRef.current = false
    startQuestionTimer()
  }

  function quitToSetupOrExit() {
    clearTimers()
    if (isStudentMode) onExit()
    else { setPhase('setup'); phaseRef.current = 'setup' }
  }

  // ── Keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing') return
      const q = questionsRef.current[questionIdxRef.current]
      if (!q) return
      const num = parseInt(e.key, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= q.options.length) {
        handleAnswer(num - 1)
      }
      if ((e.key === 'p' || e.key === 'Escape')) pauseGame()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAnswer])

  // ── Save (instructor) ──
  function openSaveDialog() {
    const sel = quizList.find((q) => q.id === Number(selectedQuizId))
    setSaveTitle(sel ? `${sel.title}: Trivia Race` : '')
    setSaveDesc('')
    setSaveDialogOpen(true)
  }

  async function handleSaveGame() {
    if (!selectedQuizId || !saveTitle.trim() || !instructorId) return
    setSaveLoading(true)
    try {
      const body = {
        instructor_id: instructorId,
        quiz_id: Number(selectedQuizId),
        title: saveTitle.trim(),
        description: saveDesc.trim(),
        ghost_enabled: settings.chaserEnabled,
        game_type: 'race',
        settings: JSON.stringify(settings),
      }
      const res = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      setSaveDialogOpen(false)
      toast('Game saved to your Library! Publish it from Manage Class → Game.', 'success')
    } catch {
      toast('Failed to save game. Please try again.', 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  const currentQ = questions[questionIdx]
  const totalQ = questions.length
  const progress = totalQ > 0 ? questionsCleared / totalQ : 0
  const timeTotal = TIME_PER_Q[settings.runSpeed]

  // ─── Render: student load error ───
  if (phase === 'setup' && isStudentMode) {
    return (
      <div className="panel-page trivia-race-game-quiz__page--error">
        <div className="panel-alert panel-alert-error trivia-race-game-quiz__alert-max">{listError || 'Unable to load this game.'}</div>
        <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>Back to Courses</button>
      </div>
    )
  }

  // ─── Render: instructor setup ───
  if (phase === 'setup' && !isStudentMode) {
    const selQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    const playableCount = selQuiz ? countPlayableQuestions(selQuiz.questions) : 0

    return (
      <div className="panel-page trivia-race-game-quiz__page--relative">
        {saveDialogOpen && (
          <div className="trivia-race-game-quiz__modal-backdrop">
            <div className="trivia-race-game-quiz__modal">
              <h2 className="trivia-race-game-quiz__modal-title">Save to Library</h2>
              <p className="panel-meta trivia-race-game-quiz__modal-meta">Saved games can be published to your classes from Manage Class.</p>
              <div className="panel-form-group">
                <label className="panel-label">Game Title *</label>
                <input className="panel-input" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="Give your game a name" maxLength={120} />
              </div>
              <div className="panel-form-group">
                <label className="panel-label">Description (optional)</label>
                <textarea className="panel-textarea" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="Describe this game for students" rows={2} />
              </div>
              <div className="trivia-race-game-quiz__modal-summary">
                <p className="panel-meta trivia-race-game-quiz__modal-summary-text">
                  Quiz: <strong style={{ color: theme.accent }}>{selQuiz?.title}</strong>
                  {' · '}Speed: <strong style={{ color: theme.accent }}>{settings.runSpeed}</strong>
                  {' · '}Theme: <strong style={{ color: theme.accent }}>{settings.theme}</strong>
                </p>
              </div>
              <div className="panel-row trivia-race-game-quiz__modal-actions">
                <button className="panel-btn panel-btn-success trivia-race-game-quiz__modal-btn" onClick={handleSaveGame} disabled={!saveTitle.trim() || saveLoading}>{saveLoading ? 'Saving…' : 'Save Game'}</button>
                <button className="panel-btn panel-btn-secondary trivia-race-game-quiz__modal-btn" onClick={() => setSaveDialogOpen(false)} disabled={saveLoading}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="panel-top-row">
          <div className="panel-hero trivia-race-game-quiz__hero">
            <p className="panel-kicker">Instructor · Content Maker</p>
            <h1>Trivia Race</h1>
            <p>Turn any quiz into a lane-running race. Steer into the correct answer lane before time runs out.</p>
          </div>
          <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>Back to Studio</button>
        </div>

        {listError && <div className="panel-alert panel-alert-error">{listError}</div>}

        <div className="panel-card">
          <h3 className="panel-section-title">1. Choose a Quiz</h3>
          <p className="panel-meta trivia-race-game-quiz__section-meta">Supports multiple-choice (2–4 options) and true/false questions.</p>
          {listLoading ? (
            <PanelSkeleton variant="list" count={3} />
          ) : quizList.length === 0 ? (
            <PanelEmptyState
              icon="quiz"
              title="No Quizzes Found"
              description="Create quizzes in My Classes first, then return here."
            />
          ) : (
            <div className={`panel-form-group ${selQuiz ? 'trivia-race-game-quiz__form-group--quiz-selected' : 'trivia-race-game-quiz__form-group--no-quiz'}`}>
              <label className="panel-label">Select Quiz</label>
              <select className="panel-select" value={selectedQuizId} onChange={(e) => setSelectedQuizId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose a quiz from your library…</option>
                {quizList.map((q) => {
                  const n = countPlayableQuestions(q.questions)
                  return (
                    <option key={q.id} value={q.id} disabled={n === 0}>
                      {q.title} ({n} playable{n === 0 ? ', needs valid questions' : ''}){q.class_title ? ` · ${q.class_title}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          )}
          {selQuiz && (
            <div className="trivia-race-game-quiz__quiz-preview">
              <p className="trivia-race-game-quiz__quiz-preview-title" style={{ color: theme.accent }}>{selQuiz.title}</p>
              {selQuiz.description && <p className="panel-meta trivia-race-game-quiz__quiz-preview-desc">{selQuiz.description}</p>}
              <div className="trivia-race-game-quiz__quiz-preview-stats">
                <span className="panel-meta">{playableCount} playable question{playableCount !== 1 ? 's' : ''}</span>
                <span className="panel-meta">→ {playableCount} race checkpoint{playableCount !== 1 ? 's' : ''}</span>
                {selQuiz.class_title && <span className="panel-meta">Class: {selQuiz.class_title}</span>}
              </div>
              {playableCount === 0 && (
                <p className="panel-meta trivia-race-game-quiz__quiz-preview-error">Add multiple-choice (2–4 options) or true/false questions to use this quiz.</p>
              )}
            </div>
          )}
        </div>

        <div className="panel-card">
          <h3 className="panel-section-title">2. Game Settings</h3>
          <div className="panel-grid trivia-race-game-quiz__settings-grid">
            <div className="panel-form-group trivia-race-game-quiz__form-group--compact">
              <label className="panel-label">Run Speed (time per question)</label>
              <select className="panel-select" value={settings.runSpeed} onChange={(e) => setSettings((s) => ({ ...s, runSpeed: e.target.value as RaceSettings['runSpeed'] }))}>
                <option value="slow">Slow (14s, relaxed)</option>
                <option value="normal">Normal (10s, balanced)</option>
                <option value="fast">Fast (7s, challenging)</option>
              </select>
            </div>
            <div className="panel-form-group trivia-race-game-quiz__form-group--compact">
              <label className="panel-label">Theme</label>
              <select className="panel-select" value={settings.theme} onChange={(e) => setSettings((s) => ({ ...s, theme: e.target.value as Theme }))}>
                <option value="city">🏙 City</option>
                <option value="forest">🌲 Forest</option>
                <option value="space">🚀 Space</option>
              </select>
            </div>
            <div className="panel-form-group trivia-race-game-quiz__form-group--compact">
              <label className="panel-label">Lives</label>
              <select className="panel-select" value={settings.lives} onChange={(e) => setSettings((s) => ({ ...s, lives: Number(e.target.value) }))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'life' : 'lives'}</option>)}
                <option value={LIVES_UNLIMITED}>Unlimited</option>
              </select>
            </div>
          </div>
          <label className="trivia-race-game-quiz__chaser-label">
            <input type="checkbox" checked={settings.chaserEnabled} onChange={(e) => setSettings((s) => ({ ...s, chaserEnabled: e.target.checked }))} />
            Enable chaser (a rival chases you and adds pressure when you run out of time)
          </label>
        </div>

        <div className="panel-row trivia-race-game-quiz__actions">
          <button className="panel-btn trivia-race-game-quiz__test-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={startGame} disabled={!selectedQuizId || playableCount === 0}>▶ Test Play</button>
          <button className="panel-btn panel-btn-success" onClick={openSaveDialog} disabled={!selectedQuizId || playableCount === 0}>💾 Save to Library</button>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return <div className="panel-page"><PanelSkeleton variant="hero" /></div>
  }

  // ─── Render: gameplay ───
  const livesDisplay = lives === LIVES_UNLIMITED ? '∞' : '❤'.repeat(Math.max(0, lives))
  const timePct = Math.max(0, Math.min(100, (timeLeft / timeTotal) * 100))
  const timeColor = timePct > 50 ? '#4ade80' : timePct > 25 ? '#fbbf24' : '#f87171'

  return (
    <div className="panel-page trivia-race-game-quiz__page--gameplay">
      <div className="trivia-race-game-quiz__header">
        <div>
          <p className="panel-kicker trivia-race-game-quiz__header-kicker">{isStudentMode ? 'Trivia Race' : 'Trivia Race · Test Play'}</p>
          <h2 className="trivia-race-game-quiz__header-title">{studentGameData?.title || 'Trivia Race'}</h2>
        </div>
        <div className="trivia-race-game-quiz__header-stats">
          <span className="trivia-race-game-quiz__lives">{livesDisplay}</span>
          <span className="trivia-race-game-quiz__stat">Q {Math.min(questionIdx + 1, totalQ)}/{totalQ}</span>
          <span className="trivia-race-game-quiz__stat">⏱ {elapsedSecs}s</span>
          <button className="panel-btn panel-btn-secondary trivia-race-game-quiz__exit-btn-sm" onClick={quitToSetupOrExit}>Exit</button>
        </div>
      </div>

      <div
        className="trivia-race-game-quiz__stage"
        style={{
          background: theme.bg,
          border: `1px solid ${theme.accent}55`,
          boxShadow: `0 0 32px ${theme.accent}22`,
        }}
      >
        <div className="trivia-race-game-quiz__track">
          <div className="trivia-race-game-quiz__track-ground" style={{ background: theme.ground }} />
          <div className="trivia-race-game-quiz__track-finish">🏁</div>
          {settings.chaserEnabled && (
            <div
              className="trivia-race-game-quiz__track-chaser"
              style={{ left: `calc(${Math.max(0, progress * 92 - 12)}% )` }}
            >👹</div>
          )}
          <div
            className={`trivia-race-game-quiz__track-runner${runnerHop ? ' trivia-race-game-quiz__track-runner--hop' : ''}`}
            style={{ left: `${progress * 92}%` }}
          >🏃</div>
        </div>

        <div className="trivia-race-game-quiz__timer-bar">
          <div className="trivia-race-game-quiz__timer-fill" style={{ width: `${timePct}%`, background: timeColor }} />
        </div>

        {currentQ && (
          <div className="trivia-race-game-quiz__question-box">
            <p className="trivia-race-game-quiz__question-text">{currentQ.question_text}</p>
          </div>
        )}

        {currentQ && (
          <div className={`trivia-race-game-quiz__lanes ${currentQ.options.length <= 2 ? 'trivia-race-game-quiz__lanes--two' : 'trivia-race-game-quiz__lanes--grid'}`}>
            {currentQ.options.map((o, i) => {
              const isSelected = selectedLane === i
              const isCorrectLane = o.is_correct
              let bg = 'rgba(255,255,255,0.05)'
              let border = `1px solid ${LANE_COLORS[i % LANE_COLORS.length]}66`
              if (revealCorrect && isCorrectLane) { bg = 'rgba(34,197,94,0.25)'; border = '2px solid #4ade80' }
              else if (isSelected && lastResult === 'wrong') { bg = 'rgba(239,68,68,0.25)'; border = '2px solid #f87171' }
              else if (isSelected && lastResult === 'correct') { bg = 'rgba(34,197,94,0.25)'; border = '2px solid #4ade80' }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleAnswer(i)}
                  disabled={phase !== 'playing'}
                  className={`trivia-race-game-quiz__lane-btn ${phase === 'playing' ? 'trivia-race-game-quiz__lane-btn--playing' : 'trivia-race-game-quiz__lane-btn--idle'}`}
                  style={{ background: bg, border }}
                >
                  <span className="trivia-race-game-quiz__lane-badge" style={{ background: LANE_COLORS[i % LANE_COLORS.length] }}>{OPTION_LABELS[i]}</span>
                  <span>{o.option_text}</span>
                </button>
              )
            })}
          </div>
        )}

        {phase === 'feedback' && lastResult && (
          <div className={`trivia-race-game-quiz__feedback-banner ${lastResult === 'correct' ? 'trivia-race-game-quiz__feedback-banner--correct' : 'trivia-race-game-quiz__feedback-banner--wrong'}`}>
            {lastResult === 'correct' ? '✅ Correct! Keep running!' : lastResult === 'timeout' ? '⏱ Too slow!' : '❌ Wrong lane!'}
          </div>
        )}

        {phase === 'paused' && (
          <div className="trivia-race-game-quiz__overlay">
            <div className="trivia-race-game-quiz__overlay-inner">
              <p className="trivia-race-game-quiz__overlay-title">Paused</p>
              <div className="trivia-race-game-quiz__overlay-actions">
                <button className="panel-btn trivia-race-game-quiz__gradient-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={resumeGame}>Resume</button>
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>Quit</button>
              </div>
            </div>
          </div>
        )}

        {(phase === 'game-over' || phase === 'game-complete') && (
          <div className="trivia-race-game-quiz__overlay">
            <div className="trivia-race-game-quiz__overlay-inner trivia-race-game-quiz__overlay-inner--wide">
              <p className="trivia-race-game-quiz__overlay-icon">{phase === 'game-complete' ? '🏆' : gameOverReason === 'caught' ? '👹' : '💥'}</p>
              <p className={`trivia-race-game-quiz__overlay-result ${phase === 'game-complete' ? 'trivia-race-game-quiz__overlay-result--win' : 'trivia-race-game-quiz__overlay-result--lose'}`}>
                {phase === 'game-complete' ? 'You reached the finish line!' : gameOverReason === 'caught' ? 'The chaser caught you!' : 'Out of lives!'}
              </p>
              <div className="trivia-race-game-quiz__overlay-stats">
                <span>Cleared: <strong className="trivia-race-game-quiz__overlay-stat-cleared">{questionsCleared}/{totalQ}</strong></span>
                <span>Wrong: <strong className="trivia-race-game-quiz__overlay-stat-wrong">{wrongCount}</strong></span>
                <span>Time: <strong style={{ color: theme.accent }}>{finalSecs}s</strong></span>
              </div>
              <div className="trivia-race-game-quiz__overlay-actions">
                {!isStudentMode && <button className="panel-btn trivia-race-game-quiz__gradient-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={() => { const p = normalizeQuestionsForGame(quizList.find((q) => q.id === Number(selectedQuizId))?.questions || []); if (p.length) startRun(p) }}>↻ Play Again</button>}
                {isStudentMode && <button className="panel-btn trivia-race-game-quiz__gradient-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={() => { void loadQuestions(studentGameData!.quizId) }}>↻ Play Again</button>}
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>{isStudentMode ? 'Back to Courses' : 'Back to Setup'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="trivia-race-game-quiz__footer">
        <p className="panel-meta trivia-race-game-quiz__footer-meta">Tap a lane or press 1–{currentQ?.options.length ?? 4} · P to pause</p>
        {phase === 'playing' && <button className="panel-btn panel-btn-secondary trivia-race-game-quiz__pause-btn" onClick={pauseGame}>⏸ Pause</button>}
      </div>
    </div>
  )
}
