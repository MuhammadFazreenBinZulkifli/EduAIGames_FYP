import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import './App_CSS/TriviaRaceGameQuiz_CSS.css'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import PanelSkeleton from './PanelSkeleton'
import PanelEmptyState from './PanelEmptyState'
import QuizSearchSelect from './QuizSearchSelect'
import GameHowToModal, { type HowToStep } from './GameHowToModal'
import { useGameHowTo } from '../hooks/useUserPreferences'
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
  // Kept as the storage key, but now means "rival difficulty" (how fast the
  // rival runs). slow = relaxed, normal = balanced, fast = challenging.
  runSpeed: 'slow' | 'normal' | 'fast'
  // `lives` and `chaserEnabled` are no longer used by the race (the rival is
  // always on and there are no lives), but we keep them so older saved games
  // still parse without errors.
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

// The player gets a 5-second head start before the rival begins running.
const HEADSTART_SECS = 5
// How long the rival takes to cross ONE question's worth of track, by difficulty.
// The rival's total run time auto-scales with the number of questions (N * base),
// so any quiz length stays fair.
const RIVAL_SECS_PER_Q: Record<RaceSettings['runSpeed'], number> = {
  slow: 9,
  normal: 7,
  fast: 5.5,
}
const DIFFICULTY_LABEL: Record<RaceSettings['runSpeed'], string> = {
  slow: 'Relaxed',
  normal: 'Balanced',
  fast: 'Challenging',
}
// Horizontal track geometry (% of the track width). Runners travel from
// TRACK_START to TRACK_FINISH, and the finish line sits exactly at TRACK_FINISH
// so a runner lands ON the finish line when they complete the race.
const TRACK_START = 4
const TRACK_FINISH = 94
const TRACK_SPAN = TRACK_FINISH - TRACK_START

// Fisher–Yates shuffle (returns a new array; does not mutate the input).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
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

// Trivia race quiz game — answer correctly to outrun a rival to the finish line.
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

  // How to Play modal. Trivia Race is real-time with no pause, so the modal is a
  // gate shown BEFORE the race begins (the run only starts once it's dismissed).
  const howTo = useGameHowTo('trivia')
  const [howToOpen, setHowToOpen] = useState(false)
  const pendingStartRef = useRef<(() => void) | null>(null)

  useGameImmersiveMode(phase !== 'setup' && phase !== 'loading')
  const [questions, setQuestions] = useState<GamePlayQuestion[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [questionsCleared, setQuestionsCleared] = useState(0)
  const [selectedLane, setSelectedLane] = useState<number | null>(null)
  const [revealCorrect, setRevealCorrect] = useState(false)
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [finalSecs, setFinalSecs] = useState(0)
  const [runnerHop, setRunnerHop] = useState(false)
  // Rival progress, 0..100 (later mapped onto the track span), and head-start countdown.
  const [rivalPct, setRivalPct] = useState(0)
  const [headstartLeft, setHeadstartLeft] = useState(HEADSTART_SECS)
  const [showGo, setShowGo] = useState(false)

  // ── Refs ──
  const phaseRef = useRef<Phase>(phase)
  const questionIdxRef = useRef(0)
  const questionsRef = useRef<GamePlayQuestion[]>([])
  const settingsRef = useRef<RaceSettings>(settings)
  const answeredRef = useRef(false)
  const totalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerStartRef = useRef<number | null>(null)
  // Real-time race loop refs.
  const rafRef = useRef<number | null>(null)
  const raceStartRef = useRef<number | null>(null)
  const rivalRef = useRef(0) // rival progress 0..1 (computed each frame)
  const rivalAdjustRef = useRef(0) // net manual offset from correct/wrong answers
  const lastEmitRef = useRef(0) // throttle rival re-renders
  const goShownRef = useRef(false) // ensures the "GO!" flash fires once per run

  useEffect(() => { phaseRef.current = phase }, [phase])
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
    if (totalTimerRef.current) { clearInterval(totalTimerRef.current); totalTimerRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
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

  // The rival's position is derived from REAL elapsed wall-clock time (not from
  // accumulated frame deltas). This is what keeps the race honest when the player
  // switches tabs / alt-tabs: requestAnimationFrame is throttled while the tab is
  // hidden, but Date.now() keeps ticking, so on return the rival is exactly where
  // it should be — the game can't be paused by leaving the tab.
  function rivalProgressNow(): number {
    const cfg = settingsRef.current
    const n = Math.max(1, questionsRef.current.length)
    const sinceStart = raceStartRef.current ? (Date.now() - raceStartRef.current) / 1000 : 0
    const runSecs = Math.max(0, sinceStart - HEADSTART_SECS)
    const totalRun = n * RIVAL_SECS_PER_Q[cfg.runSpeed]
    const timeComp = runSecs / totalRun
    return Math.max(0, Math.min(1, timeComp + rivalAdjustRef.current))
  }

  // ── Real-time rival race loop ──
  // Runs through both 'playing' and 'feedback' so the rival never stops. It only
  // reads wall-clock state, so it self-corrects after the tab regains focus.
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'feedback') return
    const loop = () => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'feedback') return

      const sinceStart = raceStartRef.current ? (Date.now() - raceStartRef.current) / 1000 : 0
      const hsLeft = Math.max(0, Math.ceil(HEADSTART_SECS - sinceStart))
      setHeadstartLeft((prev) => (prev !== hsLeft ? hsLeft : prev))

      // Flash "GO!" once, the moment the head start ends.
      if (sinceStart >= HEADSTART_SECS && !goShownRef.current) {
        goShownRef.current = true
        setShowGo(true)
        setTimeout(() => setShowGo(false), 850)
      }

      const p = rivalProgressNow()
      rivalRef.current = p
      if (p >= 1) {
        setRivalPct(100)
        endRun('game-over')
        return
      }

      // Throttle re-renders to ~30fps for smooth play on phones.
      const now = performance.now()
      if (now - lastEmitRef.current > 33) {
        lastEmitRef.current = now
        setRivalPct(p * 100)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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
        setListError('This quiz has no playable questions. Use multiple-choice (2-4 options) or true/false questions with a valid answer.')
        setPhase('setup')
        return
      }
      requestStart(() => startRun(playable))
    } catch {
      setListError('Failed to load quiz. Please try again.')
      setPhase('setup')
    }
  }

  function startRun(playable: GamePlayQuestion[]) {
    clearTimers()
    // Shuffle the question order AND the options inside each question so every
    // run feels different and players can't memorise positions.
    const shuffled = shuffle(playable).map((q) => ({ ...q, options: shuffle(q.options) }))
    setQuestions(shuffled)
    questionsRef.current = shuffled
    setWrongCount(0)
    setQuestionsCleared(0)
    setElapsedSecs(0)
    setFinalSecs(0)
    // Reset the race.
    rivalRef.current = 0
    rivalAdjustRef.current = 0
    goShownRef.current = false
    setShowGo(false)
    setRivalPct(0)
    setHeadstartLeft(HEADSTART_SECS)
    lastEmitRef.current = 0
    timerStartRef.current = null
    raceStartRef.current = Date.now()
    beginTotalTimer()
    goToQuestion(0)
  }

  // Gate the race start behind the How to Play modal (unless disabled for this
  // user). The modal must be dismissed before any timer or rival starts moving.
  function requestStart(begin: () => void) {
    if (howTo.disabled) {
      begin()
      return
    }
    pendingStartRef.current = begin
    setHowToOpen(true)
  }

  function beginPendingStart() {
    setHowToOpen(false)
    const fn = pendingStartRef.current
    pendingStartRef.current = null
    fn?.()
  }

  function startGame() {
    if (!selectedQuizId) return
    const libQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    if (!libQuiz) return
    const playable = normalizeQuestionsForGame(libQuiz.questions)
    if (playable.length === 0) {
      setListError('This quiz has no playable questions. Use multiple-choice (2-4 options) or true/false questions.')
      return
    }
    requestStart(() => startRun(playable))
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
  }

  const handleAnswer = useCallback((laneIdx: number) => {
    if (answeredRef.current || phaseRef.current !== 'playing') return
    const q = questionsRef.current[questionIdxRef.current]
    if (!q || !q.options[laneIdx]) return
    answeredRef.current = true
    setSelectedLane(laneIdx)

    const n = Math.max(1, questionsRef.current.length)
    const correct = q.options[laneIdx].is_correct
    if (correct) {
      setLastResult('correct')
      setRunnerHop(true)
      setTimeout(() => setRunnerHop(false), 600)
      // Reward: a correct answer buys you breathing room (delays the rival).
      rivalAdjustRef.current = Math.max(-0.25, rivalAdjustRef.current - 0.5 / n)
      setRivalPct(rivalProgressNow() * 100)
      const cleared = questionsCleared + 1
      setQuestionsCleared(cleared)
      setPhase('feedback')
      phaseRef.current = 'feedback'
      setTimeout(() => {
        if (phaseRef.current !== 'feedback') return // race already ended
        const nextIdx = questionIdxRef.current + 1
        if (nextIdx >= questionsRef.current.length) endRun('game-complete')
        else goToQuestion(nextIdx)
      }, 800)
    } else {
      setLastResult('wrong')
      // Do NOT reveal the correct answer — the player must keep trying.
      setWrongCount((w) => w + 1)
      // Penalty: a wrong answer lets the rival sprint forward.
      rivalAdjustRef.current = Math.min(1, rivalAdjustRef.current + 0.85 / n)
      rivalRef.current = rivalProgressNow()
      setRivalPct(rivalRef.current * 100)
      setPhase('feedback')
      phaseRef.current = 'feedback'
      setTimeout(() => {
        // If the penalty pushed the rival over the line, the loop ends the game.
        if (phaseRef.current !== 'feedback') return
        if (rivalRef.current >= 1) { endRun('game-over'); return }
        goToQuestion(questionIdxRef.current) // retry the same question
      }, 1200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionsCleared])

  function endRun(result: 'game-over' | 'game-complete') {
    clearTimers()
    if (timerStartRef.current) setFinalSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
    setPhase(result)
    phaseRef.current = result
  }

  function quitToSetupOrExit() {
    clearTimers()
    if (isStudentMode) onExit()
    else { setPhase('setup'); phaseRef.current = 'setup' }
  }

  // ── Keyboard (answer with number keys; no pause in a live race) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing') return
      const q = questionsRef.current[questionIdxRef.current]
      if (!q) return
      const num = parseInt(e.key, 10)
      if (!Number.isNaN(num) && num >= 1 && num <= q.options.length) {
        handleAnswer(num - 1)
      }
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
        ghost_enabled: true,
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
  const playerLeft = TRACK_START + progress * TRACK_SPAN
  const rivalLeft = TRACK_START + (rivalPct / 100) * TRACK_SPAN
  // The rival is "breathing down your neck" once it's within 12% of you (and running).
  const rivalDanger = phase === 'playing' && headstartLeft === 0 && rivalPct / 100 > progress - 0.12

  const triviaHowToSteps: HowToStep[] = [
    { icon: '🏁', text: <>It&apos;s a race against a rival runner. First to the finish line wins.</> },
    { icon: '⏱️', text: <>You get a <strong>{HEADSTART_SECS}-second head start</strong> before the rival begins running.</> },
    { icon: '✅', text: <>Tap a lane (or press the number keys) to answer. <strong>Correct answers</strong> push you forward and slow the rival.</> },
    { icon: '❌', text: <>Wrong answers let the rival sprint ahead, so choose carefully.</> },
    { icon: '🚫', text: <>There&apos;s <strong>no pausing</strong>, so keep running until you reach the finish line!</> },
  ]

  const howToModalEl = (
    <GameHowToModal
      open={howToOpen}
      gameName="Trivia Race"
      subtitle="Outrun the rival by answering questions correctly."
      accent="#6366f1"
      icon="🏃"
      steps={triviaHowToSteps}
      primaryLabel="Start Race!"
      onPrimary={beginPendingStart}
      onClose={beginPendingStart}
      dontShowAgain={howTo.disabled}
      onDontShowAgainChange={howTo.setDisabled}
    />
  )

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
                  {' · '}Rival: <strong style={{ color: theme.accent }}>{DIFFICULTY_LABEL[settings.runSpeed]}</strong>
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
            <p>Turn any quiz into a head-to-head race. Answer correctly to outrun the rival to the finish line.</p>
          </div>
        </div>

        {listError && <div className="panel-alert panel-alert-error">{listError}</div>}

        <div className="panel-card">
          <h3 className="panel-section-title">1. Choose a Quiz</h3>
          <p className="panel-meta trivia-race-game-quiz__section-meta">Supports multiple-choice (2-4 options) and true/false questions.</p>
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
              <label className="panel-label">Search your quiz library</label>
              <QuizSearchSelect
                options={quizList.map((q) => {
                  const n = countPlayableQuestions(q.questions)
                  return {
                    id: q.id,
                    title: `${q.title}${q.class_title ? ` · ${q.class_title}` : ''}${n === 0 ? ' · needs valid questions' : ''}`,
                  }
                })}
                value={selectedQuizId === '' ? '' : String(selectedQuizId)}
                onChange={(id) => setSelectedQuizId(id ? Number(id) : '')}
                placeholder="Type a quiz name to search…"
                emptyText="No matching quizzes in your library"
                ariaLabel="Search quizzes to build a game"
                optionIcon="quiz"
              />
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
                <p className="panel-meta trivia-race-game-quiz__quiz-preview-error">Add multiple-choice (2-4 options) or true/false questions to use this quiz.</p>
              )}
            </div>
          )}
        </div>

        <div className="panel-card">
          <h3 className="panel-section-title">2. Game Settings</h3>
          <div className="panel-grid trivia-race-game-quiz__settings-grid">
            <div className="panel-form-group trivia-race-game-quiz__form-group--compact">
              <label className="panel-label">Rival Difficulty</label>
              <select className="panel-select" value={settings.runSpeed} onChange={(e) => setSettings((s) => ({ ...s, runSpeed: e.target.value as RaceSettings['runSpeed'] }))}>
                <option value="slow">Relaxed (rival runs slowly)</option>
                <option value="normal">Balanced</option>
                <option value="fast">Challenging (rival runs fast)</option>
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
          </div>
          <p className="panel-meta trivia-race-game-quiz__section-meta trivia-race-game-quiz__rules-note">
            You get a {HEADSTART_SECS}-second head start. Answer correctly to pull ahead. Every correct answer pushes the rival back, while wrong answers let it sprint forward. Reach the finish line before the rival to win. No pausing!
          </p>
        </div>

        <div className="panel-row trivia-race-game-quiz__actions">
          <button className="panel-btn panel-btn-success trivia-race-game-quiz__action-btn" type="button" onClick={startGame} disabled={!selectedQuizId || playableCount === 0}>▶ Test Play</button>
          <button className="panel-btn panel-btn-secondary trivia-race-game-quiz__action-btn" type="button" onClick={openSaveDialog} disabled={!selectedQuizId || playableCount === 0}>💾 Save Game</button>
        </div>
        {howToModalEl}
      </div>
    )
  }

  if (phase === 'loading') {
    return <div className="panel-page"><PanelSkeleton variant="hero" />{howToModalEl}</div>
  }

  // ─── Render: gameplay ───
  return (
    <div className="panel-page trivia-race-game-quiz__page--gameplay">
      <div className="trivia-race-game-quiz__header">
        <div>
          <p className="panel-kicker trivia-race-game-quiz__header-kicker">{isStudentMode ? 'Trivia Race' : 'Trivia Race · Test Play'}</p>
          <h2 className="trivia-race-game-quiz__header-title">{studentGameData?.title || 'Trivia Race'}</h2>
        </div>
        <div className="trivia-race-game-quiz__header-stats">
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
        <div className={`trivia-race-game-quiz__track${rivalDanger ? ' trivia-race-game-quiz__track--danger' : ''}`}>
          <div className={`trivia-race-game-quiz__track-backdrop trivia-race-game-quiz__track-backdrop--${settings.theme}`} aria-hidden="true" />

          {/* Finish line spanning both lanes — runners land exactly on it. */}
          <div className="trivia-race-game-quiz__finish-line" style={{ left: `${TRACK_FINISH}%` }} aria-hidden="true">
            <span className="trivia-race-game-quiz__finish-flag">🏁</span>
          </div>

          {/* Rival lane (top) */}
          <div className="trivia-race-game-quiz__lane-row trivia-race-game-quiz__lane-row--rival">
            <span className="trivia-race-game-quiz__lane-tag trivia-race-game-quiz__lane-tag--rival">RIVAL</span>
            <div className="trivia-race-game-quiz__trail trivia-race-game-quiz__trail--rival" style={{ width: `${rivalLeft}%` }} />
            <div className="trivia-race-game-quiz__token trivia-race-game-quiz__token--rival" style={{ left: `${rivalLeft}%` }}>
              <span className="trivia-race-game-quiz__token-emoji">🤖</span>
            </div>
          </div>

          {/* Player lane (bottom) */}
          <div className="trivia-race-game-quiz__lane-row trivia-race-game-quiz__lane-row--you">
            <span className="trivia-race-game-quiz__lane-tag trivia-race-game-quiz__lane-tag--you">YOU</span>
            {/* checkpoint per question */}
            {totalQ > 0 && totalQ <= 30 && Array.from({ length: totalQ }).map((_, i) => (
              <span
                key={i}
                className={`trivia-race-game-quiz__checkpoint${i < questionsCleared ? ' trivia-race-game-quiz__checkpoint--done' : ''}`}
                style={{ left: `${TRACK_START + ((i + 1) / totalQ) * TRACK_SPAN}%` }}
              />
            ))}
            <div className="trivia-race-game-quiz__trail trivia-race-game-quiz__trail--you" style={{ width: `${playerLeft}%` }} />
            <div
              className={`trivia-race-game-quiz__token trivia-race-game-quiz__token--you${runnerHop ? ' trivia-race-game-quiz__token--hop' : ''}`}
              style={{ left: `${playerLeft}%` }}
            >
              {runnerHop && <span className="trivia-race-game-quiz__dust" aria-hidden="true" />}
              <span className="trivia-race-game-quiz__token-emoji">🏃</span>
            </div>
          </div>

          {(phase === 'playing' || phase === 'feedback') && headstartLeft > 0 && (
            <div className="trivia-race-game-quiz__countdown" aria-hidden="true">{headstartLeft}</div>
          )}
          {showGo && <div className="trivia-race-game-quiz__go" aria-hidden="true">GO!</div>}
        </div>

        <div className="trivia-race-game-quiz__race-status">
          <span className="trivia-race-game-quiz__race-status-you">🏃 You {questionsCleared}/{totalQ}</span>
          <span className="trivia-race-game-quiz__race-status-sep">VS</span>
          <span className={`trivia-race-game-quiz__race-status-rival${rivalDanger ? ' trivia-race-game-quiz__race-status-rival--danger' : ''}`}>🤖 Rival {Math.round(rivalPct)}%</span>
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
                  style={{ background: bg, border, '--lane-color': LANE_COLORS[i % LANE_COLORS.length] } as CSSProperties}
                >
                  <span className="trivia-race-game-quiz__lane-badge" style={{ background: LANE_COLORS[i % LANE_COLORS.length] }}>{OPTION_LABELS[i]}</span>
                  <span className="trivia-race-game-quiz__lane-text">{o.option_text}</span>
                  <span className="trivia-race-game-quiz__lane-key" aria-hidden="true">{i + 1}</span>
                </button>
              )
            })}
          </div>
        )}

        {phase === 'feedback' && lastResult && (
          <div className={`trivia-race-game-quiz__feedback-banner ${lastResult === 'correct' ? 'trivia-race-game-quiz__feedback-banner--correct' : 'trivia-race-game-quiz__feedback-banner--wrong'}`}>
            {lastResult === 'correct' ? '✅ Correct! You surge ahead!' : '❌ Wrong! Try again, the rival sprints ahead!'}
          </div>
        )}

        {(phase === 'game-over' || phase === 'game-complete') && (
          <div className="trivia-race-game-quiz__overlay">
            <div className="trivia-race-game-quiz__overlay-inner trivia-race-game-quiz__overlay-inner--wide">
              <p className="trivia-race-game-quiz__overlay-icon">{phase === 'game-complete' ? '🏆' : '🤖'}</p>
              <p className={`trivia-race-game-quiz__overlay-result ${phase === 'game-complete' ? 'trivia-race-game-quiz__overlay-result--win' : 'trivia-race-game-quiz__overlay-result--lose'}`}>
                {phase === 'game-complete' ? 'You beat the rival to the finish!' : 'The rival reached the finish first!'}
              </p>
              <div className="trivia-race-game-quiz__overlay-stats">
                <span>Cleared: <strong className="trivia-race-game-quiz__overlay-stat-cleared">{questionsCleared}/{totalQ}</strong></span>
                <span>Wrong: <strong className="trivia-race-game-quiz__overlay-stat-wrong">{wrongCount}</strong></span>
                <span>Time: <strong style={{ color: theme.accent }}>{finalSecs}s</strong></span>
              </div>
              <div className="trivia-race-game-quiz__overlay-actions">
                {!isStudentMode && <button className="panel-btn trivia-race-game-quiz__gradient-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={() => { const p = normalizeQuestionsForGame(quizList.find((q) => q.id === Number(selectedQuizId))?.questions || []); if (p.length) requestStart(() => startRun(p)) }}>↻ Play Again</button>}
                {isStudentMode && <button className="panel-btn trivia-race-game-quiz__gradient-btn" style={{ background: `linear-gradient(135deg,${theme.accent},#6366f1)` }} onClick={() => { void loadQuestions(studentGameData!.quizId) }}>↻ Play Again</button>}
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>{isStudentMode ? 'Back to Courses' : 'Back to Setup'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="trivia-race-game-quiz__footer">
        <p className="panel-meta trivia-race-game-quiz__footer-meta">Tap a lane or press 1-{currentQ?.options.length ?? 4} to answer. No pausing, keep running!</p>
      </div>

      {howToModalEl}
    </div>
  )
}
