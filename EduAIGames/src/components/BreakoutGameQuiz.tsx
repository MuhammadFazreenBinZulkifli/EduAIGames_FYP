import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App_CSS/BreakoutGameQuiz_CSS.css'
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

export interface BreakoutStudentGameData {
  gameId: number
  quizId: number
  gameType: 'breakout'
  title: string
  description: string
  settings: string
}

interface BreakoutSettings {
  ballSpeed: 'slow' | 'normal' | 'fast'
  paddleSize: 'small' | 'normal' | 'wide'
  lives: number
  // How often the hidden multiball buff appears (more = faster, shorter games).
  buffFrequency: 'low' | 'normal' | 'high'
}

type Phase =
  | 'setup'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'level-complete'
  | 'level-failed'
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

// Shields surround the answer bricks: black = 1 hit, red = 2 hits. One shield
// secretly carries a power-up that's revealed only when the shield is destroyed.
type BrickKind = 'answer' | 'shieldBlack' | 'shieldRed'
type PowerUp = 'multiball'

interface Brick {
  x: number
  y: number
  w: number
  h: number
  kind: BrickKind
  hp: number
  maxHp: number
  broken: boolean
  buff: PowerUp | null
  // Answer-only fields:
  label?: string
  optionText?: string
  isCorrect?: boolean
  color?: string
}

interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  // The real ball (white) is the only one that can hit answers and the only one
  // whose loss fails the level. Clone balls (green) from the multiball buff just
  // help smash shields.
  real: boolean
}

// Short-lived burst particles for satisfying brick smashes (visual only).
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CANVAS_W = 760
const CANVAS_H = 500
const BALL_R = 8
const PADDLE_Y = CANVAS_H - 36
const PADDLE_H = 14
const LIVES_UNLIMITED = -1

const BALL_SPEED: Record<BreakoutSettings['ballSpeed'], number> = {
  slow: 300,
  normal: 410,
  fast: 540,
}
const PADDLE_W: Record<BreakoutSettings['paddleSize'], number> = {
  small: 90,
  normal: 130,
  wide: 180,
}

const BRICK_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24']
const OPTION_LABELS = ['A', 'B', 'C', 'D']

// Protective wall config — a fine grid of small bricks (4 layers). The top layer
// holds the answer bricks, each one surrounded on its sides + below by shields, so
// the player must chip through the wall to expose and hit an answer.
const WALL_SIDE = 34       // left/right margin of the wall
const WALL_TOP = 42        // y of the top (answer) layer
const WALL_COLS = 11       // columns of small bricks
const SHIELD_LAYERS_MAX = 4 // max shield rows beneath the answer layer
const ANSWER_H = 24        // taller top layer so the A/B/C/D label is readable
const SHIELD_H = 15        // the "much smaller" protective bricks
const LAYER_GAP = 6
const BRICK_INSET = 3      // gap between adjacent bricks

const MULTIBALL_SPAWN = 3  // extra (green clone) balls released by each buff
const MAX_BALLS = 10
// How many shields secretly carry a multiball buff, per the instructor's chosen
// "Multiball Buff" frequency. More buffs clear the wall faster (shorter runs).
const BUFF_FREQUENCY: Record<BreakoutSettings['buffFrequency'], { ratio: number; min: number }> = {
  low: { ratio: 0.08, min: 1 },
  normal: { ratio: 0.18, min: 2 },
  high: { ratio: 0.34, min: 3 },
}

// Fisher–Yates shuffle (used to randomise answer positions each level).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Several protective-wall shapes so every question looks different. Each returns
// whether a shield sits at (row, col) of the shield grid below the answer layer.
// (The row directly under the answers is always filled separately, so answers stay
// protected regardless of the chosen shape.)
interface WallPattern {
  name: string
  rows: number
  present: (r: number, c: number, rows: number, cols: number) => boolean
}
const WALL_PATTERNS: WallPattern[] = [
  { name: 'solid', rows: 3, present: () => true },
  { name: 'checker', rows: 4, present: (r, c) => (r + c) % 2 === 0 },
  { name: 'pillars', rows: 4, present: (r, c) => c % 2 === 0 || r === 0 },
  { name: 'fortress', rows: 4, present: (r, c, R, C) => r === 0 || r === R - 1 || c === 0 || c === C - 1 },
  { name: 'pyramid', rows: 4, present: (r, c, _R, C) => c >= r && c <= C - 1 - r },
  { name: 'diamond', rows: 4, present: (r, c, _R, C) => Math.abs(c - (C - 1) / 2) <= C / 2 - r },
  { name: 'weave', rows: 3, present: (r, c) => (c + r) % 3 !== 0 },
  { name: 'brickwork', rows: 4, present: (r, c) => (r % 2 === 0 ? c % 3 !== 2 : c % 3 !== 0) },
]

const DEFAULT_SETTINGS: BreakoutSettings = {
  ballSpeed: 'normal',
  paddleSize: 'normal',
  lives: 3,
  buffFrequency: 'normal',
}

// Parses brick breaker game settings from stored JSON.
function parseSettings(raw: string): BreakoutSettings {
  try {
    const p = JSON.parse(raw || '{}')
    return {
      ballSpeed: ['slow', 'normal', 'fast'].includes(p.ballSpeed) ? p.ballSpeed : DEFAULT_SETTINGS.ballSpeed,
      paddleSize: ['small', 'normal', 'wide'].includes(p.paddleSize) ? p.paddleSize : DEFAULT_SETTINGS.paddleSize,
      lives: typeof p.lives === 'number' ? p.lives : DEFAULT_SETTINGS.lives,
      buffFrequency: ['low', 'normal', 'high'].includes(p.buffFrequency) ? p.buffFrequency : DEFAULT_SETTINGS.buffFrequency,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  instructorId?: number
  studentGameData?: BreakoutStudentGameData
  onExit: () => void
}

// Brick breaker quiz game — smash the correct answer brick to advance.
export default function BreakoutGameQuiz({ instructorId, studentGameData, onExit }: Props) {
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
  const [settings, setSettings] = useState<BreakoutSettings>(
    isStudentMode ? parseSettings(studentGameData!.settings) : DEFAULT_SETTINGS
  )

  // ── Game state ──
  const [phase, setPhase] = useState<Phase>(isStudentMode ? 'loading' : 'setup')

  // How to Play modal (shown before each run; per-game disable synced to account).
  const howTo = useGameHowTo('breakout')
  const [howToOpen, setHowToOpen] = useState(false)
  const howToShownRef = useRef(false)

  useGameImmersiveMode(phase !== 'setup' && phase !== 'loading')
  const [questions, setQuestions] = useState<GamePlayQuestion[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)
  const [lives, setLives] = useState(DEFAULT_SETTINGS.lives)
  const [wrongCount, setWrongCount] = useState(0)
  const [questionsCleared, setQuestionsCleared] = useState(0)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [finalSecs, setFinalSecs] = useState(0)
  const [flashType, setFlashType] = useState<'correct' | 'wrong' | 'miss' | null>(null)
  const [bricksView, setBricksView] = useState<Brick[]>([])
  const [buffFlash, setBuffFlash] = useState<string | null>(null)
  const [failReason, setFailReason] = useState<'wrong' | 'miss'>('miss')
  // Options in the order they appear on screen this level (answers are shuffled).
  const [levelOptions, setLevelOptions] = useState<GamePlayQuestion['options']>([])

  // ── Refs (game loop) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  // Multiple balls live at once once the multiball buff is collected.
  const ballsRef = useRef<Ball[]>([{ x: CANVAS_W / 2, y: PADDLE_Y - BALL_R - 2, vx: 0, vy: 0, real: true }])
  const particlesRef = useRef<Particle[]>([])
  const paddleRef = useRef({ x: CANVAS_W / 2, w: PADDLE_W[DEFAULT_SETTINGS.paddleSize] })
  const bricksRef = useRef<Brick[]>([])
  // Locks answer resolution so several balls can't burn multiple lives in one frame.
  const levelResolvedRef = useRef(false)
  const buffFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const launchedRef = useRef(false)
  const phaseRef = useRef<Phase>(phase)
  const livesRef = useRef(DEFAULT_SETTINGS.lives)
  const settingsRef = useRef<BreakoutSettings>(settings)
  const questionIdxRef = useRef(0)
  const questionsRef = useRef<GamePlayQuestion[]>([])
  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false })
  const timerStartRef = useRef<number | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { livesRef.current = lives }, [lives])
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { questionIdxRef.current = questionIdx }, [questionIdx])
  useEffect(() => { questionsRef.current = questions }, [questions])

  // ── Load quiz list (instructor setup) ──
  useEffect(() => {
    if (isStudentMode || !instructorId) return
    setListLoading(true)
    fetch(`${API_BASE_URL}/api/quizzes/instructor/${instructorId}`)
      .then((r) => r.json())
      .then((d) => { setQuizList(d.quizzes || []); setListError(null) })
      .catch(() => setListError('Failed to load your quizzes.'))
      .finally(() => setListLoading(false))
  }, [instructorId, isStudentMode])

  // ── Student mode: auto-load ──
  useEffect(() => {
    if (isStudentMode && studentGameData) {
      void loadQuestions(studentGameData.quizId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudentMode])

  // Auto-open the How to Play modal once per run while the ball waits on the
  // paddle (covers instructor test play and student play).
  useEffect(() => {
    if (phase === 'ready' && howTo.loaded && !howToShownRef.current) {
      howToShownRef.current = true
      if (!howTo.disabled) setHowToOpen(true)
    }
  }, [phase, howTo.loaded, howTo.disabled])

  const flash = useCallback((type: 'correct' | 'wrong' | 'miss') => {
    setFlashType(type)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashType(null), 420)
  }, [])

  // Emits a small burst of particles at (x, y) for a satisfying smash effect.
  function spawnParticles(x: number, y: number, color: string, count = 8) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2
      const spd = 60 + Math.random() * 140
      particlesRef.current.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.5 + Math.random() * 0.3,
        color,
      })
    }
    // Keep the particle pool bounded so it never affects performance.
    if (particlesRef.current.length > 160) {
      particlesRef.current.splice(0, particlesRef.current.length - 160)
    }
  }

  // Brief on-screen announcement when a power-up is collected.
  function showBuffFlash(msg: string) {
    setBuffFlash(msg)
    if (buffFlashTimeoutRef.current) clearTimeout(buffFlashTimeoutRef.current)
    buffFlashTimeoutRef.current = setTimeout(() => setBuffFlash(null), 1100)
  }

  function clearTimers() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    lastTsRef.current = null
  }

  function beginTimer() {
    if (!timerStartRef.current) timerStartRef.current = Date.now()
    if (timerIntervalRef.current) return
    timerIntervalRef.current = setInterval(() => {
      if (timerStartRef.current && phaseRef.current === 'playing') {
        setElapsedSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
      }
    }, 250)
  }

  // Builds a level as a fine grid wall of 4 layers. The TOP layer holds the answer
  // bricks (shuffled positions), each flanked by shields and capped by 3 shield rows
  // below — so the answer sits protected inside the wall. Shields are black (1 hit)
  // or red (2 hits); the red ratio rises with difficulty. One random shield hides a
  // multiball buff.
  function buildLevel(q: GamePlayQuestion, difficulty: number, buffFrequency: BreakoutSettings['buffFrequency']): { bricks: Brick[]; shuffledOptions: GamePlayQuestion['options'] } {
    const shuffledOptions = shuffle(q.options)
    const n = shuffledOptions.length
    const totalW = CANVAS_W - WALL_SIDE * 2
    const cols = WALL_COLS
    const cellW = totalW / cols
    const redChance = Math.min(0.6, 0.28 + difficulty * 0.05)

    // Spread the n answers across the columns so each is separated by shields.
    const answerColForIndex: number[] = []
    for (let i = 0; i < n; i++) {
      answerColForIndex.push(Math.min(cols - 1, Math.floor(((i + 0.5) / n) * cols)))
    }
    const colToAnswer = new Map<number, number>()
    answerColForIndex.forEach((c, i) => colToAnswer.set(c, i))

    const makeShield = (x: number, y: number, w: number, h: number): Brick => {
      const red = Math.random() < redChance
      return {
        x, y, w, h,
        kind: red ? 'shieldRed' : 'shieldBlack',
        hp: red ? 2 : 1,
        maxHp: red ? 2 : 1,
        broken: false,
        buff: null,
      }
    }

    const bricks: Brick[] = []
    const shieldRefs: Brick[] = []

    // ── Layer 1: answers + filler shields (same height row) ──
    for (let c = 0; c < cols; c++) {
      const x = WALL_SIDE + c * cellW + BRICK_INSET
      const w = cellW - BRICK_INSET * 2
      if (colToAnswer.has(c)) {
        const ai = colToAnswer.get(c)!
        const o = shuffledOptions[ai]
        bricks.push({
          x, y: WALL_TOP, w, h: ANSWER_H,
          kind: 'answer', hp: 1, maxHp: 1, broken: false, buff: null,
          label: OPTION_LABELS[ai] ?? String(ai + 1),
          optionText: o.option_text,
          isCorrect: o.is_correct,
          color: BRICK_COLORS[ai % BRICK_COLORS.length],
        })
      } else {
        const s = makeShield(x, WALL_TOP, w, ANSWER_H)
        bricks.push(s); shieldRefs.push(s)
      }
    }

    // ── Layers below: a randomly chosen shaped wall (different every question) ──
    const pattern = WALL_PATTERNS[Math.floor(Math.random() * WALL_PATTERNS.length)]
    const rows = Math.min(SHIELD_LAYERS_MAX, pattern.rows)
    let y = WALL_TOP + ANSWER_H + LAYER_GAP
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Keep the cell directly under each answer filled so answers stay guarded.
        const guard = r === 0 && colToAnswer.has(c)
        if (!guard && !pattern.present(r, c, rows, cols)) continue
        const x = WALL_SIDE + c * cellW + BRICK_INSET
        const w = cellW - BRICK_INSET * 2
        const s = makeShield(x, y, w, SHIELD_H)
        bricks.push(s); shieldRefs.push(s)
      }
      y += SHIELD_H + LAYER_GAP
    }

    // Hide multiball buffs in several random shields so the buff appears often
    // and the player can blast through the wall quickly (keeps runs short).
    if (shieldRefs.length > 0) {
      const { ratio, min } = BUFF_FREQUENCY[buffFrequency] ?? BUFF_FREQUENCY.normal
      const buffCount = Math.min(
        shieldRefs.length,
        Math.max(min, Math.round(shieldRefs.length * ratio)),
      )
      const pick = shuffle(shieldRefs)
      for (let i = 0; i < buffCount; i++) pick[i].buff = 'multiball'
    }

    return { bricks, shuffledOptions }
  }

  function resetBallOnPaddle() {
    const p = paddleRef.current
    ballsRef.current = [{ x: p.x, y: PADDLE_Y - BALL_R - 2, vx: 0, vy: 0, real: true }]
    launchedRef.current = false
    // Re-arm answer resolution for the retry (same level isn't rebuilt on a miss).
    levelResolvedRef.current = false
  }

  function setupLevel(idx: number, qs: GamePlayQuestion[], cfg: BreakoutSettings) {
    const q = qs[idx]
    if (!q) return
    const { bricks, shuffledOptions } = buildLevel(q, idx, cfg.buffFrequency)
    bricksRef.current = bricks
    setBricksView(bricks)
    setLevelOptions(shuffledOptions)
    particlesRef.current = []
    levelResolvedRef.current = false
    paddleRef.current = { x: CANVAS_W / 2, w: PADDLE_W[cfg.paddleSize] }
    resetBallOnPaddle()
    setQuestionIdx(idx)
    questionIdxRef.current = idx
    setPhase('ready')
    phaseRef.current = 'ready'
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
        setListError('This quiz has no playable questions. Use multiple-choice (2-4 options) or true/false questions with a valid answer.')
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
    howToShownRef.current = false // new run → allow the How to Play modal again
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
    setupLevel(0, playable, cfg)
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
    clearTimers()
    startRun(playable)
  }

  function launchBall() {
    if (launchedRef.current) return
    const cfg = settingsRef.current
    const speed = BALL_SPEED[cfg.ballSpeed]
    // Launch upward with slight random horizontal angle
    const angle = (-Math.PI / 2) + (Math.random() * 0.5 - 0.25)
    const ball = ballsRef.current[0]
    if (ball) {
      ball.vx = Math.cos(angle) * speed
      ball.vy = Math.sin(angle) * speed
    }
    launchedRef.current = true
    setPhase('playing')
    phaseRef.current = 'playing'
    beginTimer()
  }

  // The level is failed when every ball is lost (or a wrong answer is smashed). The
  // SAME question is restarted from scratch — the protective wall is rebuilt — unless
  // the player runs out of lives, which ends the run.
  function failLevel(reason: 'wrong' | 'miss') {
    flash(reason)
    clearTimers()
    if (reason === 'wrong') setWrongCount((w) => w + 1)
    setFailReason(reason)

    if (livesRef.current !== LIVES_UNLIMITED) {
      const next = livesRef.current - 1
      livesRef.current = next
      setLives(next)
      if (next <= 0) {
        endRun('game-over')
        return
      }
    }
    setPhase('level-failed')
    phaseRef.current = 'level-failed'
  }

  // Rebuilds and replays the current question (fresh wall + shuffled answers).
  function retrySameLevel() {
    beginTimer()
    setupLevel(questionIdxRef.current, questionsRef.current, settingsRef.current)
  }

  function endRun(result: 'game-over' | 'game-complete') {
    clearTimers()
    if (timerStartRef.current) {
      setFinalSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
    }
    setPhase(result)
    phaseRef.current = result
  }

  function answerCorrect() {
    flash('correct')
    const cleared = questionsCleared + 1
    setQuestionsCleared(cleared)
    const nextIdx = questionIdxRef.current + 1
    if (nextIdx >= questionsRef.current.length) {
      endRun('game-complete')
    } else {
      clearTimers()
      // brief level-complete pause
      setPhase('level-complete')
      phaseRef.current = 'level-complete'
    }
  }

  function continueNextLevel() {
    const nextIdx = questionIdxRef.current + 1
    beginTimer()
    setupLevel(nextIdx, questionsRef.current, settingsRef.current)
  }

  // ── Game loop ──
  useEffect(() => {
    if (phase !== 'playing') return
    const step = (ts: number) => {
      if (phaseRef.current !== 'playing') return
      if (lastTsRef.current == null) lastTsRef.current = ts
      let dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      if (dt > 0.05) dt = 0.05 // clamp to avoid tunneling on lag

      const cfg = settingsRef.current
      const speed = BALL_SPEED[cfg.ballSpeed]
      const paddle = paddleRef.current
      const balls = ballsRef.current

      // Keyboard paddle movement
      const paddleSpeed = 560
      if (keysRef.current.left) paddle.x -= paddleSpeed * dt
      if (keysRef.current.right) paddle.x += paddleSpeed * dt
      paddle.x = Math.max(paddle.w / 2, Math.min(CANVAS_W - paddle.w / 2, paddle.x))

      // Advance particles (visual only)
      const ps = particlesRef.current
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 320 * dt // gravity
        p.life -= dt
        if (p.life <= 0) ps.splice(i, 1)
      }

      // Update each ball (iterate backwards so we can splice lost balls safely)
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const ball = balls[bi]
        ball.x += ball.vx * dt
        ball.y += ball.vy * dt

        // Wall collisions
        if (ball.x - BALL_R <= 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) }
        if (ball.x + BALL_R >= CANVAS_W) { ball.x = CANVAS_W - BALL_R; ball.vx = -Math.abs(ball.vx) }
        if (ball.y - BALL_R <= 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) }

        // Paddle collision
        if (
          ball.vy > 0 &&
          ball.y + BALL_R >= PADDLE_Y &&
          ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 &&
          ball.x >= paddle.x - paddle.w / 2 &&
          ball.x <= paddle.x + paddle.w / 2
        ) {
          const rel = (ball.x - paddle.x) / (paddle.w / 2) // -1..1
          const bounceAngle = rel * (Math.PI / 3) // up to 60°
          ball.vx = Math.sin(bounceAngle) * speed
          ball.vy = -Math.abs(Math.cos(bounceAngle) * speed)
          ball.y = PADDLE_Y - BALL_R - 1
        }

        // Brick collisions — only the first hit brick per ball per frame
        for (const b of bricksRef.current) {
          if (b.broken) continue
          if (
            ball.x + BALL_R >= b.x &&
            ball.x - BALL_R <= b.x + b.w &&
            ball.y + BALL_R >= b.y &&
            ball.y - BALL_R <= b.y + b.h
          ) {
            // Bounce by smallest overlap axis
            const overlapX = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R))
            const overlapY = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R))
            if (overlapX < overlapY) ball.vx = -ball.vx
            else ball.vy = -ball.vy

            if (b.kind === 'answer') {
              // Only the real (white) ball can hit answers. Clone (green) balls
              // bounce off answer bricks without breaking or resolving them.
              if (!ball.real) break
              // Lock so multiple balls can't resolve the same level twice.
              if (levelResolvedRef.current) break
              levelResolvedRef.current = true
              b.broken = true
              spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color ?? '#fff', 16)
              setBricksView([...bricksRef.current])
              if (b.isCorrect) answerCorrect()
              else failLevel('wrong')
              return
            }

            // Shield brick — take a hit
            b.hp -= 1
            spawnParticles(ball.x, ball.y, b.kind === 'shieldRed' ? '#ef4444' : '#94a3b8', 6)
            if (b.hp <= 0) {
              b.broken = true
              if (b.buff === 'multiball') {
                const cx = b.x + b.w / 2
                const cy = b.y + b.h / 2
                const room = MAX_BALLS - balls.length
                const toSpawn = Math.min(MULTIBALL_SPAWN, Math.max(0, room))
                for (let k = 0; k < toSpawn; k++) {
                  // Fan the clone balls out so they spread across the wall.
                  const spread = (k - (toSpawn - 1) / 2) * 0.5
                  const ang = (-Math.PI / 2) + spread
                  balls.push({ x: cx, y: cy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, real: false })
                }
                spawnParticles(cx, cy, '#fde68a', 22)
                showBuffFlash('MULTIBALL!  ✦✦✦')
              }
            }
            break // one brick per ball per frame
          }
        }

        // This ball fell below the paddle
        if (ball.y - BALL_R > CANVAS_H) {
          if (ball.real) {
            // The real (white) ball is the important one — losing it fails the
            // level, even if green clone balls are still in play.
            failLevel('miss')
            return
          }
          // A green clone fell away — just remove it, no penalty, no game over.
          balls.splice(bi, 1)
        }
      }

      // Safety net: if somehow no balls remain, fail the level.
      if (balls.length === 0) {
        failLevel('miss')
        return
      }

      draw()
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      lastTsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Draw static frame when ready/paused
  useEffect(() => {
    if (phase === 'ready' || phase === 'paused' || phase === 'playing') draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bricksView])

  // Fit-to-screen: scale the canvas so the WHOLE gameplay screen (header, question,
  // board, legend, controls) fits the viewport with no scrolling — tuned for phones
  // like the iPhone 12. The internal resolution stays 760×500 (physics unchanged);
  // only the CSS display size is scaled, and never above 1× so desktop is untouched.
  useLayoutEffect(() => {
    const isGameplay = phase === 'ready' || phase === 'playing' || phase === 'paused' ||
      phase === 'level-complete' || phase === 'level-failed' ||
      phase === 'game-over' || phase === 'game-complete'
    if (!isGameplay) return
    const fit = () => {
      const canvas = canvasRef.current
      const page = pageRef.current
      const wrap = canvasWrapRef.current
      if (!canvas || !page || !wrap) return
      // "Chrome" = the whole page height minus the canvas (independent of canvas
      // size, so this converges in a single pass).
      const chrome = page.scrollHeight - canvas.offsetHeight
      const pageTop = page.getBoundingClientRect().top
      const bottomSafe = 10
      const availH = window.innerHeight - pageTop - bottomSafe - chrome
      const availW = wrap.clientWidth
      const scale = Math.min(availW / CANVAS_W, availH / CANVAS_H, 1)
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
      const nextW = Math.floor(CANVAS_W * safeScale)
      const nextH = Math.floor(CANVAS_H * safeScale)
      // Only write when it actually changes (prevents ResizeObserver feedback loops).
      if (Math.abs(canvas.offsetWidth - nextW) > 1 || Math.abs(canvas.offsetHeight - nextH) > 1) {
        canvas.style.width = `${nextW}px`
        canvas.style.height = `${nextH}px`
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (pageRef.current) ro.observe(pageRef.current)
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
      window.removeEventListener('orientationchange', fit)
    }
  }, [phase, questionIdx, levelOptions])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    grad.addColorStop(0, '#0b1026')
    grad.addColorStop(1, '#0a0a1f')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Subtle grid
    ctx.strokeStyle = 'rgba(120,140,220,0.05)'
    ctx.lineWidth = 1
    for (let x = 0; x < CANVAS_W; x += 38) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke()
    }

    // Bricks
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const b of bricksRef.current) {
      if (b.broken) continue

      if (b.kind === 'answer') {
        const color = b.color ?? '#22d3ee'
        paintGlossyBrick(ctx, b.x, b.y, b.w, b.h, 7, color, 16)
        ctx.fillStyle = 'rgba(8,10,24,0.92)'
        ctx.font = 'bold 16px Georgia, serif'
        ctx.fillText(b.label ?? '', b.x + b.w / 2, b.y + b.h / 2 + 0.5)
        continue
      }

      // Shield brick (black = 1 hit, red = 2 hits)
      const isRed = b.kind === 'shieldRed'
      const top = isRed ? (b.hp >= 2 ? '#f0596a' : '#ef9aa3') : '#3a4357'
      const bottom = isRed ? (b.hp >= 2 ? '#b01726' : '#cf3b48') : '#1a2030'
      paintGlossyBrick(ctx, b.x, b.y, b.w, b.h, 3, [top, bottom], isRed ? 6 : 0)

      // Damage crack on a red brick that's been hit once
      if (isRed && b.hp < b.maxHp) {
        ctx.strokeStyle = 'rgba(10,10,20,0.55)'
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.moveTo(b.x + b.w * 0.32, b.y + 2)
        ctx.lineTo(b.x + b.w * 0.5, b.y + b.h - 3)
        ctx.lineTo(b.x + b.w * 0.66, b.y + 2)
        ctx.stroke()
      }
      // Faint sparkle hint on the brick that hides the buff
      if (b.buff) {
        ctx.fillStyle = 'rgba(253,224,138,0.7)'
        ctx.font = 'bold 10px Georgia, serif'
        ctx.fillText('✦', b.x + b.w / 2, b.y + b.h / 2 + 0.5)
      }
    }

    // Particles
    for (const p of particlesRef.current) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2))
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Paddle — glossy capsule
    const paddle = paddleRef.current
    const px = paddle.x - paddle.w / 2
    const pgrad = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H)
    pgrad.addColorStop(0, '#ffffff')
    pgrad.addColorStop(0.5, '#dbe7f5')
    pgrad.addColorStop(1, '#9fb6d4')
    ctx.shadowColor = '#38bdf8'
    ctx.shadowBlur = 18
    ctx.fillStyle = pgrad
    roundRect(ctx, px, PADDLE_Y, paddle.w, PADDLE_H, PADDLE_H / 2)
    ctx.fill()
    ctx.shadowBlur = 0
    // glossy top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    roundRect(ctx, px + 6, PADDLE_Y + 2, paddle.w - 12, PADDLE_H * 0.4, PADDLE_H * 0.2)
    ctx.fill()

    // Balls — glossy with highlight. The real ball is white (the important one);
    // clone balls from the multiball buff are green so they're easy to tell apart.
    for (const ball of ballsRef.current) {
      const bgrad = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R)
      if (ball.real) {
        bgrad.addColorStop(0, '#ffffff')
        bgrad.addColorStop(0.5, '#f1f5f9')
        bgrad.addColorStop(1, '#cbd5e1')
      } else {
        bgrad.addColorStop(0, '#f0fdf4')
        bgrad.addColorStop(0.5, '#4ade80')
        bgrad.addColorStop(1, '#16a34a')
      }
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
      ctx.fillStyle = bgrad
      ctx.shadowColor = ball.real ? '#e2e8f0' : '#22c55e'
      ctx.shadowBlur = ball.real ? 16 : 14
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  // Paints a brick with a vertical gradient and bevelled edges for a glossy,
  // hand-crafted look. `fill` is a single colour (auto-shaded) or [top, bottom].
  function paintGlossyBrick(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
    fill: string | [string, string],
    glowBlur = 0,
  ) {
    const [top, bottom] = Array.isArray(fill) ? fill : [shade(fill, 26), shade(fill, -22)]
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    if (glowBlur > 0) { ctx.shadowColor = Array.isArray(fill) ? fill[1] : fill; ctx.shadowBlur = glowBlur }
    ctx.fillStyle = g
    roundRect(ctx, x, y, w, h, r)
    ctx.fill()
    ctx.shadowBlur = 0
    // Top inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + r, y + 0.9)
    ctx.lineTo(x + w - r, y + 0.9)
    ctx.stroke()
    // Bottom inner shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.moveTo(x + r, y + h - 0.9)
    ctx.lineTo(x + w - r, y + h - 0.9)
    ctx.stroke()
  }

  // Lightens (amount > 0) or darkens (amount < 0) a #rrggbb hex colour.
  function shade(hex: string, amount: number): string {
    const m = hex.replace('#', '')
    const num = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16)
    const clamp = (v: number) => Math.max(0, Math.min(255, v))
    const r = clamp(((num >> 16) & 0xff) + amount)
    const g = clamp(((num >> 8) & 0xff) + amount)
    const b = clamp((num & 0xff) + amount)
    return `rgb(${r}, ${g}, ${b})`
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // ── Input handlers ──
  function paddleFromClientX(clientX: number) {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'ready') return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const x = (clientX - rect.left) * scaleX
    const p = paddleRef.current
    p.x = Math.max(p.w / 2, Math.min(CANVAS_W - p.w / 2, x))
    if (!launchedRef.current && ballsRef.current[0]) {
      ballsRef.current[0].x = p.x
      draw()
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    paddleFromClientX(e.clientX)
  }

  function handleCanvasTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const touch = e.touches[0]
    if (touch) paddleFromClientX(touch.clientX)
  }

  function handleCanvasTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (phaseRef.current === 'ready') {
      e.preventDefault()
      launchBall()
      return
    }
    const touch = e.touches[0]
    if (touch) paddleFromClientX(touch.clientX)
  }

  function handleCanvasClick() {
    if (phaseRef.current === 'ready') launchBall()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keysRef.current.left = true
      if (e.key === 'ArrowRight' || e.key === 'd') keysRef.current.right = true
      if (e.key === ' ' && phaseRef.current === 'ready') { e.preventDefault(); launchBall() }
      if ((e.key === 'p' || e.key === 'Escape') && phaseRef.current === 'playing') pauseGame()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keysRef.current.left = false
      if (e.key === 'ArrowRight' || e.key === 'd') keysRef.current.right = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    clearTimers()
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    if (buffFlashTimeoutRef.current) clearTimeout(buffFlashTimeoutRef.current)
  }, [])

  function pauseGame() {
    clearTimers()
    setPhase('paused')
    phaseRef.current = 'paused'
  }
  function resumeGame() {
    setPhase('playing')
    phaseRef.current = 'playing'
    beginTimer()
  }

  function quitToSetupOrExit() {
    clearTimers()
    if (isStudentMode) onExit()
    else { setPhase('setup'); phaseRef.current = 'setup' }
  }

  // ── Save (instructor) ──
  function openSaveDialog() {
    const sel = quizList.find((q) => q.id === Number(selectedQuizId))
    setSaveTitle(sel ? `${sel.title}: Brick Breaker` : '')
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
        ghost_enabled: false,
        game_type: 'breakout',
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

  // ─── Render: student load error ───
  if (phase === 'setup' && isStudentMode) {
    return (
      <div className="panel-page breakout-game-quiz__page--error">
        <div className="panel-alert panel-alert-error breakout-game-quiz__alert-max">
          {listError || 'Unable to load this game.'}
        </div>
        <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>Back to Courses</button>
      </div>
    )
  }

  // ─── Render: instructor setup ───
  if (phase === 'setup' && !isStudentMode) {
    const selQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    const playableCount = selQuiz ? countPlayableQuestions(selQuiz.questions) : 0

    return (
      <div className="panel-page breakout-game-quiz__page--relative">
        {saveDialogOpen && (
          <div className="breakout-game-quiz__modal-backdrop">
            <div className="breakout-game-quiz__modal">
              <h2 className="breakout-game-quiz__modal-title">Save to Library</h2>
              <p className="panel-meta breakout-game-quiz__modal-meta">Saved games can be published to your classes from Manage Class.</p>
              <div className="panel-form-group">
                <label className="panel-label">Game Title *</label>
                <input className="panel-input" value={saveTitle} onChange={(e) => setSaveTitle(e.target.value)} placeholder="Give your game a name" maxLength={120} />
              </div>
              <div className="panel-form-group">
                <label className="panel-label">Description (optional)</label>
                <textarea className="panel-textarea" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} placeholder="Describe this game for students" rows={2} />
              </div>
              <div className="breakout-game-quiz__modal-summary">
                <p className="panel-meta breakout-game-quiz__modal-summary-text">
                  Quiz: <strong className="breakout-game-quiz__modal-summary-accent">{selQuiz?.title}</strong>
                  {' · '}Speed: <strong className="breakout-game-quiz__modal-summary-accent">{settings.ballSpeed}</strong>
                  {' · '}Paddle: <strong className="breakout-game-quiz__modal-summary-accent">{settings.paddleSize}</strong>
                  {' · '}Buff: <strong className="breakout-game-quiz__modal-summary-accent">{settings.buffFrequency}</strong>
                </p>
              </div>
              <div className="panel-row breakout-game-quiz__modal-actions">
                <button className="panel-btn panel-btn-success breakout-game-quiz__modal-btn" onClick={handleSaveGame} disabled={!saveTitle.trim() || saveLoading}>
                  {saveLoading ? 'Saving…' : 'Save Game'}
                </button>
                <button className="panel-btn panel-btn-secondary breakout-game-quiz__modal-btn" onClick={() => setSaveDialogOpen(false)} disabled={saveLoading}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="panel-top-row">
          <div className="panel-hero breakout-game-quiz__hero">
            <p className="panel-kicker">Instructor · Content Maker</p>
            <h1>Brick Breaker</h1>
            <p>Turn any quiz into an arcade brick breaker. Bounce the ball into the correct answer brick to advance.</p>
          </div>
          <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>Back to Studio</button>
        </div>

        {listError && <div className="panel-alert panel-alert-error">{listError}</div>}

        <div className="panel-card">
          <h3 className="panel-section-title">1. Choose a Quiz</h3>
          <p className="panel-meta breakout-game-quiz__section-meta">Supports multiple-choice (2-4 options) and true/false questions.</p>
          {listLoading ? (
            <PanelSkeleton variant="list" count={3} />
          ) : quizList.length === 0 ? (
            <PanelEmptyState
              icon="quiz"
              title="No Quizzes Found"
              description="Create quizzes in My Classes first, then return here."
            />
          ) : (
            <div className={`panel-form-group ${selQuiz ? 'breakout-game-quiz__form-group--quiz-selected' : 'breakout-game-quiz__form-group--no-quiz'}`}>
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
            <div className="breakout-game-quiz__quiz-preview">
              <p className="breakout-game-quiz__quiz-preview-title">{selQuiz.title}</p>
              {selQuiz.description && <p className="panel-meta breakout-game-quiz__quiz-preview-desc">{selQuiz.description}</p>}
              <div className="breakout-game-quiz__quiz-preview-stats">
                <span className="panel-meta">{playableCount} playable question{playableCount !== 1 ? 's' : ''}</span>
                <span className="panel-meta">→ {playableCount} brick level{playableCount !== 1 ? 's' : ''}</span>
                {selQuiz.class_title && <span className="panel-meta">Class: {selQuiz.class_title}</span>}
              </div>
              {playableCount === 0 && (
                <p className="panel-meta breakout-game-quiz__quiz-preview-error">Add multiple-choice (2-4 options) or true/false questions to use this quiz.</p>
              )}
            </div>
          )}
        </div>

        <div className="panel-card">
          <h3 className="panel-section-title">2. Game Settings</h3>
          <div className="panel-grid breakout-game-quiz__settings-grid">
            <div className="panel-form-group breakout-game-quiz__form-group--compact">
              <label className="panel-label">Ball Speed</label>
              <select className="panel-select" value={settings.ballSpeed} onChange={(e) => setSettings((s) => ({ ...s, ballSpeed: e.target.value as BreakoutSettings['ballSpeed'] }))}>
                <option value="slow">Slow (Relaxed)</option>
                <option value="normal">Normal (Balanced)</option>
                <option value="fast">Fast (Challenging)</option>
              </select>
            </div>
            <div className="panel-form-group breakout-game-quiz__form-group--compact">
              <label className="panel-label">Paddle Size</label>
              <select className="panel-select" value={settings.paddleSize} onChange={(e) => setSettings((s) => ({ ...s, paddleSize: e.target.value as BreakoutSettings['paddleSize'] }))}>
                <option value="small">Small (Hard)</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide (Easy)</option>
              </select>
            </div>
            <div className="panel-form-group breakout-game-quiz__form-group--compact">
              <label className="panel-label">Lives</label>
              <select className="panel-select" value={settings.lives} onChange={(e) => setSettings((s) => ({ ...s, lives: Number(e.target.value) }))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'life' : 'lives'}</option>)}
                <option value={LIVES_UNLIMITED}>Unlimited</option>
              </select>
            </div>
            <div className="panel-form-group breakout-game-quiz__form-group--compact">
              <label className="panel-label">Multiball Buff</label>
              <select className="panel-select" value={settings.buffFrequency} onChange={(e) => setSettings((s) => ({ ...s, buffFrequency: e.target.value as BreakoutSettings['buffFrequency'] }))}>
                <option value="low">Rare (Longer game)</option>
                <option value="normal">Normal (Balanced)</option>
                <option value="high">Frequent (Shorter game)</option>
              </select>
            </div>
          </div>
          <p className="panel-meta breakout-game-quiz__section-meta">Multiball Buff controls how many hidden buffs are tucked into the wall. More buffs release extra green helper balls, so students clear each wall faster.</p>
        </div>

        <div className="panel-row breakout-game-quiz__actions">
          <button className="panel-btn breakout-game-quiz__test-btn" onClick={startGame} disabled={!selectedQuizId || playableCount === 0}>
            ▶ Test Play
          </button>
          <button className="panel-btn panel-btn-success" onClick={openSaveDialog} disabled={!selectedQuizId || playableCount === 0}>
            💾 Save to Library
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return <div className="panel-page"><PanelSkeleton variant="hero" /></div>
  }

  // ─── Render: gameplay ───
  const livesDisplay = lives === LIVES_UNLIMITED ? '∞' : '❤'.repeat(Math.max(0, lives))
  const flashColor = flashType === 'correct' ? 'rgba(34,197,94,0.18)' : flashType === 'wrong' ? 'rgba(239,68,68,0.2)' : flashType === 'miss' ? 'rgba(249,115,22,0.18)' : 'transparent'

  const breakoutHowToSteps: HowToStep[] = [
    { icon: '🕹️', text: <>Move the paddle with your <strong>mouse</strong> or <strong>finger</strong> (drag across the canvas).</> },
    { icon: '🚀', text: <>Click, tap, or press <strong>Space</strong> to launch the ball.</> },
    { icon: '🧱', text: <>Break the shield bricks: <strong>⬛ 1 hit</strong>, <strong>🟥 2 hits</strong>.</> },
    { icon: '🎯', text: <>Hit the brick with the <strong>correct answer</strong> to clear the question.</> },
    { icon: '✦', text: <>Some bricks hide a <strong>multiball</strong> buff. The extra balls only break bricks.</> },
    { icon: '❤️', text: <>Don&apos;t let every ball fall, or you lose a life. Run out of lives and it&apos;s game over.</> },
    { icon: '⏸️', text: <>Tap <strong>Pause</strong> anytime to take a break.</> },
  ]

  return (
    <div ref={pageRef} className="panel-page breakout-game-quiz__page--gameplay">
      <div className="breakout-game-quiz__header">
        <div>
          <p className="panel-kicker breakout-game-quiz__header-kicker">{isStudentMode ? 'Brick Breaker' : 'Brick Breaker · Test Play'}</p>
          <h2 className="breakout-game-quiz__header-title">{studentGameData?.title || 'Brick Breaker'}</h2>
        </div>
        <div className="breakout-game-quiz__header-stats">
          <span className="breakout-game-quiz__lives">{livesDisplay}</span>
          <span className="breakout-game-quiz__stat">Q {Math.min(questionIdx + 1, totalQ)}/{totalQ}</span>
          <span className="breakout-game-quiz__stat">⏱ {elapsedSecs}s</span>
          <button className="panel-btn panel-btn-secondary breakout-game-quiz__exit-btn-sm" onClick={quitToSetupOrExit}>Exit</button>
        </div>
      </div>

      {currentQ && (
        <div className="breakout-game-quiz__question-box">
          <p className="breakout-game-quiz__question-text">{currentQ.question_text}</p>
        </div>
      )}

      <div ref={canvasWrapRef} className="breakout-game-quiz__canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          className="breakout-game-quiz__canvas"
        />

        {flashType && (
          <div className="breakout-game-quiz__flash-overlay" style={{ background: flashColor }} />
        )}

        {buffFlash && (
          <div className="breakout-game-quiz__buff-flash" aria-hidden="true">{buffFlash}</div>
        )}

        {phase === 'ready' && (
          <div className="breakout-game-quiz__overlay">
            <div className="breakout-game-quiz__overlay-inner">
              <p className="breakout-game-quiz__overlay-hint">Smash the shields to reach the answers!</p>
              <p className="breakout-game-quiz__overlay-sub breakout-game-quiz__overlay-rules">⬛ 1 hit · 🟥 2 hits · ✦ hides a multiball</p>
              <p className="breakout-game-quiz__overlay-sub">⚪ White ball hits answers · 🟢 Green balls only smash shields (safe to drop)</p>
              <p className="breakout-game-quiz__overlay-sub game-controls-hint--desktop">Move with mouse or ← → · Click or Space to launch</p>
              <p className="breakout-game-quiz__overlay-sub game-controls-hint--mobile">Drag on the game area to aim · Tap to launch</p>
              <button className="panel-btn breakout-game-quiz__launch-btn" onClick={launchBall}>▶ Launch Ball</button>
            </div>
          </div>
        )}

        {phase === 'paused' && (
          <div className="breakout-game-quiz__overlay">
            <div className="breakout-game-quiz__overlay-inner">
              <p className="breakout-game-quiz__overlay-title">Paused</p>
              <div className="breakout-game-quiz__overlay-actions">
                <button className="panel-btn breakout-game-quiz__launch-btn" onClick={resumeGame}>Resume</button>
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>Quit</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'level-complete' && (
          <div className="breakout-game-quiz__overlay">
            <div className="breakout-game-quiz__overlay-inner">
              <p className="breakout-game-quiz__overlay-icon">✅</p>
              <p className="breakout-game-quiz__overlay-success">Correct!</p>
              <p className="breakout-game-quiz__overlay-sub">{questionsCleared} of {totalQ} cleared</p>
              <button className="panel-btn breakout-game-quiz__launch-btn" onClick={continueNextLevel}>Next Question →</button>
            </div>
          </div>
        )}

        {phase === 'level-failed' && (
          <div className="breakout-game-quiz__overlay">
            <div className="breakout-game-quiz__overlay-inner">
              <p className="breakout-game-quiz__overlay-icon">{failReason === 'wrong' ? '❌' : '💧'}</p>
              <p className="breakout-game-quiz__overlay-fail">Level Failed</p>
              <p className="breakout-game-quiz__overlay-sub">
                {failReason === 'wrong' ? 'That was the wrong answer.' : 'Your white ball dropped into the void.'}
                {lives !== LIVES_UNLIMITED && <> {' · '}{lives} {lives === 1 ? 'life' : 'lives'} left</>}
              </p>
              <div className="breakout-game-quiz__overlay-actions">
                <button className="panel-btn breakout-game-quiz__launch-btn" onClick={retrySameLevel}>↻ Retry Question</button>
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>Quit</button>
              </div>
            </div>
          </div>
        )}

        {(phase === 'game-over' || phase === 'game-complete') && (
          <div className="breakout-game-quiz__overlay">
            <div className="breakout-game-quiz__overlay-inner breakout-game-quiz__overlay-inner--wide">
              <p className="breakout-game-quiz__overlay-icon--lg">{phase === 'game-complete' ? '🏆' : '💥'}</p>
              <p className={`breakout-game-quiz__overlay-result ${phase === 'game-complete' ? 'breakout-game-quiz__overlay-result--win' : 'breakout-game-quiz__overlay-result--lose'}`}>
                {phase === 'game-complete' ? 'You cleared the quiz!' : 'Game Over'}
              </p>
              <div className="breakout-game-quiz__overlay-stats">
                <span>Cleared: <strong className="breakout-game-quiz__overlay-stat-cleared">{questionsCleared}/{totalQ}</strong></span>
                <span>Wrong: <strong className="breakout-game-quiz__overlay-stat-wrong">{wrongCount}</strong></span>
                <span>Time: <strong className="breakout-game-quiz__overlay-stat-time">{finalSecs}s</strong></span>
              </div>
              <div className="breakout-game-quiz__overlay-actions">
                {!isStudentMode && <button className="panel-btn breakout-game-quiz__launch-btn" onClick={() => { const p = normalizeQuestionsForGame(quizList.find((q) => q.id === Number(selectedQuizId))?.questions || []); if (p.length) startRun(p) }}>↻ Play Again</button>}
                {isStudentMode && <button className="panel-btn breakout-game-quiz__launch-btn" onClick={() => { void loadQuestions(studentGameData!.quizId) }}>↻ Play Again</button>}
                <button className="panel-btn panel-btn-secondary" onClick={quitToSetupOrExit}>{isStudentMode ? 'Back to Courses' : 'Back to Setup'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {currentQ && (phase === 'ready' || phase === 'playing' || phase === 'paused' || phase === 'level-failed') && (
        <div className="breakout-game-quiz__legend">
          {levelOptions.map((o, i) => (
            <div key={i} className="breakout-game-quiz__legend-item">
              <span className="breakout-game-quiz__legend-badge" style={{ background: BRICK_COLORS[i % BRICK_COLORS.length] }}>{OPTION_LABELS[i]}</span>
              <span className="breakout-game-quiz__legend-text">{o.option_text}</span>
            </div>
          ))}
        </div>
      )}

      {phase === 'playing' && (
        <button className="panel-btn panel-btn-secondary breakout-game-quiz__pause-btn" onClick={pauseGame}>⏸ Pause</button>
      )}

      <GameHowToModal
        open={howToOpen}
        gameName="Brick Breaker"
        subtitle="Smash the shields and hit the correct answer brick."
        accent="#f97316"
        icon="🧱"
        steps={breakoutHowToSteps}
        primaryLabel="Let's Play!"
        onPrimary={() => setHowToOpen(false)}
        onClose={() => setHowToOpen(false)}
        dontShowAgain={howTo.disabled}
        onDontShowAgainChange={howTo.setDisabled}
      />
    </div>
  )
}
