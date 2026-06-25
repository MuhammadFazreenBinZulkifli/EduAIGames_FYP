import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import './App_CSS/SnakeGameQuiz_CSS.css'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useResponsiveCellSize } from '../hooks/useResponsiveCellSize'
import { useGameViewport } from '../hooks/useGameViewport'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import GameTouchControls, { type TouchDirection } from './GameTouchControls'
import QuizSearchSelect from './QuizSearchSelect'
import PanelSkeleton from './PanelSkeleton'
import PanelEmptyState from './PanelEmptyState'
import {
  countPlayableQuestions,
  normalizeQuestionsForGame,
  type GamePlayQuestion,
  type RawQuizQuestion,
} from '../utils/gameQuizUtils'

// ─── Types ─────────────────────────────────────────────────────────────────

interface Pos { r: number; c: number }
type Dir = [number, number] // [dr, dc]

interface QuizOption { id: number; option_text: string; is_correct: boolean }
interface QuizQuestion { id: number; question_text: string; options: QuizOption[] }

interface FruitCell {
  pos: Pos
  optionIndex: number  // 0=A 1=B 2=C 3=D (shuffled order per question)
  optionText: string
  isCorrect: boolean
}

export interface SnakeStudentGameData {
  gameId: number
  quizId: number
  gameType: 'snake'
  title: string
  description: string
  settings: string
}

interface SnakeSettings {
  gridSize: 'small' | 'medium' | 'large'
  speed: 'slow' | 'normal' | 'fast'
  difficulty: 'easy' | 'medium' | 'hard'
  hunterEnabled: boolean
  lives: number
}

type Phase =
  | 'setup'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'level-complete'
  | 'game-over'
  | 'game-complete'

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID_ROWS = 18
const GRID_COLS: Record<SnakeSettings['gridSize'], number> = { small: 24, medium: 30, large: 36 }

// ── Mobile (portrait) board dimensions ──
// On phones the desktop landscape board (18 rows × up to 36 cols) is wider than
// the screen, forcing horizontal scroll. In portrait we flip to a tall, narrow
// board so it fits the phone width and the controls stay reachable at the bottom.
// Desktop is completely unaffected — these are only used when isMobile is true.
const GRID_ROWS_MOBILE: Record<SnakeSettings['gridSize'], number> = { small: 14, medium: 16, large: 18 }
const GRID_COLS_MOBILE: Record<SnakeSettings['gridSize'], number> = { small: 11, medium: 13, large: 15 }

// Resolves the board dimensions for the current device orientation.
function getDims(cfg: SnakeSettings, mobile: boolean): { rows: number; cols: number } {
  return mobile
    ? { rows: GRID_ROWS_MOBILE[cfg.gridSize], cols: GRID_COLS_MOBILE[cfg.gridSize] }
    : { rows: GRID_ROWS, cols: GRID_COLS[cfg.gridSize] }
}
const LIVES_UNLIMITED = -1
const SPEED_MS: Record<SnakeSettings['speed'], number> = { slow: 240, normal: 170, fast: 110 }
const CELL_PX = 22
const GRID_GAP = 1
const GRID_PAD = 4
const SPEED_INCREMENT = 6
const MAX_PENALTY = 10
const OBSTACLE_BY_DIFFICULTY: Record<SnakeSettings['difficulty'], Record<SnakeSettings['gridSize'], number>> = {
  easy: { small: 10, medium: 14, large: 18 },
  medium: { small: 18, medium: 26, large: 34 },
  hard: { small: 28, medium: 40, large: 52 },
}
const HUNTER_DELAY_BY_DIFFICULTY: Record<SnakeSettings['difficulty'], number> = {
  easy: 15_000,
  medium: 10_000,
  hard: 7_000,
}
/** Hunter interval = player interval × this (1.5 = moves 50% slower than the snake). */
const HUNTER_SPEED_MULTIPLIER = 1.5
const FRUIT_COLORS = ['#10b981', '#ef4444', '#f97316', '#8b5cf6']
const FRUIT_LABELS = ['A', 'B', 'C', 'D']

const DEFAULT_SETTINGS: SnakeSettings = {
  gridSize: 'medium',
  speed: 'normal',
  difficulty: 'medium',
  hunterEnabled: false,
  lives: 3,
}

function getObstacleCount(cfg: SnakeSettings): number {
  return OBSTACLE_BY_DIFFICULTY[cfg.difficulty]?.[cfg.gridSize]
    ?? OBSTACLE_BY_DIFFICULTY.medium[cfg.gridSize]
}

function getHunterDelayMs(cfg: SnakeSettings): number {
  return HUNTER_DELAY_BY_DIFFICULTY[cfg.difficulty] ?? HUNTER_DELAY_BY_DIFFICULTY.medium
}

function getHunterTickMs(playerSpeedMs: number): number {
  return Math.round(playerSpeedMs * HUNTER_SPEED_MULTIPLIER)
}

function boardPixelSize(cols: number, cellPx = CELL_PX): number {
  return cols * cellPx + (cols - 1) * GRID_GAP + GRID_PAD * 2 + 4
}

function wrapPos(p: Pos, rows: number, cols: number): Pos {
  return {
    r: ((p.r % rows) + rows) % rows,
    c: ((p.c % cols) + cols) % cols,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function posKey(p: Pos) { return `${p.r},${p.c}` }
function samePos(a: Pos, b: Pos) { return a.r === b.r && a.c === b.c }

function generateObstacles(rows: number, cols: number, snake: Pos[], count: number): Set<string> {
  const blocked = new Set<string>()
  // Clear a breathing-room zone around the snake's head so the player isn't
  // boxed in at spawn — follows the real head so it's correct in any orientation.
  const head = snake[0] ?? { r: Math.floor(rows / 2), c: Math.floor(cols / 4) }
  for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
    blocked.add(posKey({ r: head.r + dr, c: head.c + dc }))
  }
  snake.forEach(p => blocked.add(posKey(p)))
  const obstacles = new Set<string>()
  let tries = 0
  while (obstacles.size < count && tries < 1500) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    const k = posKey({ r, c })
    if (!blocked.has(k)) { obstacles.add(k); blocked.add(k) }
    tries++
  }
  return obstacles
}

function placeFruits(rows: number, cols: number, snake: Pos[], obstacles: Set<string>, options: QuizOption[]): FruitCell[] {
  const occupied = new Set<string>([...obstacles])
  snake.forEach(p => occupied.add(posKey(p)))

  const indices = options.map((_, i) => i).sort(() => Math.random() - 0.5)
  const shuffled = indices.map(i => options[i])

  const fruits: FruitCell[] = []
  for (let oi = 0; oi < shuffled.length; oi++) {
    let placed = false
    let tries = 0
    while (!placed && tries < 600) {
      const r = Math.floor(Math.random() * rows)
      const c = Math.floor(Math.random() * cols)
      const k = posKey({ r, c })
      if (!occupied.has(k)) {
        occupied.add(k)
        fruits.push({ pos: { r, c }, optionIndex: oi, optionText: shuffled[oi].option_text, isCorrect: shuffled[oi].is_correct })
        placed = true
      }
      tries++
    }
  }
  return fruits
}

/**
 * BFS: returns the first step the hunter should take from `start` toward `target`.
 * `snakeBody` should contain only the body cells (NOT the head) so the target is reachable.
 */
function bfsHunter(start: Pos, target: Pos, rows: number, cols: number, obstacles: Set<string>, snakeBody: Set<string>): Pos {
  if (samePos(start, target)) return start
  const visited = new Set<string>([posKey(start)])
  const dirs: Dir[] = [[-1,0],[1,0],[0,-1],[0,1]]
  // Seed queue with start's immediate neighbours — each carries itself as the "first step"
  const queue: { pos: Pos; first: Pos }[] = []
  for (const [dr, dc] of dirs) {
    const np: Pos = { r: start.r + dr, c: start.c + dc }
    if (np.r < 0 || np.r >= rows || np.c < 0 || np.c >= cols) continue
    const k = posKey(np)
    if (visited.has(k) || obstacles.has(k) || snakeBody.has(k)) continue
    if (samePos(np, target)) return np   // adjacent — step right onto target
    visited.add(k)
    queue.push({ pos: np, first: np })
  }
  while (queue.length) {
    const { pos, first } = queue.shift()!
    for (const [dr, dc] of dirs) {
      const np: Pos = { r: pos.r + dr, c: pos.c + dc }
      if (np.r < 0 || np.r >= rows || np.c < 0 || np.c >= cols) continue
      const k = posKey(np)
      if (visited.has(k) || obstacles.has(k) || snakeBody.has(k)) continue
      if (samePos(np, target)) return first  // path found — take first step
      visited.add(k)
      queue.push({ pos: np, first })
    }
  }
  return start  // no path found — stay put
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// Parses saved snake game settings JSON with sensible defaults.
function parseSettings(raw: string | undefined): SnakeSettings {
  try {
    const parsed = JSON.parse(raw || '{}') as Partial<SnakeSettings> & { livesUnlimited?: boolean }
    let lives = parsed.lives ?? DEFAULT_SETTINGS.lives
    if (parsed.lives === LIVES_UNLIMITED || (parsed as { lives?: string }).lives === 'unlimited' || parsed.livesUnlimited) {
      lives = LIVES_UNLIMITED
    }
    const difficulty = parsed.difficulty && ['easy', 'medium', 'hard'].includes(parsed.difficulty)
      ? parsed.difficulty
      : DEFAULT_SETTINGS.difficulty
    return { ...DEFAULT_SETTINGS, ...parsed, lives, difficulty }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function isUnlimitedLives(lives: number): boolean {
  return lives === LIVES_UNLIMITED
}

/** Spawn hunter at a random empty cell that is at least `minDist` Manhattan distance from the player. */
function spawnHunterRandom(
  playerHead: Pos,
  rows: number,
  cols: number,
  obstacles: Set<string>,
  snakeSet: Set<string>,
  minDist = 8,
): Pos {
  const candidates: Pos[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = posKey({ r, c })
      if (obstacles.has(k) || snakeSet.has(k)) continue
      if (Math.abs(r - playerHead.r) + Math.abs(c - playerHead.c) >= minDist) {
        candidates.push({ r, c })
      }
    }
  }
  if (candidates.length === 0) {
    // fallback: any empty cell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = posKey({ r, c })
        if (!obstacles.has(k) && !snakeSet.has(k)) return { r, c }
      }
    }
    return { r: 0, c: cols - 1 }
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// Landscape (desktop): snake lies horizontally, head facing right.
// Portrait (mobile): snake stands vertically near the top, head facing down —
// this suits a tall, narrow board far better than a sideways snake.
function makeInitialSnake(rows: number, cols: number, mobile = false): Pos[] {
  if (mobile) {
    const r = Math.floor(rows / 4)
    const c = Math.floor(cols / 2)
    return [{ r, c }, { r: r - 1, c }, { r: r - 2, c }]
  }
  const r = Math.floor(rows / 2)
  const c = Math.floor(cols / 4)
  return [{ r, c }, { r, c: c - 1 }, { r, c: c - 2 }]
}

/** Initial movement direction: right on desktop, down in portrait. */
function initialDir(mobile = false): Dir {
  return mobile ? [1, 0] : [0, 1]
}

/** Extend the tail behind the snake (opposite of its facing direction). */
function extendSnakeTail(base: Pos[], extra: number, mobile = false): Pos[] {
  const result = [...base]
  for (let i = 0; i < extra; i++) {
    const tail = result[result.length - 1]
    // Behind = up in portrait (head faces down), left on desktop (head faces right).
    result.push(mobile ? { r: tail.r - 1, c: tail.c } : { r: tail.r, c: tail.c - 1 })
  }
  return result
}

interface LibraryQuiz {
  id: number
  title: string
  description?: string
  questions: RawQuizQuestion[]
  class_title?: string
}

function toSnakeQuestions(playable: GamePlayQuestion[]): QuizQuestion[] {
  return playable.map((q) => ({
    id: q.id,
    question_text: q.question_text,
    options: q.options.map((o) => ({
      id: o.option_order,
      option_text: o.option_text,
      is_correct: o.is_correct,
    })),
  }))
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  instructorId?: number
  studentGameData?: SnakeStudentGameData
  onExit: () => void
}

// Snake quiz game — eat correct answer fruits while avoiding wrong choices and obstacles.
export default function SnakeGameQuiz({ instructorId, studentGameData, onExit }: Props) {
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
  const [settings, setSettings] = useState<SnakeSettings>(
    isStudentMode ? parseSettings(studentGameData!.settings) : DEFAULT_SETTINGS
  )

  // ── Game state ──
  const [phase, setPhase] = useState<Phase>(isStudentMode ? 'loading' : 'setup')

  useGameImmersiveMode(phase !== 'setup' && phase !== 'loading')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [questionIdx, setQuestionIdx] = useState(0)

  const [snake, setSnake] = useState<Pos[]>([])
  const [fruits, setFruits] = useState<FruitCell[]>([])
  const [obstacles, setObstacles] = useState<Set<string>>(new Set())
  const [gridCols, setGridCols] = useState(GRID_COLS[DEFAULT_SETTINGS.gridSize])
  const [gridRows, setGridRows] = useState(GRID_ROWS)

  // Reactive viewport — drives the portrait reflow on phones (desktop untouched).
  const viewport = useGameViewport()
  const isMobile = viewport.isMobile
  // Desktop cell size: width-fit only (identical to the original behaviour).
  const desktopCellPx = useResponsiveCellSize(CELL_PX, gridCols)
  // Measured cell size for mobile (see the layout effect below). Null until measured.
  const [mobileCell, setMobileCell] = useState<number | null>(null)
  // On mobile, fit the board into the leftover space so the whole thing — question,
  // board and D-pad — sits on one screen (no scrolling). Falls back to a quick
  // width-based guess before the first measurement, and to the original on desktop.
  const cellPx = useMemo(() => {
    if (!isMobile) return desktopCellPx
    if (mobileCell !== null) return mobileCell
    return Math.max(8, Math.min(26, Math.floor((viewport.width - 24) / gridCols)))
  }, [isMobile, desktopCellPx, mobileCell, viewport.width, gridCols])

  const [awaitingFirstMove, setAwaitingFirstMove] = useState(true)

  const [lives, setLives] = useState(DEFAULT_SETTINGS.lives)
  const [penaltySegments, setPenaltySegments] = useState(0)  // max MAX_PENALTY
  const [wrongCount, setWrongCount] = useState(0)
  const [questionsCleared, setQuestionsCleared] = useState(0)
  const [speedMs, setSpeedMs] = useState(SPEED_MS[DEFAULT_SETTINGS.speed])

  const [hunter, setHunter] = useState<Pos | null>(null)
  const [hunterVisible, setHunterVisible] = useState(false)
  const [hunterCountdown, setHunterCountdown] = useState(0)
  const [hunterWaitingForMove, setHunterWaitingForMove] = useState(false)
  const [gameOverReason, setGameOverReason] = useState<'lives' | 'hunter'>('lives')

  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [finalSecs, setFinalSecs] = useState(0)
  const [flashType, setFlashType] = useState<'correct' | 'wrong' | 'hit' | null>(null)
  const [levelMsg, setLevelMsg] = useState('')

  // ── Refs (stable across interval callbacks) ──
  const snakeRef = useRef<Pos[]>([])
  const dirRef = useRef<Dir>([0, 1])
  const nextDirRef = useRef<Dir>([0, 1])
  const fruitsRef = useRef<FruitCell[]>([])
  const obstaclesRef = useRef<Set<string>>(new Set())
  const gridColsRef = useRef(GRID_COLS[DEFAULT_SETTINGS.gridSize])
  const gridRowsRef = useRef(GRID_ROWS)
  const isMobileRef = useRef(isMobile)
  const runStartedRef = useRef(false)
  // Refs for measuring how much vertical space the board may occupy on mobile.
  const boardWrapRef = useRef<HTMLDivElement>(null)
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const hunterAwaitingMoveRef = useRef(false)

  function setHunterAwaitingMove(val: boolean) {
    hunterAwaitingMoveRef.current = val
    setHunterWaitingForMove(val)
  }
  const hunterRef = useRef<Pos | null>(null)
  const hunterVisibleRef = useRef(false)
  const penaltyRef = useRef(0)
  const livesRef = useRef(DEFAULT_SETTINGS.lives)
  const questionIdxRef = useRef(0)
  const questionsRef = useRef<QuizQuestion[]>([])
  const phaseRef = useRef<Phase>('setup')
  const speedMsRef = useRef(SPEED_MS[DEFAULT_SETTINGS.speed])
  const settingsRef = useRef<SnakeSettings>(DEFAULT_SETTINGS)
  const wrongCountRef = useRef(0)
  const questionsClearedRef = useRef(0)

  const timerStartRef = useRef<number | null>(null)

  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hunterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hunterCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs in sync
  useEffect(() => { snakeRef.current = snake }, [snake])
  useEffect(() => { fruitsRef.current = fruits }, [fruits])
  useEffect(() => { obstaclesRef.current = obstacles }, [obstacles])
  useEffect(() => { hunterRef.current = hunter }, [hunter])
  useEffect(() => { hunterVisibleRef.current = hunterVisible }, [hunterVisible])
  useEffect(() => { penaltyRef.current = penaltySegments }, [penaltySegments])
  useEffect(() => { livesRef.current = lives }, [lives])
  useEffect(() => { questionIdxRef.current = questionIdx }, [questionIdx])
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { speedMsRef.current = speedMs }, [speedMs])
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { wrongCountRef.current = wrongCount }, [wrongCount])
  useEffect(() => { questionsClearedRef.current = questionsCleared }, [questionsCleared])
  useEffect(() => { isMobileRef.current = isMobile }, [isMobile])

  // Mobile "fit-to-one-screen": measure the height left over after the header,
  // HUD, question card and D-pad, then size the board cells so everything fits
  // within the viewport — no vertical or horizontal scrolling. Desktop is skipped.
  useLayoutEffect(() => {
    if (!isMobile) { setMobileCell(null); return }
    const measure = () => {
      const wrap = boardWrapRef.current
      const area = gridAreaRef.current
      if (!wrap || !area) return
      // "Chrome" = everything inside the playing screen except the board itself.
      // It's independent of the cell size, so the result converges in one pass.
      const chrome = wrap.scrollHeight - area.offsetHeight
      const top = wrap.getBoundingClientRect().top
      const bottomSafe = 12
      const availableForGrid = window.innerHeight - top - bottomSafe - chrome
      const rows = gridRowsRef.current
      const cols = gridColsRef.current
      const heightCell = Math.floor(
        (availableForGrid - GRID_PAD * 2 - (rows - 1) * GRID_GAP) / rows
      )
      const widthBudget = Math.min(wrap.clientWidth, window.innerWidth) - GRID_PAD * 2
      const widthCell = Math.floor((widthBudget - (cols - 1) * GRID_GAP) / cols)
      const next = Math.max(8, Math.min(26, widthCell, heightCell))
      setMobileCell((prev) => (prev !== null && Math.abs(prev - next) < 1 ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (boardWrapRef.current) ro.observe(boardWrapRef.current)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [isMobile, gridRows, gridCols, phase, questionIdx])

  const snakeIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    snake.forEach((p, i) => m.set(posKey(p), i))
    return m
  }, [snake])

  const fruitMap = useMemo(() => {
    const m = new Map<string, FruitCell>()
    fruits.forEach((f) => m.set(posKey(f.pos), f))
    return m
  }, [fruits])

  // ── Load quiz list for setup ──
  useEffect(() => {
    if (isStudentMode || !instructorId) return
    setListLoading(true)
    fetch(`${API_BASE_URL}/api/quizzes/instructor/${instructorId}`)
      .then((r) => r.json())
      .then((d) => {
        setQuizList(d.quizzes || [])
        setListError(null)
      })
      .catch(() => setListError('Failed to load your quizzes.'))
      .finally(() => setListLoading(false))
  }, [instructorId, isStudentMode])

  // ── Student mode: auto-load quiz ──
  useEffect(() => {
    if (isStudentMode && studentGameData) {
      loadQuestions(studentGameData.quizId)
    }
  }, [isStudentMode]) // eslint-disable-line

  function applyPlayableQuestions(playable: GamePlayQuestion[], cfg: SnakeSettings) {
    const qs = toSnakeQuestions(playable)
    setQuestions(qs)
    questionsRef.current = qs
    initLevel(0, qs, cfg)
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
        setListError(
          'This quiz has no playable questions. Use multiple-choice (2–4 options) or true/false questions with a valid answer.'
        )
        setPhase('setup')
        return
      }
      applyPlayableQuestions(playable, settingsRef.current)
    } catch {
      setListError('Failed to load quiz. Please try again.')
      setPhase('setup')
    }
  }

  function resetRunStats() {
    growPendingRef.current = 0
    penaltyRef.current = 0
    setPenaltySegments(0)
    wrongCountRef.current = 0
    setWrongCount(0)
    questionsClearedRef.current = 0
    setQuestionsCleared(0)
    questionIdxRef.current = 0
    setQuestionIdx(0)
    setElapsedSecs(0)
    timerStartRef.current = null
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    runStartedRef.current = false
    setAwaitingFirstMove(true)
  }

  function beginRunTimer() {
    if (!timerStartRef.current) timerStartRef.current = Date.now()
    if (timerIntervalRef.current) return
    timerIntervalRef.current = setInterval(() => {
      if (timerStartRef.current && phaseRef.current !== 'game-over' && phaseRef.current !== 'game-complete') {
        setElapsedSecs(Math.floor((Date.now() - timerStartRef.current) / 1000))
      }
    }, 1000)
  }

  function armHunterIfWaiting() {
    if (settingsRef.current.hunterEnabled && hunterAwaitingMoveRef.current) {
      setHunterAwaitingMove(false)
      startHunterCountdown()
    }
  }

  function beginRunOnFirstMove() {
    if (runStartedRef.current) return
    runStartedRef.current = true
    setAwaitingFirstMove(false)
    beginRunTimer()
    armHunterIfWaiting()
  }

  function resumeSnakeAfterRespawn() {
    if (runStartedRef.current) return
    runStartedRef.current = true
    setAwaitingFirstMove(false)
    beginRunTimer()
    armHunterIfWaiting()
  }

  function armHunterAfterNextMove() {
    stopHunter()
    setHunterAwaitingMove(true)
    setHunterCountdown(Math.ceil(getHunterDelayMs(settingsRef.current) / 1000))
  }

  function stopHunter() {
    if (hunterIntervalRef.current) { clearInterval(hunterIntervalRef.current); hunterIntervalRef.current = null }
    if (hunterCountdownRef.current) { clearInterval(hunterCountdownRef.current); hunterCountdownRef.current = null }
    hunterVisibleRef.current = false
    setHunterVisible(false)
  }

  function placeHunterFarFromPlayer() {
    const head = snakeRef.current[0]
    if (!head) return
    const snakeSet = new Set(snakeRef.current.map(posKey))
    const pos = spawnHunterRandom(head, gridRowsRef.current, gridColsRef.current, obstaclesRef.current, snakeSet)
    hunterRef.current = pos
    setHunter(pos)
  }

  function respawnSnakeKeepPenalty() {
    const cols = gridColsRef.current
    const mobile = isMobileRef.current
    const sp = makeInitialSnake(gridRowsRef.current, cols, mobile)
    const extended = extendSnakeTail(sp, penaltyRef.current, mobile)
    snakeRef.current = extended
    setSnake(extended)
    const d = initialDir(mobile)
    dirRef.current = d
    nextDirRef.current = d
  }

  function endGameNow(reason: 'lives' | 'hunter') {
    clearAllTimers()
    const elapsed = timerStartRef.current ? Math.floor((Date.now() - timerStartRef.current) / 1000) : 0
    setFinalSecs(elapsed)
    setGameOverReason(reason)
    setPhase('game-over')
    phaseRef.current = 'game-over'
  }

  // ── Initialise a level ──
  function initLevel(qIdx: number, qs: QuizQuestion[], cfg: SnakeSettings, opts?: { resetPenalty?: boolean }) {
    // Decide orientation now (portrait on phones, landscape on desktop).
    const mobile = isMobileRef.current
    const { rows, cols } = getDims(cfg, mobile)
    gridColsRef.current = cols
    setGridCols(cols)
    gridRowsRef.current = rows
    setGridRows(rows)

    if (opts?.resetPenalty !== false) {
      growPendingRef.current = 0
      penaltyRef.current = 0
      setPenaltySegments(0)
    }

    const sp = makeInitialSnake(rows, cols, mobile)
    snakeRef.current = sp
    setSnake(sp)

    const d: Dir = initialDir(mobile)
    dirRef.current = d
    nextDirRef.current = d

    // Scale obstacle count to the (smaller) portrait area so density stays fair.
    const baseObstacles = getObstacleCount(cfg)
    const obstacleCount = mobile
      ? Math.max(4, Math.round(baseObstacles * (rows * cols) / (GRID_ROWS * GRID_COLS[cfg.gridSize])))
      : baseObstacles
    const obs = generateObstacles(rows, cols, sp, obstacleCount)
    obstaclesRef.current = obs
    setObstacles(obs)

    const newFruits = placeFruits(rows, cols, sp, obs, qs[qIdx].options)
    fruitsRef.current = newFruits
    setFruits(newFruits)

    const hunterDelayMs = getHunterDelayMs(cfg)
    if (cfg.hunterEnabled) {
      const snakeSet = new Set(sp.map(posKey))
      const h = spawnHunterRandom(sp[0], rows, cols, obs, snakeSet)
      hunterRef.current = h
      setHunter(h)
      setHunterVisible(false)
      hunterVisibleRef.current = false
      setHunterCountdown(Math.ceil(hunterDelayMs / 1000))
      setHunterAwaitingMove(true)
    } else {
      setHunter(null)
      hunterRef.current = null
      setHunterVisible(false)
      setHunterAwaitingMove(false)
    }

    runStartedRef.current = false
    setAwaitingFirstMove(true)

    setPhase('playing')
    phaseRef.current = 'playing'
  }

  function stopTickInterval() {
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null }
  }

  function clearAllTimers() {
    stopTickInterval()
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    stopHunter()
    if (flashTimeoutRef.current) { clearTimeout(flashTimeoutRef.current); flashTimeoutRef.current = null }
  }

  const growPendingRef = useRef(0) // segments still to add

  const gameTick2 = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    if (!runStartedRef.current) return

    const sn = snakeRef.current
    if (sn.length === 0) return

    const nd = nextDirRef.current
    const cd = dirRef.current
    const isReverse = nd[0] === -cd[0] && nd[1] === -cd[1]
    const actualDir: Dir = isReverse ? cd : nd
    dirRef.current = actualDir

    const head = sn[0]
    const rawHead: Pos = { r: head.r + actualDir[0], c: head.c + actualDir[1] }
    const cols = gridColsRef.current
    const newHead = wrapPos(rawHead, gridRowsRef.current, cols)
    const newHeadKey = posKey(newHead)

    if (obstaclesRef.current.has(newHeadKey)) {
      handleHit('obstacle'); return
    }

    const selfKeys = new Set(sn.slice(0, sn.length > 1 ? -1 : 1).map(posKey))
    if (selfKeys.has(newHeadKey)) {
      handleHit('self'); return
    }

    if (hunterVisibleRef.current && hunterRef.current && samePos(newHead, hunterRef.current)) {
      handleHunterCatch(); return
    }

    // Fruit
    const hitFruit = fruitsRef.current.find(f => samePos(f.pos, newHead))
    if (hitFruit) {
      if (hitFruit.isCorrect) { handleCorrect(); return }
      handleWrongFruit(hitFruit)
      const grewSnake = [newHead, ...sn]
      snakeRef.current = grewSnake
      setSnake(grewSnake)
      return
    }

    if (growPendingRef.current > 0) {
      growPendingRef.current -= 1
      const grewSnake = [newHead, ...sn]
      snakeRef.current = grewSnake
      setSnake(grewSnake)
    } else {
      const movedSnake = [newHead, ...sn.slice(0, -1)]
      snakeRef.current = movedSnake
      setSnake(movedSnake)
    }
  }, [])

  function repositionAllFruits() {
    const cols = gridColsRef.current
    const sn = snakeRef.current
    const qIdx = questionIdxRef.current
    const qs = questionsRef.current
    if (!qs[qIdx]) return
    const newFruits = placeFruits(gridRowsRef.current, cols, sn, obstaclesRef.current, qs[qIdx].options)
    fruitsRef.current = newFruits
    setFruits(newFruits)
  }

  function handleHit(_type: 'obstacle' | 'self') {
    const newPenalty = Math.min(penaltyRef.current + 1, MAX_PENALTY)
    penaltyRef.current = newPenalty
    setPenaltySegments(newPenalty)

    triggerFlash('hit')

    if (!isUnlimitedLives(livesRef.current)) {
      const newLives = livesRef.current - 1
      livesRef.current = newLives
      setLives(newLives)
      if (newLives <= 0) {
        endGameNow('lives')
        return
      }
    }

    repositionAllFruits()
    respawnSnakeKeepPenalty()
    runStartedRef.current = false
    setAwaitingFirstMove(true)
    if (settingsRef.current.hunterEnabled) {
      armHunterAfterNextMove()
      placeHunterFarFromPlayer()
    }
  }

  function handleHunterCatch() {
    triggerFlash('hit')

    if (!isUnlimitedLives(livesRef.current)) {
      endGameNow('hunter')
      return
    }

    respawnSnakeKeepPenalty()
    placeHunterFarFromPlayer()
    armHunterAfterNextMove()
  }

  function handleWrongFruit(fruit: FruitCell) {
    const newWrong = wrongCountRef.current + 1
    wrongCountRef.current = newWrong
    setWrongCount(newWrong)

    const newPenalty = Math.min(penaltyRef.current + 2, MAX_PENALTY)
    penaltyRef.current = newPenalty
    setPenaltySegments(newPenalty)
    growPendingRef.current += 2

    triggerFlash('wrong')

    // Respawn wrong fruit at new position
    const cols = gridColsRef.current
    const sn = snakeRef.current
    const occupied = new Set<string>([...obstaclesRef.current, ...sn.map(posKey)])
    fruitsRef.current.filter(f => f !== fruit).forEach(f => occupied.add(posKey(f.pos)))

    let placed = false; let tries = 0
    while (!placed && tries < 600) {
      const r = Math.floor(Math.random() * gridRowsRef.current)
      const c = Math.floor(Math.random() * cols)
      if (!occupied.has(posKey({ r, c }))) {
        const newFruits = fruitsRef.current.map(f =>
          f === fruit ? { ...f, pos: { r, c } } : f
        )
        fruitsRef.current = newFruits
        setFruits(newFruits)
        placed = true
      }
      tries++
    }
  }

  function handleCorrect() {
    stopTickInterval()
    stopHunter()
    triggerFlash('correct')

    const clearedCount = questionsClearedRef.current + 1
    questionsClearedRef.current = clearedCount
    setQuestionsCleared(clearedCount)

    const nextIdx = questionIdxRef.current + 1
    questionIdxRef.current = nextIdx

    if (nextIdx >= questionsRef.current.length) {
      clearAllTimers()
      const elapsed = timerStartRef.current ? Math.floor((Date.now() - timerStartRef.current) / 1000) : elapsedSecs
      setFinalSecs(elapsed)
      setPhase('game-complete')
      phaseRef.current = 'game-complete'
      return
    }

    setQuestionIdx(nextIdx)
    const newSpeed = Math.max(60, speedMsRef.current - SPEED_INCREMENT)
    speedMsRef.current = newSpeed
    setSpeedMs(newSpeed)

    setLevelMsg(`Question ${nextIdx + 1}/${questionsRef.current.length}: Ready!`)
    setPhase('level-complete')
    phaseRef.current = 'level-complete'
  }

  function triggerFlash(type: 'correct' | 'wrong' | 'hit') {
    setFlashType(type)
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setFlashType(null), 600)
  }

  function startHunterCountdown() {
    let count = Math.ceil(getHunterDelayMs(settingsRef.current) / 1000)
    setHunterCountdown(count)
    if (hunterCountdownRef.current) clearInterval(hunterCountdownRef.current)
    hunterCountdownRef.current = setInterval(() => {
      count -= 1
      setHunterCountdown(count)
      if (count <= 0) {
        if (hunterCountdownRef.current) clearInterval(hunterCountdownRef.current)
        hunterCountdownRef.current = null
        hunterVisibleRef.current = true
        setHunterVisible(true)
        // hunter movement is started by the dedicated hunterVisible+phase effect
      }
    }, 1000)
  }

  function hunterStepOnce() {
    const h = hunterRef.current
    const sn = snakeRef.current
    if (!h || sn.length === 0) return
    // Pass only body cells (slice(1)) — NOT the head — so the BFS can actually reach the target
    const snakeBody = new Set(sn.slice(1).map(posKey))
    const next = bfsHunter(h, sn[0], gridRowsRef.current, gridColsRef.current, obstaclesRef.current, snakeBody)
    hunterRef.current = next
    setHunter(next)
    if (samePos(next, sn[0])) handleHunterCatch()
  }

  // ── Game tick interval (snake movement only) ──
  useEffect(() => {
    if (phase === 'playing') {
      stopTickInterval()
      tickIntervalRef.current = setInterval(gameTick2, speedMs)
      return () => stopTickInterval()
    }
    stopTickInterval()
  }, [phase, speedMs, gameTick2])

  // ── Hunter movement — one orthogonal step per tick, 50% slower than snake ──
  useEffect(() => {
    if (hunterVisible && phase === 'playing') {
      if (hunterIntervalRef.current) clearInterval(hunterIntervalRef.current)
      const tickMs = getHunterTickMs(speedMs)
      hunterStepOnce()
      hunterIntervalRef.current = setInterval(() => {
        if (phaseRef.current !== 'playing') return
        hunterStepOnce()
      }, tickMs)
      return () => {
        if (hunterIntervalRef.current) {
          clearInterval(hunterIntervalRef.current)
          hunterIntervalRef.current = null
        }
      }
    }
    if (hunterIntervalRef.current) {
      clearInterval(hunterIntervalRef.current)
      hunterIntervalRef.current = null
    }
  }, [hunterVisible, phase, speedMs]) // eslint-disable-line

  // ── Direction input (keyboard + touch) ──
  const applyDirection = useCallback((dir: Dir) => {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'paused') return
    if (phaseRef.current === 'paused') setPhase('playing')
    if (phaseRef.current === 'playing' && !runStartedRef.current) {
      if (timerStartRef.current) resumeSnakeAfterRespawn()
      else beginRunOnFirstMove()
    } else if (
      phaseRef.current === 'playing'
      && settingsRef.current.hunterEnabled
      && hunterAwaitingMoveRef.current
    ) {
      setHunterAwaitingMove(false)
      startHunterCountdown()
    }
    nextDirRef.current = dir
  }, [beginRunOnFirstMove, resumeSnakeAfterRespawn, startHunterCountdown])

  const handleTouchPause = useCallback(() => {
    if (phase === 'playing') setPhase('paused')
    else if (phase === 'paused') setPhase('playing')
  }, [phase])

  const handleTouchDirection = useCallback((touchDir: TouchDirection) => {
    const map: Record<TouchDirection, Dir> = {
      up: [-1, 0],
      down: [1, 0],
      left: [0, -1],
      right: [0, 1],
    }
    applyDirection(map[touchDir])
  }, [applyDirection])

  // ── Keyboard input ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key
      if (key === 'Escape' || key === 'p' || key === 'P') {
        handleTouchPause()
        return
      }
      const map: Record<string, Dir> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
        W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
      }
      if (map[key] && (phase === 'playing' || phase === 'paused')) {
        e.preventDefault()
        applyDirection(map[key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, applyDirection, handleTouchPause])

  // ── Next level continue ──
  function continueNextLevel() {
    const q = questionsRef.current
    const idx = questionIdxRef.current
    initLevel(idx, q, settingsRef.current, { resetPenalty: true })
  }

  function openSaveDialog() {
    const sel = quizList.find((q) => q.id === Number(selectedQuizId))
    setSaveTitle(sel ? `${sel.title}: Snake Quest` : '')
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
        ghost_enabled: settings.hunterEnabled,
        game_type: 'snake',
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

  function startGame() {
    if (!selectedQuizId) return
    const libQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    if (!libQuiz) return
    const playable = normalizeQuestionsForGame(libQuiz.questions)
    if (playable.length === 0) {
      setListError(
        'This quiz has no playable questions. Use multiple-choice (2–4 options) or true/false questions.'
      )
      return
    }
    clearAllTimers()
    resetRunStats()
    setLives(settings.lives === LIVES_UNLIMITED ? LIVES_UNLIMITED : (settings.lives || 3))
    livesRef.current = settings.lives === LIVES_UNLIMITED ? LIVES_UNLIMITED : (settings.lives || 3)
    setSpeedMs(SPEED_MS[settings.speed])
    speedMsRef.current = SPEED_MS[settings.speed]
    settingsRef.current = settings
    applyPlayableQuestions(playable, settings)
  }

  // ── Render helpers ──
  function renderCell(
    r: number,
    c: number,
    sMap: Map<string, number>,
    fMap: Map<string, FruitCell>,
  ) {
    const k = posKey({ r, c })
    const bodyIdx = sMap.get(k) ?? -1
    const isHead = bodyIdx === 0
    const isBody = bodyIdx > 0
    const isObstacle = obstacles.has(k)
    const fruit = fMap.get(k)
    const isHunter = hunterVisible && hunter && hunter.r === r && hunter.c === c

    let bg = '#0c1a0f'
    let content: string | null = null
    let contentColor = '#fff'
    let fontSize = '10px'
    let fontWeight = '800'
    let borderRadius = '3px'
    let boxShadow = 'none'
    let border = 'none'
    let zIdx = 0

    if (isObstacle) {
      bg = '#1e293b'
      content = '▪'
      contentColor = '#475569'
      fontSize = '14px'
    } else if (isHead) {
      bg = '#4ade80'
      content = '▶'
      contentColor = '#052e16'
      fontSize = '12px'
      borderRadius = '5px'
      boxShadow = '0 0 8px #4ade8088'
      zIdx = 10
    } else if (isBody) {
      const fade = Math.max(0.25, 1 - bodyIdx * 0.06)
      bg = `rgba(22,163,74,${fade})`
      borderRadius = '3px'
      zIdx = 5
    } else if (fruit) {
      bg = FRUIT_COLORS[fruit.optionIndex % FRUIT_COLORS.length]
      content = FRUIT_LABELS[fruit.optionIndex]
      contentColor = '#fff'
      borderRadius = '50%'
      boxShadow = `0 0 6px ${FRUIT_COLORS[fruit.optionIndex % FRUIT_COLORS.length]}88`
      zIdx = 8
    } else if (isHunter) {
      bg = '#c026d3'
      content = '👾'
      fontSize = '13px'
      borderRadius = '50%'
      boxShadow = '0 0 10px #c026d3aa'
      zIdx = 9
    }

    return (
      <div
        key={`${r}-${c}`}
        className="snake-game-quiz__cell"
        style={{
          width: cellPx,
          height: cellPx,
          background: bg,
          borderRadius,
          boxShadow,
          border,
          zIndex: zIdx,
          transition: isHead ? 'background 0.1s' : undefined,
        }}
      >
        {content && (
          <span
            className="snake-game-quiz__cell-content"
            style={{ fontSize, fontWeight, color: contentColor }}
          >
            {content}
          </span>
        )}
      </div>
    )
  }

  const currentQ = questions[questionIdx]

  if (phase === 'setup' && isStudentMode) {
    return (
      <div className="panel-page snake-game-quiz__page--error">
        <div className="panel-alert panel-alert-error snake-game-quiz__alert-max">
          {listError || 'Unable to load this game.'}
        </div>
        <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>
          Back to Courses
        </button>
      </div>
    )
  }

  // ─── Setup screen (instructor) ───────────────────────────────────────────
  if (phase === 'setup' && !isStudentMode) {
    const selQuiz = quizList.find((q) => q.id === Number(selectedQuizId))
    const playableCount = selQuiz ? countPlayableQuestions(selQuiz.questions) : 0

    return (
      <div className="panel-page snake-game-quiz__page--relative">
        {saveDialogOpen && (
          <div className="snake-game-quiz__modal-backdrop">
            <div className="snake-game-quiz__modal">
              <h2 className="snake-game-quiz__modal-title">Save to Library</h2>
              <p className="panel-meta snake-game-quiz__modal-meta">
                Saved games can be published to your classes from Manage Class.
              </p>
              <div className="panel-form-group">
                <label className="panel-label">Game Title *</label>
                <input
                  className="panel-input"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Give your game a name"
                  maxLength={120}
                />
              </div>
              <div className="panel-form-group">
                <label className="panel-label">Description (optional)</label>
                <textarea
                  className="panel-textarea"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="Describe this game for students"
                  rows={2}
                />
              </div>
              <div className="snake-game-quiz__modal-summary">
                <p className="panel-meta snake-game-quiz__modal-summary-text">
                  Quiz: <strong className="snake-game-quiz__modal-summary-quiz">{selQuiz?.title}</strong>
                  {' · '}Difficulty: <strong className="snake-game-quiz__modal-summary-setting">{settings.difficulty}</strong>
                  {' · '}Hunter: <strong className={settings.hunterEnabled ? 'snake-game-quiz__modal-summary-hunter--on' : 'snake-game-quiz__modal-summary-hunter--off'}>
                    {settings.hunterEnabled ? 'Enabled' : 'Disabled'}
                  </strong>
                </p>
              </div>
              <div className="panel-row snake-game-quiz__modal-actions">
                <button
                  className="panel-btn panel-btn-success snake-game-quiz__modal-btn"
                  onClick={handleSaveGame}
                  disabled={!saveTitle.trim() || saveLoading}
                >
                  {saveLoading ? 'Saving…' : 'Save Game'}
                </button>
                <button
                  className="panel-btn panel-btn-secondary snake-game-quiz__modal-btn"
                  onClick={() => setSaveDialogOpen(false)}
                  disabled={saveLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="panel-top-row">
          <div className="panel-hero snake-game-quiz__hero">
            <p className="panel-kicker">Instructor · Content Maker</p>
            <h1>Snake Quest</h1>
            <p>Turn any quiz into a Knowledge Snake game. Eat the correct answer fruit to move on.</p>
          </div>
          <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>
            Back to Studio
          </button>
        </div>

        {listError && <div className="panel-alert panel-alert-error">{listError}</div>}

        <div className="panel-card">
          <h3 className="panel-section-title">1. Choose a Quiz</h3>
          <p className="panel-meta snake-game-quiz__section-meta">
            Supports multiple-choice (2–4 options) and true/false questions.
          </p>
          {listLoading ? (
            <PanelSkeleton variant="list" count={3} />
          ) : quizList.length === 0 ? (
            <PanelEmptyState
              icon="quiz"
              title="No Quizzes Found"
              description="Create quizzes in My Classes first, then return here."
            />
          ) : (
            <div className={`panel-form-group ${selQuiz ? 'snake-game-quiz__form-group--quiz-selected' : 'snake-game-quiz__form-group--no-quiz'}`}>
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
            <div className="snake-game-quiz__quiz-preview">
              <p className="snake-game-quiz__quiz-preview-title">{selQuiz.title}</p>
              {selQuiz.description && <p className="panel-meta snake-game-quiz__quiz-preview-desc">{selQuiz.description}</p>}
              <div className="snake-game-quiz__quiz-preview-stats">
                <span className="panel-meta">{playableCount} playable question{playableCount !== 1 ? 's' : ''}</span>
                <span className="panel-meta">→ {playableCount} snake round{playableCount !== 1 ? 's' : ''}</span>
                {selQuiz.class_title && <span className="panel-meta">Class: {selQuiz.class_title}</span>}
              </div>
              {playableCount === 0 && (
                <p className="panel-meta snake-game-quiz__quiz-preview-error">
                  Add multiple-choice (2–4 options) or true/false questions to use this quiz.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="panel-card">
          <h3 className="panel-section-title">2. Game Settings</h3>
          <div className="panel-grid snake-game-quiz__settings-grid">
            <div className="panel-form-group snake-game-quiz__form-group--compact">
              <label className="panel-label">Grid Size</label>
              <select
                className="panel-select"
                value={settings.gridSize}
                onChange={(e) => setSettings((s) => ({ ...s, gridSize: e.target.value as SnakeSettings['gridSize'] }))}
              >
                <option value="small">Small (18×24)</option>
                <option value="medium">Medium (18×30)</option>
                <option value="large">Large (18×36)</option>
              </select>
            </div>
            <div className="panel-form-group snake-game-quiz__form-group--compact">
              <label className="panel-label">Difficulty</label>
              <select
                className="panel-select"
                value={settings.difficulty}
                onChange={(e) => setSettings((s) => ({ ...s, difficulty: e.target.value as SnakeSettings['difficulty'] }))}
              >
                <option value="easy">Easy (fewer obstacles, longer hunter delay)</option>
                <option value="medium">Medium (balanced challenge)</option>
                <option value="hard">Hard (many obstacles, shorter hunter delay)</option>
              </select>
            </div>
            <div className="panel-form-group snake-game-quiz__form-group--compact">
              <label className="panel-label">Initial Speed</label>
              <select
                className="panel-select"
                value={settings.speed}
                onChange={(e) => setSettings((s) => ({ ...s, speed: e.target.value as SnakeSettings['speed'] }))}
              >
                <option value="slow">Slow (Relaxed)</option>
                <option value="normal">Normal (Balanced)</option>
                <option value="fast">Fast (Challenging)</option>
              </select>
            </div>
            <div className="panel-form-group snake-game-quiz__form-group--compact">
              <label className="panel-label">Lives</label>
              <select
                className="panel-select"
                value={settings.lives}
                onChange={(e) => setSettings((s) => ({ ...s, lives: Number(e.target.value) }))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? 'life' : 'lives'}</option>
                ))}
                <option value={LIVES_UNLIMITED}>Unlimited</option>
              </select>
            </div>
          </div>
          <label className="snake-game-quiz__checkbox-label">
            <input
              type="checkbox"
              checked={settings.hunterEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, hunterEnabled: e.target.checked }))}
              className="snake-game-quiz__checkbox"
            />
            <div>
              <span className="snake-game-quiz__checkbox-title">Enable Hunter Enemy 👾</span>
              <p className="panel-meta snake-game-quiz__checkbox-desc">
                The hunter pathfinds toward you (up/down/left/right only) at 50% of your snake speed.
                Difficulty controls how soon it appears after you move.
                Caught with limited lives = instant game over. Unlimited lives = respawn and hunter resets.
              </p>
            </div>
          </label>
        </div>

        <div className="panel-card snake-game-quiz__howto-card">
          <h3 className="panel-section-title">How to Play</h3>
          <ul className="snake-game-quiz__howto-list">
            <li>Move with <strong className="snake-game-quiz__howto-strong-light">Arrow Keys</strong> or <strong className="snake-game-quiz__howto-strong-light">WASD</strong></li>
            <li>Read the question and eat the <strong className="snake-game-quiz__howto-strong-fruit">correct coloured fruit</strong> (A/B/C/D)</li>
            <li>Wrong fruit → tail grows by 2 (max +{MAX_PENALTY} penalty segments per round)</li>
            <li>Hit obstacle or yourself → respawn at start + longer tail (timer keeps running)</li>
            <li>Edges wrap around. You re-enter from the opposite side.</li>
            <li>Penalty tail length resets each new question</li>
            <li>Difficulty controls obstacle count and hunter spawn delay</li>
            {settings.hunterEnabled && <li><strong className="snake-game-quiz__howto-strong-hunter">👾 Hunter</strong> chases at half your speed. If it catches you, it is game over (unless lives are unlimited).</li>}
            <li>Press <strong className="snake-game-quiz__howto-strong-light">ESC</strong> to pause</li>
          </ul>
        </div>

        <div className="panel-row snake-game-quiz__actions">
          <button
            className="panel-btn panel-btn-success snake-game-quiz__action-btn"
            type="button"
            onClick={startGame}
            disabled={!selectedQuizId || listLoading || playableCount === 0}
          >
            ▶ Start Game
          </button>
          <button
            className="panel-btn panel-btn-secondary snake-game-quiz__action-btn"
            type="button"
            onClick={openSaveDialog}
            disabled={!selectedQuizId || listLoading || playableCount === 0}
          >
            💾 Save Game
          </button>
        </div>
      </div>
    )
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="panel-page">
        <PanelSkeleton variant="hero" />
      </div>
    )
  }

  // ─── Game Over ────────────────────────────────────────────────────────────
  if (phase === 'game-over') {
    return (
      <div className="panel-page snake-game-quiz__page--centered">
        <div className="panel-card snake-game-quiz__end-card">
          <div className="snake-game-quiz__end-icon">💀</div>
          <h2 className="snake-game-quiz__end-title--over">Game Over</h2>
          <p className="snake-game-quiz__end-subtitle">
            {gameOverReason === 'hunter'
              ? 'The hunter caught you! Instant elimination.'
              : 'You ran out of lives!'}
          </p>
          <div className="snake-game-quiz__stats-grid">
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">TIME SURVIVED</div>
              <div className="snake-game-quiz__stat-value">{formatTime(finalSecs)}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">QUESTIONS CLEARED</div>
              <div className="snake-game-quiz__stat-value--green">{questionsCleared}/{questions.length}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">WRONG ANSWERS</div>
              <div className="snake-game-quiz__stat-value--red">{wrongCount}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">TAIL PENALTY</div>
              <div className="snake-game-quiz__stat-value--orange">+{penaltySegments}</div>
            </div>
          </div>
          <div className="snake-game-quiz__end-actions">
            <button type="button" className="panel-btn snake-game-quiz__exit-btn" onClick={onExit}>
              ← Exit
            </button>
            {!isStudentMode && (
              <button className="panel-btn panel-btn-primary snake-game-quiz__retry-btn" onClick={startGame}>↺ Try Again</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Game Complete ────────────────────────────────────────────────────────
  if (phase === 'game-complete') {
    const score = Math.max(0, Math.round((questionsCleared / questions.length) * 1000 - wrongCount * 30 - Math.floor(finalSecs / 10) * 5))
    return (
      <div className="panel-page snake-game-quiz__page--centered">
        <div className="panel-card snake-game-quiz__end-card snake-game-quiz__end-card--wide">
          <div className="snake-game-quiz__end-icon">🏆</div>
          <h2 className="snake-game-quiz__end-title--complete">Quest Complete!</h2>
          <p className="snake-game-quiz__end-subtitle">All questions answered correctly!</p>

          <div className="snake-game-quiz__score-box">
            <div className="snake-game-quiz__score-label">FINAL SCORE</div>
            <div className="snake-game-quiz__score-value">{score}</div>
          </div>

          <div className="snake-game-quiz__stats-grid">
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">COMPLETION TIME</div>
              <div className="snake-game-quiz__stat-value">{formatTime(finalSecs)}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">QUESTIONS</div>
              <div className="snake-game-quiz__stat-value--green">{questionsCleared}/{questions.length}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">WRONG ANSWERS</div>
              <div className="snake-game-quiz__stat-value--red">{wrongCount}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card">
              <div className="snake-game-quiz__stat-label">TAIL PENALTIES</div>
              <div className="snake-game-quiz__stat-value--orange">+{penaltySegments}</div>
            </div>
          </div>

          <button className="panel-btn panel-btn-primary snake-game-quiz__full-width-btn" onClick={onExit}>← Back to Courses</button>
        </div>
      </div>
    )
  }

  // ─── Level Complete ───────────────────────────────────────────────────────
  if (phase === 'level-complete') {
    return (
      <div className="panel-page snake-game-quiz__page--centered">
        <div className="panel-card snake-game-quiz__end-card snake-game-quiz__end-card--level">
          <div className="snake-game-quiz__end-icon--level">✅</div>
          <h2 className="snake-game-quiz__end-title--level">Correct!</h2>
          <p className="snake-game-quiz__end-subtitle--level">{levelMsg}</p>
          <div className="snake-game-quiz__stats-grid snake-game-quiz__stats-grid--level">
            <div className="panel-card snake-game-quiz__stat-card--compact">
              <div className="snake-game-quiz__stat-label--sm">TIME</div>
              <div className="snake-game-quiz__stat-value--bold">{formatTime(elapsedSecs)}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card--compact">
              <div className="snake-game-quiz__stat-label--sm">WRONG</div>
              <div className="snake-game-quiz__stat-value--red snake-game-quiz__stat-value--bold">{wrongCount}</div>
            </div>
            <div className="panel-card snake-game-quiz__stat-card--compact">
              <div className="snake-game-quiz__stat-label--sm">PENALTY</div>
              <div className="snake-game-quiz__stat-value--orange snake-game-quiz__stat-value--bold">+{penaltySegments}</div>
            </div>
          </div>
          <button className="panel-btn panel-btn-primary snake-game-quiz__full-width-btn" onClick={continueNextLevel}>
            Continue →
          </button>
        </div>
      </div>
    )
  }

  // ─── Playing / Paused ─────────────────────────────────────────────────────
  const cols = gridCols
  const rows = gridRows
  const boardW = boardPixelSize(cols, cellPx)
  const gridInnerW = cols * cellPx + (cols - 1) * GRID_GAP
  const gridInnerH = rows * cellPx + (rows - 1) * GRID_GAP

  const cells: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(renderCell(r, c, snakeIndexMap, fruitMap))
    }
  }

  const flashBorder = flashType === 'correct'
    ? '3px solid #4ade80'
    : flashType === 'wrong'
    ? '3px solid #ef4444'
    : flashType === 'hit'
    ? '3px solid #f97316'
    : '2px solid rgba(52, 211, 153, 0.45)'

  const livesArr = isUnlimitedLives(settings.lives)
    ? null
    : Array.from({ length: settings.lives }, (_, i) => i < lives)

  return (
    <div className="panel-page snake-game-quiz__page--playing">
      <div
        ref={boardWrapRef}
        className={`snake-game-quiz__board-wrap${isMobile ? ' snake-game-quiz__board-wrap--mobile' : ''}`}
        style={{ width: isMobile ? '100%' : boardW, maxWidth: '100%' }}
      >
        {/* Header */}
        <div className="snake-game-quiz__header">
          <button type="button" className="snake-game-quiz__light-btn" onClick={() => { clearAllTimers(); onExit() }}>← Exit</button>
          <h2 className="snake-game-quiz__title">
            🐍 Snake Quest
          </h2>
          <button
            type="button"
            className="snake-game-quiz__light-btn"
            onClick={() => setPhase((p) => (p === 'paused' ? 'playing' : 'paused'))}
          >
            {phase === 'paused' ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>

        {/* HUD strip */}
        <div className="snake-game-quiz__hud">
          <div className="snake-game-quiz__hud-chip">
            Q <strong className="snake-game-quiz__hud-strong">{questionIdx + 1}</strong>/{questions.length}
          </div>
          <div className="snake-game-quiz__hud-chip">
            ⏱ <strong className="snake-game-quiz__hud-strong">{formatTime(elapsedSecs)}</strong>
          </div>
          <div className="snake-game-quiz__hud-chip">
            ✗ <strong className="snake-game-quiz__hud-wrong">{wrongCount}</strong>
          </div>
          <div className="snake-game-quiz__hud-chip">
            📏 <strong className="snake-game-quiz__hud-penalty">+{penaltySegments}</strong>
          </div>
          <div className="snake-game-quiz__hud-chip snake-game-quiz__hud-chip--lives">
            {isUnlimitedLives(settings.lives) ? (
              <span className="snake-game-quiz__hud-unlimited">♥ ∞ Unlimited</span>
            ) : (
              livesArr!.map((alive, i) => (
                <span key={i} className={alive ? 'snake-game-quiz__hud-heart--alive' : 'snake-game-quiz__hud-heart--dead'}>♥</span>
              ))
            )}
          </div>
          {settings.hunterEnabled && !hunterVisible && hunterCountdown > 0 && !awaitingFirstMove && !hunterWaitingForMove && (
            <div className="snake-game-quiz__hud-hunter">
              👾 in {hunterCountdown}s
            </div>
          )}
          {settings.hunterEnabled && hunterWaitingForMove && !awaitingFirstMove && (
            <div className="snake-game-quiz__hud-hunter-wait">
              👾 Move to re-activate hunter
            </div>
          )}
        </div>

        {/* Question card — same width as grid */}
        {currentQ && (
          <div className="snake-game-quiz__question-card">
            <div className="snake-game-quiz__question-label">
              Question {questionIdx + 1}
            </div>
            <div className="snake-game-quiz__question-text">{currentQ.question_text}</div>
            <div className="snake-game-quiz__options-grid">
              {fruits.map((f, i) => {
                const fruitColor = FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length]
                return (
                  <div
                    key={i}
                    className="snake-game-quiz__option-row"
                    style={{
                      background: `${fruitColor}18`,
                      border: `1px solid ${fruitColor}55`,
                    }}
                  >
                    <span
                      className="snake-game-quiz__option-badge"
                      style={{ background: fruitColor }}
                    >
                      {FRUIT_LABELS[f.optionIndex]}
                    </span>
                    <span className="snake-game-quiz__option-text">{f.optionText}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Game grid */}
        <div
          ref={gridAreaRef}
          className="snake-game-quiz__grid-area"
          style={
            isMobile
              ? { width: gridInnerW + GRID_PAD * 2, margin: '0 auto' }
              : { width: boardW }
          }
        >
          <div
            className="snake-game-quiz__grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${rows}, ${cellPx}px)`,
              width: gridInnerW + GRID_PAD * 2,
              height: gridInnerH + GRID_PAD * 2,
              border: flashBorder,
              boxShadow: flashType === 'correct'
                ? '0 0 20px rgba(74,222,128,0.4)'
                : flashType === 'hit'
                ? '0 0 20px rgba(249,115,22,0.4)'
                : '0 0 0 1px rgba(52,211,153,0.2), 0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            {cells}
          </div>

          {/* Awaiting first move */}
          {awaitingFirstMove && phase === 'playing' && (
            <div className="snake-game-quiz__await-overlay">
              <div className="snake-game-quiz__await-title game-controls-hint--desktop">Press Arrow Keys or WASD to start</div>
              <div className="snake-game-quiz__await-title game-controls-hint--mobile">Tap a direction on the pad below to start</div>
              <div className="snake-game-quiz__await-sub">Timer begins on your first move</div>
            </div>
          )}

          {/* Paused overlay */}
          {phase === 'paused' && (
            <div className="snake-game-quiz__pause-overlay">
              <div className="snake-game-quiz__pause-icon">⏸</div>
              <div className="snake-game-quiz__pause-label">Paused</div>
              <button type="button" className="snake-game-quiz__light-btn snake-game-quiz__light-btn--lg" onClick={() => setPhase('playing')}>
                ▶ Resume
              </button>
            </div>
          )}
        </div>

        <GameTouchControls
          onDirection={handleTouchDirection}
          onPause={handleTouchPause}
          showPause={phase === 'playing' || phase === 'paused'}
        />

        {/* Controls hint */}
        <div className="snake-game-quiz__controls-hint game-controls-hint--desktop">
          Arrow Keys / WASD to move · ESC to pause · Edges wrap around
        </div>
        <div className="snake-game-quiz__controls-hint game-controls-hint--mobile">
          Use the on-screen pad to move · Tap ⏸ to pause
        </div>
      </div>
    </div>
  )
}
