import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { CSSProperties } from 'react'
import './App_CSS/MazeGameQuiz_CSS.css'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useResponsiveCellSize } from '../hooks/useResponsiveCellSize'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import GameTouchControls, { type TouchDirection } from './GameTouchControls'
import PanelSkeleton from './PanelSkeleton'
import PanelEmptyState from './PanelEmptyState'
import QuizSearchSelect from './QuizSearchSelect'
import GameHowToModal, { type HowToStep } from './GameHowToModal'
import { useGameHowTo } from '../hooks/useUserPreferences'
import {
  countPlayableQuestions,
  getOptionsForQuestion,
  normalizeQuestionsForGame,
  type RawQuizQuestion,
} from '../utils/gameQuizUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuestionOption {
  option_text: string
  option_order: number
}

interface Question extends RawQuizQuestion {
  question_order: number
  explanation?: string
  options?: QuestionOption[]
}

interface LibraryQuiz {
  id: number
  title: string
  description: string
  questions: Question[]
  class_title?: string
}

interface Pos { r: number; c: number }

type Phase =
  | 'setup'
  | 'loading'
  | 'playing'
  | 'at-gate'
  | 'level-complete'
  | 'game-complete'
  | 'game-over'
  | 'paused'

interface LevelData {
  grid: number[][] // 0 = walkable, 1 = wall
  start: Pos
  exit: Pos
  gate: Pos
  gateOpen: boolean
}

// Student mode: pre-loaded game data passed from parent
export interface StudentGameData {
  gameId: number
  quizId: number
  title: string
  description: string
  ghostEnabled: boolean
  settings?: string
}

interface MazeSettings {
  fogEnabled: boolean
}

const DEFAULT_MAZE_SETTINGS: MazeSettings = { fogEnabled: true }

function parseMazeSettings(raw?: string): MazeSettings {
  if (!raw) return { ...DEFAULT_MAZE_SETTINGS }
  try {
    const parsed = JSON.parse(raw)
    return { fogEnabled: parsed?.fogEnabled !== false }
  } catch {
    return { ...DEFAULT_MAZE_SETTINGS }
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROWS = 29        // 2× the original 15 rows (must be odd)
const COLS = 29        // 2× the original 15 cols (must be odd)
const CELL_PX = 22
// Grid geometry — MUST match the CSS (.maze-game-quiz__grid border + padding + gap)
// so the overlay tokens and fog line up exactly with the rendered cells.
const GRID_GAP = 1
const GRID_EDGE = 5    // 2px border + 3px padding before the first cell
const GHOST_SPAWN_DELAY_MS = 10000
const GHOST_SPAWN_COUNTDOWN_SEC = 10
// Slower hunter for fairness (player moves one cell per keypress).
const GHOST_TICK_MS = 520
const GHOST_TICK_MIN_MS = 240
const GHOST_WRONG_SPEED_DELTA = 35
// Fairer AI: a portion of steps are random wandering instead of a perfect chase,
// and it re-locks onto the player only every few ticks (chases a stale position).
const GHOST_WANDER_CHANCE = 0.32
const GHOST_TARGET_REFRESH_TICKS = 3
// Torches the player can place to light the maze under fog (refilled each level).
const TORCH_BUDGET = 20

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  exitBg: 'rgba(250,204,21,0.22)',
  exitBorder: '#facc15',
  gateLockedBg: 'rgba(167,139,250,0.38)',
  gateLockedBorder: '#a78bfa',
  gateOpenBg: 'rgba(134,239,172,0.25)',
  gateOpenBorder: '#86efac',
}

// Curated per-level palettes. A small, deliberate set (cycled by level) keeps each
// maze feeling fresh and hand-designed rather than randomly generated.
interface MazeTheme {
  name: string
  wall: string
  path: string
  trail: string
  accent: string
  accentSoft: string
  fog: string
}

// Walls are kept dark; the walkable path is noticeably lighter so corridors read
// clearly inside the torchlight (high wall/path contrast was requested).
const MAZE_THEMES: MazeTheme[] = [
  { name: 'Ember',  wall: '#241510', path: '#52331a', trail: 'rgba(249,115,22,0.28)', accent: '#f97316', accentSoft: 'rgba(249,115,22,0.7)', fog: '#0a0503' },
  { name: 'Frost',  wall: '#0e1d2b', path: '#1d4663', trail: 'rgba(56,189,248,0.28)', accent: '#38bdf8', accentSoft: 'rgba(56,189,248,0.7)', fog: '#040b13' },
  { name: 'Moss',   wall: '#0e2417', path: '#1c4a2c', trail: 'rgba(74,222,128,0.28)', accent: '#4ade80', accentSoft: 'rgba(74,222,128,0.7)', fog: '#03110a' },
  { name: 'Void',   wall: '#150e2e', path: '#2e2150', trail: 'rgba(167,139,250,0.3)',  accent: '#a78bfa', accentSoft: 'rgba(167,139,250,0.7)', fog: '#06030f' },
]

// ─── Maze Generation (recursive-backtracking DFS) ─────────────────────────────

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Builds a solvable maze using randomized Prim's algorithm.
//
// Prim's produces a "low-river" maze: a shorter, less winding route to the goal
// and MANY short branching dead ends (fake paths / false turns) — instead of one
// long snaking corridor. That's exactly what makes the maze feel tricky and
// interesting rather than a single long path to the gate.
function generateMaze(rows: number, cols: number): number[][] {
  const g: number[][] = Array.from({ length: rows }, () => Array(cols).fill(1))
  const dirs: [number, number][] = [[0, 2], [0, -2], [2, 0], [-2, 0]]
  // Frontier holds candidate cells (2 away) plus the in-maze cell they branch from.
  const frontier: { r: number; c: number; fr: number; fc: number }[] = []

  const addFrontier = (r: number, c: number) => {
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && g[nr][nc] === 1) {
        frontier.push({ r: nr, c: nc, fr: r, fc: c })
      }
    }
  }

  g[1][1] = 0
  addFrontier(1, 1)
  while (frontier.length) {
    const idx = Math.floor(Math.random() * frontier.length)
    const { r, c, fr, fc } = frontier.splice(idx, 1)[0]
    if (g[r][c] !== 1) continue
    g[r][c] = 0
    g[(r + fr) / 2][(c + fc) / 2] = 0 // knock down the wall between the two cells
    addFrontier(r, c)
  }

  // Lengthen a portion of the (already plentiful) dead ends so the decoys are long
  // enough to be tempting. Bumped budget for a few extra false corridors.
  addExtraDeadEnds(g, rows, cols, Math.floor((rows * cols) / 22))
  return g
}

/** Extend existing dead-end corridors for a trickier maze (same grid size). */
function addExtraDeadEnds(g: number[][], rows: number, cols: number, target: number) {
  const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
  const ends: Pos[] = []
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (g[r][c] !== 0) continue
      const open = dirs.filter(([dr, dc]) => g[r + dr][c + dc] === 0)
      if (open.length === 1) ends.push({ r, c })
    }
  }
  shuffleArr(ends)
  let added = 0
  for (const { r, c } of ends) {
    if (added >= target) break
    for (const [dr, dc] of dirs) {
      if (g[r + dr][c + dc] !== 0) continue
      const er = r - dr
      const ec = c - dc
      if (er < 1 || er >= rows - 1 || ec < 1 || ec >= cols - 1) continue
      if (g[er][ec] !== 1) continue
      const e2r = er - dr
      const e2c = ec - dc
      if (e2r < 1 || e2r >= rows - 1 || e2c < 1 || e2c >= cols - 1) continue
      if (g[e2r][e2c] === 1) {
        g[er][ec] = 0
        added++
        break
      }
    }
  }
}

// ─── BFS Pathfinding ──────────────────────────────────────────────────────────

function bfsPath(grid: number[][], start: Pos, end: Pos): Pos[] {
  const rows = grid.length, cols = grid[0].length
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false))
  const prev: (Pos | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null))
  const queue: Pos[] = [{ ...start }]
  visited[start.r][start.c] = true

  outer: while (queue.length) {
    const cur = queue.shift()!
    if (cur.r === end.r && cur.c === end.c) break outer
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]] as [number,number][]) {
      const nr = cur.r + dr, nc = cur.c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && grid[nr][nc] === 0) {
        visited[nr][nc] = true
        prev[nr][nc] = cur
        queue.push({ r: nr, c: nc })
      }
    }
  }

  const path: Pos[] = []
  let cur: Pos | null = { ...end }
  while (cur) {
    path.unshift({ ...cur })
    cur = prev[cur.r][cur.c]
  }
  return path.length && path[0].r === start.r && path[0].c === start.c ? path : []
}

// Ghost takes one BFS step toward target; returns next position
function bfsStep(grid: number[][], from: Pos, to: Pos): Pos | null {
  const path = bfsPath(grid, from, to)
  return path.length >= 2 ? path[1] : null
}

function walkableNeighbours(grid: number[][], p: Pos): Pos[] {
  const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
  return dirs
    .map(([dr, dc]) => ({ r: p.r + dr, c: p.c + dc }))
    .filter((n) => grid[n.r]?.[n.c] === 0)
}

// Fairer hunter step: sometimes wanders to a random neighbour instead of taking
// the optimal chase step, so the player can shake it off at junctions.
function ghostNextStep(grid: number[][], from: Pos, target: Pos, wanderChance: number): Pos {
  if (Math.random() < wanderChance) {
    const ns = walkableNeighbours(grid, from)
    if (ns.length) return ns[Math.floor(Math.random() * ns.length)]
  }
  return bfsStep(grid, from, target) ?? from
}

// ─── Level builder ────────────────────────────────────────────────────────────

// Places start, exit, and a question gate along a valid maze path.
// Counts how many of a cell's 4 neighbours are walkable (3+ means a junction).
function openNeighbours(grid: number[][], p: Pos): number {
  const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
  return dirs.filter(([dr, dc]) => grid[p.r + dr]?.[p.c + dc] === 0).length
}

function buildLevel(): LevelData {
  const grid = generateMaze(ROWS, COLS)
  const start: Pos = { r: 1, c: 1 }
  const exit: Pos = { r: ROWS - 2, c: COLS - 2 }
  const path = bfsPath(grid, start, exit)

  // Place the gate ~40% along the solution (shorter run to it), then nudge it to a
  // nearby junction so the player arrives at a fork full of tempting wrong turns.
  let gateIdx = Math.floor(path.length * 0.4)
  gateIdx = Math.max(4, Math.min(gateIdx, path.length - 5))
  let gate = path[gateIdx] ?? path[Math.floor(path.length / 2)]
  for (let off = 0; off <= 3; off++) {
    const cand = path[gateIdx + off] ?? path[gateIdx - off]
    if (cand && openNeighbours(grid, cand) >= 3) { gate = cand; break }
  }
  return { grid, start, exit, gate, gateOpen: false }
}

function formatRunTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MazeGameQuizProps {
  instructorId?: number
  studentGameData?: StudentGameData  // passed for student play mode
  onExit: () => void
}

// Maze quiz game — instructors configure it, students navigate and answer questions.
export default function MazeGameQuiz({ instructorId, studentGameData, onExit }: MazeGameQuizProps) {
  const { toast } = usePanelUI()
  const isStudentMode = !!studentGameData

  // ── Setup (instructor mode only) ─────────────────────────────────────────────
  const [quizList, setQuizList] = useState<LibraryQuiz[]>([])
  const [listLoading, setListLoading] = useState(!isStudentMode)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedQuizId, setSelectedQuizId] = useState<number | ''>('')
  const [ghostEnabled, setGhostEnabled] = useState(false)
  const [fogEnabled, setFogEnabled] = useState(true)

  // Save Game dialog
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)

  // ── Game state ───────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>(isStudentMode ? 'loading' : 'setup')

  useGameImmersiveMode(phase !== 'setup' && phase !== 'loading')
  const [quiz, setQuiz] = useState<LibraryQuiz | null>(null)
  const [level, setLevel] = useState(0)
  const [levelData, setLevelData] = useState<LevelData | null>(null)
  const [player, setPlayer] = useState<Pos>({ r: 1, c: 1 })
  const [ghost, setGhost] = useState<Pos>({ r: ROWS - 2, c: 1 })
  const [ghostVisible, setGhostVisible] = useState(false)
  const [ghostCaught, setGhostCaught] = useState(false)
  const [chasing, setChasing] = useState(false)
  const [chaseCountdown, setChaseCountdown] = useState<number | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [timerActive, setTimerActive] = useState(false)

  // How to Play modal (shown before each run; per-game disable synced to account).
  const howTo = useGameHowTo('maze')
  const [howToOpen, setHowToOpen] = useState(false)
  const howToShownRef = useRef(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finalTimeSeconds, setFinalTimeSeconds] = useState<number | null>(null)
  const [wrongAnswerCount, setWrongAnswerCount] = useState(0)

  // Refs to avoid stale closures in intervals
  const playerRef = useRef<Pos>({ r: 1, c: 1 })
  const levelDataRef = useRef<LevelData | null>(null)
  const ghostTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ghostTickMsRef = useRef(GHOST_TICK_MS)
  const [ghostTickMs, setGhostTickMs] = useState(GHOST_TICK_MS)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runStartedRef = useRef<boolean>(false)
  const levelMoveStartedRef = useRef<boolean>(false)
  const timerStartRef = useRef<number | null>(null)
  const pausedDurationRef = useRef(0)
  const pauseStartRef = useRef<number | null>(null)

  // Fit both width AND height so the whole 29×29 board (plus HUD + on-screen
  // controls) stays on small phones like the iPhone 12 Pro without scrolling.
  const cellPx = useResponsiveCellSize(CELL_PX, COLS, 28, {
    gridRows: ROWS,
    verticalReserve: 386,
    minSize: 9,
  })

  // Active palette for this level — cycles through the curated themes.
  const theme = useMemo(() => MAZE_THEMES[level % MAZE_THEMES.length], [level])

  // Breadcrumb trail of recently visited cells (visual aid through the fog).
  const [trail, setTrail] = useState<string[]>([])
  const trailSet = useMemo(() => new Set(trail), [trail])

  // Torches the player drops to light the maze (only relevant when fog is on).
  const [torches, setTorches] = useState<Pos[]>([])
  const [torchesLeft, setTorchesLeft] = useState(TORCH_BUDGET)

  // Refs for the fairer ghost AI + the canvas-based fog.
  const ghostTargetRef = useRef<Pos | null>(null)
  const ghostTickCountRef = useRef(0)
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridContainerRef = useRef<HTMLDivElement | null>(null)

  const TOUCH_DIRS: Record<TouchDirection, [number, number]> = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  }

  // Keep refs in sync
  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { levelDataRef.current = levelData }, [levelData])

  const computeElapsedSeconds = useCallback(() => {
    if (!timerStartRef.current) return 0
    let paused = pausedDurationRef.current
    if (pauseStartRef.current !== null) {
      paused += Date.now() - pauseStartRef.current
    }
    return Math.max(0, Math.floor((Date.now() - timerStartRef.current - paused) / 1000))
  }, [])

  const clearLevelTimers = useCallback(() => {
    if (ghostTimerRef.current) clearInterval(ghostTimerRef.current)
  }, [])

  const clearChaseTimers = useCallback(() => {
    if (chaseTimerRef.current) clearTimeout(chaseTimerRef.current)
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
  }, [])

  const clearAllRunTimers = useCallback(() => {
    clearLevelTimers()
    clearChaseTimers()
  }, [clearLevelTimers, clearChaseTimers])

  const clearRunStats = useCallback(() => {
    runStartedRef.current = false
    levelMoveStartedRef.current = false
    timerStartRef.current = null
    pausedDurationRef.current = 0
    pauseStartRef.current = null
    clearAllRunTimers()
    setTimerActive(false)
    setElapsedSeconds(0)
    setFinalTimeSeconds(null)
    setWrongAnswerCount(0)
    setGhostVisible(false)
    setChasing(false)
    setChaseCountdown(null)
    ghostTickMsRef.current = GHOST_TICK_MS
    setGhostTickMs(GHOST_TICK_MS)
    setTrail([])
  }, [clearAllRunTimers])

  const startGhostCountdown = useCallback(() => {
    if (!ghostEnabled) return

    clearChaseTimers()
    setGhostVisible(false)
    setChasing(false)
    setChaseCountdown(GHOST_SPAWN_COUNTDOWN_SEC)

    let remaining = GHOST_SPAWN_COUNTDOWN_SEC
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1
      setChaseCountdown(remaining > 0 ? remaining : null)
      if (remaining <= 0 && countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }, 1000)

    chaseTimerRef.current = setTimeout(() => {
      setGhostVisible(true)
      setChasing(true)
      setChaseCountdown(null)
    }, GHOST_SPAWN_DELAY_MS)
  }, [ghostEnabled, clearChaseTimers])

  const beginRunOnFirstMove = useCallback(() => {
    if (!runStartedRef.current) {
      runStartedRef.current = true
      timerStartRef.current = Date.now()
      setTimerActive(true)
      setElapsedSeconds(0)
    }

    if (levelMoveStartedRef.current) return
    levelMoveStartedRef.current = true
    startGhostCountdown()
  }, [startGhostCountdown])

  // Freeze the clock while the ESC menu or the game-over modal is showing
  useEffect(() => {
    if (phase === 'paused' || phase === 'game-over') {
      if (pauseStartRef.current === null) pauseStartRef.current = Date.now()
    } else if (pauseStartRef.current !== null) {
      pausedDurationRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      if (timerActive) setElapsedSeconds(computeElapsedSeconds())
    }
  }, [phase, timerActive, computeElapsedSeconds])

  // Live run timer (stops only on game complete or reset)
  useEffect(() => {
    if (!timerActive || phase === 'paused' || phase === 'game-over' || phase === 'game-complete') return
    setElapsedSeconds(computeElapsedSeconds())
    const id = setInterval(() => setElapsedSeconds(computeElapsedSeconds()), 1000)
    return () => clearInterval(id)
  }, [timerActive, phase, computeElapsedSeconds])

  // ── Load quiz list (instructor mode) ─────────────────────────────────────────
  useEffect(() => {
    if (isStudentMode || !instructorId) return
    setListLoading(true)
    fetch(`${API_BASE_URL}/api/quizzes/instructor/${instructorId}`)
      .then(r => r.json())
      .then(d => { setQuizList(d.quizzes || []); setListError(null) })
      .catch(() => setListError('Failed to load your quizzes.'))
      .finally(() => setListLoading(false))
  }, [instructorId, isStudentMode])

  // ── Auto-load for student mode ────────────────────────────────────────────────
  useEffect(() => {
    if (!isStudentMode || !studentGameData) return
    const load = async () => {
      try {
        setPhase('loading')
        const res = await fetch(`${API_BASE_URL}/api/quizzes/${studentGameData.quizId}`)
        if (!res.ok) throw new Error('Failed to load game quiz')
        const data = await res.json()
        const q: LibraryQuiz = data.quiz
        if (!q || !q.questions?.length) throw new Error('This game has no questions')
        const playable = normalizeQuestionsForGame(q.questions)
        if (playable.length === 0) {
          throw new Error('This game has no playable questions (need multiple-choice or true/false)')
        }
        const sorted: LibraryQuiz = {
          ...q,
          questions: playable.map((pq) => ({
            question_text: pq.question_text,
            question_type: pq.question_type,
            correct_answer: pq.correct_answer,
            question_order: pq.question_order,
            explanation: pq.explanation,
            options: pq.options.map((o) => ({
              option_text: o.option_text,
              option_order: o.option_order,
            })),
          })),
        }
        setQuiz(sorted)
        setGhostEnabled(studentGameData.ghostEnabled)
        setFogEnabled(parseMazeSettings(studentGameData.settings).fogEnabled)
        const ld = buildLevel()
        setLevelData(ld)
        setPlayer(ld.start)
        setGhost({ ...ld.start })
        clearRunStats()
        setTorches([])
        setTorchesLeft(TORCH_BUDGET)
        setLevel(0)
        howToShownRef.current = false // new run → allow the How to Play modal again
        setPhase('playing')
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to load game')
        setPhase('setup')
      }
    }
    load()
  }, [isStudentMode, studentGameData])

  // Auto-open the How to Play modal once per run while the maze is frozen
  // awaiting the first move (covers instructor test play and student play).
  useEffect(() => {
    if (phase === 'playing' && !timerActive && howTo.loaded && !howToShownRef.current) {
      howToShownRef.current = true
      if (!howTo.disabled) setHowToOpen(true)
    }
  }, [phase, timerActive, howTo.loaded, howTo.disabled])

  // ── Ghost movement (chases during play and gate questions; not when paused) ──
  useEffect(() => {
    if (ghostTimerRef.current) clearInterval(ghostTimerRef.current)
    const ghostActivePhase = phase === 'playing' || phase === 'at-gate'
    if (!ghostActivePhase || !ghostEnabled || !ghostVisible || !levelData) return

    const tick = () => {
      const ld = levelDataRef.current
      if (!ld) return
      ghostTickCountRef.current += 1
      // Re-lock onto the player only every few ticks → chases a slightly stale spot.
      if (!ghostTargetRef.current || ghostTickCountRef.current % GHOST_TARGET_REFRESH_TICKS === 0) {
        ghostTargetRef.current = playerRef.current
      }
      const target = ghostTargetRef.current ?? playerRef.current
      setGhost(prev => ghostNextStep(ld.grid, prev, target, GHOST_WANDER_CHANCE))
    }
    tick()
    ghostTimerRef.current = setInterval(tick, ghostTickMs)

    return () => { if (ghostTimerRef.current) clearInterval(ghostTimerRef.current) }
  }, [phase, ghostEnabled, ghostVisible, levelData, ghostTickMs])

  // ── Ghost catch detection → game over (restart the level) ────────────────────
  useEffect(() => {
    if (!ghostEnabled || !ghostVisible || (phase !== 'playing' && phase !== 'at-gate')) return
    if (ghost.r === player.r && ghost.c === player.c) {
      setGhostCaught(true)
      clearAllRunTimers()
      setPhase('game-over')
    }
  }, [ghost, player, ghostEnabled, ghostVisible, phase, clearAllRunTimers])

  // ── Movement (keyboard + touch) ───────────────────────────────────────────────
  const tryMove = useCallback((delta: [number, number]) => {
    if (phase !== 'playing' || ghostCaught || !levelData || !quiz) return

    const nr = player.r + delta[0]
    const nc = player.c + delta[1]
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return
    if (levelData.grid[nr][nc] === 1) return

    beginRunOnFirstMove()

    if (!levelData.gateOpen && nr === levelData.gate.r && nc === levelData.gate.c) {
      setPhase('at-gate')
      return
    }
    if (nr === levelData.exit.r && nc === levelData.exit.c) {
      if (!levelData.gateOpen) { setPhase('at-gate'); return }
      if (level + 1 >= quiz.questions.length) {
        setFinalTimeSeconds(computeElapsedSeconds())
        setPhase('game-complete')
      } else {
        setPhase('level-complete')
      }
      return
    }
    setTrail((prev) => [...prev, `${player.r}-${player.c}`].slice(-10))
    setPlayer({ r: nr, c: nc })
  }, [phase, ghostCaught, levelData, quiz, player, level, beginRunOnFirstMove, computeElapsedSeconds])

  const handleTouchDirection = useCallback((dir: TouchDirection) => {
    tryMove(TOUCH_DIRS[dir])
  }, [tryMove]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTouchPause = useCallback(() => {
    setPhase((p) => (p === 'paused' ? 'playing' : p === 'playing' ? 'paused' : p))
  }, [])

  // ── Keyboard handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const DIRS: Record<string, [number, number]> = {
      ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1],
      w: [-1,0], s: [1,0], a: [0,-1], d: [0,1],
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleTouchPause()
        return
      }
      const delta = DIRS[e.key]
      if (!delta) return
      e.preventDefault()
      tryMove(delta)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryMove, handleTouchPause])

  // ── Canvas fog of war ─────────────────────────────────────────────────────────
  // A single dark layer with transparent "holes" punched at the player and each
  // torch. Canvas lets multiple light sources union cleanly (CSS can't).
  useEffect(() => {
    if (!fogEnabled) return
    const canvas = fogCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const stride = cellPx + GRID_GAP
    const w = 2 * GRID_EDGE + COLS * cellPx + (COLS - 1) * GRID_GAP
    const h = 2 * GRID_EDGE + ROWS * cellPx + (ROWS - 1) * GRID_GAP
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.985
    ctx.fillStyle = theme.fog
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1

    ctx.globalCompositeOperation = 'destination-out'
    const punch = (cx: number, cy: number, radius: number) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(0.55, 'rgba(0,0,0,0.92)')
      g.addColorStop(0.8, 'rgba(0,0,0,0.45)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    punch(
      GRID_EDGE + player.c * stride + cellPx / 2,
      GRID_EDGE + player.r * stride + cellPx / 2,
      Math.max(70, cellPx * 4.6)
    )
    for (const t of torches) {
      punch(
        GRID_EDGE + t.c * stride + cellPx / 2,
        GRID_EDGE + t.r * stride + cellPx / 2,
        Math.max(48, cellPx * 3.3)
      )
    }
    ctx.globalCompositeOperation = 'source-over'
  }, [fogEnabled, player, torches, cellPx, theme])

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    if (!selectedQuizId) return
    const q = quizList.find(q => q.id === Number(selectedQuizId))
    if (!q || !q.questions.length) return
    const playable = normalizeQuestionsForGame(q.questions)
    if (playable.length === 0) {
      setListError('This quiz has no playable questions. Use multiple-choice (2-4 options) or true/false.')
      return
    }
    const sorted: LibraryQuiz = {
      ...q,
      questions: playable.map((pq) => ({
        question_text: pq.question_text,
        question_type: pq.question_type,
        correct_answer: pq.correct_answer,
        question_order: pq.question_order,
        explanation: pq.explanation,
        options: pq.options.map((o) => ({
          option_text: o.option_text,
          option_order: o.option_order,
        })),
      })),
    }
    setQuiz(sorted)
    setLevel(0)
    const ld = buildLevel()
    setLevelData(ld)
    setPlayer(ld.start)
    setGhost({ ...ld.start })
    clearRunStats()
    setTorches([])
    setTorchesLeft(TORCH_BUDGET)
    setGhostCaught(false)
    setSelectedAnswer('')
    setAnswerFeedback(null)
    howToShownRef.current = false // new run → allow the How to Play modal again
    setPhase('playing')
  }, [selectedQuizId, quizList, clearRunStats])

  const nextLevel = useCallback(() => {
    clearLevelTimers()
    clearChaseTimers()
    levelMoveStartedRef.current = false

    const nl = level + 1
    setLevel(nl)
    const ld = buildLevel()
    setLevelData(ld)
    setPlayer(ld.start)
    setTrail([])
    setTorches([])
    setTorchesLeft(TORCH_BUDGET)
    ghostTargetRef.current = null
    ghostTickCountRef.current = 0
    setGhost({ ...ld.start })
    setGhostVisible(false)
    setChasing(false)
    setChaseCountdown(null)
    setGhostCaught(false)
    ghostTickMsRef.current = GHOST_TICK_MS
    setGhostTickMs(GHOST_TICK_MS)
    setSelectedAnswer('')
    setAnswerFeedback(null)
    setPhase('playing')
  }, [level, clearLevelTimers, clearChaseTimers])

  // Replays the current level with a brand-new randomized maze (used after a
  // game over when the hunter catches the player). Keeps the run timer going.
  const restartLevel = useCallback(() => {
    clearLevelTimers()
    clearChaseTimers()
    levelMoveStartedRef.current = false
    const ld = buildLevel()
    setLevelData(ld)
    setPlayer(ld.start)
    setTrail([])
    setTorches([])
    setTorchesLeft(TORCH_BUDGET)
    ghostTargetRef.current = null
    ghostTickCountRef.current = 0
    setGhost({ ...ld.start })
    setGhostVisible(false)
    setChasing(false)
    setChaseCountdown(null)
    setGhostCaught(false)
    ghostTickMsRef.current = GHOST_TICK_MS
    setGhostTickMs(GHOST_TICK_MS)
    setSelectedAnswer('')
    setAnswerFeedback(null)
    setPhase('playing')
  }, [clearLevelTimers, clearChaseTimers])

  // Drop a torch on a specific (walkable) cell, spending one from the budget.
  const placeTorchAt = useCallback((r: number, c: number) => {
    if (!fogEnabled || phase !== 'playing' || torchesLeft <= 0) return
    const ld = levelDataRef.current
    if (!ld || ld.grid[r]?.[c] !== 0) return
    if (torches.some((t) => t.r === r && t.c === c)) return // no double-stacking
    setTorches((prev) => [...prev, { r, c }])
    setTorchesLeft((n) => n - 1)
  }, [fogEnabled, phase, torchesLeft, torches])

  // Left-click the maze (or tap the button) to drop a torch on the player's cell.
  const placeTorchOnPlayer = useCallback(() => {
    placeTorchAt(playerRef.current.r, playerRef.current.c)
  }, [placeTorchAt])

  const resetToSetup = useCallback(() => {
    clearRunStats()
    setPhase(isStudentMode ? 'setup' : 'setup')
    setQuiz(null)
    setLevel(0)
    setLevelData(null)
    setSelectedAnswer('')
    setAnswerFeedback(null)
    setGhostCaught(false)
  }, [isStudentMode, clearRunStats])

  const submitAnswer = useCallback(() => {
    if (!quiz || !selectedAnswer || !levelData) return
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)

    const q = quiz.questions[level]
    const correct = selectedAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()

    setAnswerFeedback(correct ? 'correct' : 'wrong')
    if (correct) {
      setLevelData(prev => prev ? { ...prev, gateOpen: true } : prev)
      feedbackTimerRef.current = setTimeout(() => {
        setAnswerFeedback(null)
        setSelectedAnswer('')
        setPhase('playing')
      }, 1400)
    } else {
      setWrongAnswerCount(c => c + 1)
      const faster = Math.max(GHOST_TICK_MIN_MS, ghostTickMsRef.current - GHOST_WRONG_SPEED_DELTA)
      ghostTickMsRef.current = faster
      setGhostTickMs(faster)
      feedbackTimerRef.current = setTimeout(() => setAnswerFeedback(null), 1400)
    }
  }, [quiz, selectedAnswer, levelData, level])

  // ── Save Game (instructor mode) ───────────────────────────────────────────────
  const openSaveDialog = () => {
    const q = quizList.find(q => q.id === Number(selectedQuizId))
    setSaveTitle(q ? `${q.title}: Maze Quest` : 'Maze Quest')
    setSaveDesc('')
    setSaveDialogOpen(true)
  }

  // Saves the configured maze game to the instructor's game library.
  const handleSaveGame = async () => {
    if (!instructorId || !selectedQuizId || !saveTitle.trim()) return
    setSaveLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructor_id: instructorId,
          quiz_id: selectedQuizId,
          title: saveTitle.trim(),
          description: saveDesc.trim(),
          ghost_enabled: ghostEnabled,
          game_type: 'maze',
          settings: JSON.stringify({ fogEnabled }),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setSaveDialogOpen(false)
      toast(
        `"${saveTitle.trim()}" saved to your Library! You can now publish it to a class from Manage Class.`,
        'success'
      )
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save game', 'error')
    } finally {
      setSaveLoading(false)
    }
  }

  // ── Cell renderer ─────────────────────────────────────────────────────────────

  const renderCell = (r: number, c: number) => {
    if (!levelData) return null
    const isGate = levelData.gate.r === r && levelData.gate.c === c
    const isExit = levelData.exit.r === r && levelData.exit.c === c
    const isWall = levelData.grid[r][c] === 1
    const isTrail = !isWall && trailSet.has(`${r}-${c}`)

    let bg = isWall ? theme.wall : theme.path
    let border = '1px solid transparent'
    let boxShadow = ''
    let emoji = ''
    let borderRadius = '2px'
    let className = `maze-game-quiz__cell ${isWall ? 'maze-game-quiz__cell--wall' : 'maze-game-quiz__cell--path'}`

    if (isTrail) {
      bg = theme.trail
    }
    if (isExit) {
      bg = C.exitBg
      border = `1.5px solid ${C.exitBorder}`
      boxShadow = `0 0 6px rgba(250,204,21,0.4)`
      emoji = '⭐'
      borderRadius = '6px'
    }
    if (isGate) {
      bg = levelData.gateOpen ? C.gateOpenBg : C.gateLockedBg
      border = `1.5px solid ${levelData.gateOpen ? C.gateOpenBorder : C.gateLockedBorder}`
      boxShadow = levelData.gateOpen
        ? '0 0 6px rgba(134,239,172,0.45)'
        : '0 0 8px rgba(167,139,250,0.55)'
      emoji = levelData.gateOpen ? '✓' : '🚪'
      borderRadius = '5px'
      className += levelData.gateOpen ? ' maze-game-quiz__cell--gate-open' : ''
    }

    return (
      <div
        key={`${r}-${c}`}
        className={className}
        style={{
          width: cellPx,
          height: cellPx,
          background: bg,
          border,
          boxShadow: boxShadow || undefined,
          fontSize: cellPx * 0.55,
          borderRadius,
        }}
      >
        {emoji}
      </div>
    )
  }

  // ─── Loading (student mode) ───────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="panel-page maze-game-quiz__page--loading">
        <div className="maze-game-quiz__loading-inner">
          <div className="maze-game-quiz__loading-icon">🎮</div>
          <PanelSkeleton variant="hero" />
          {listError && <div className="panel-alert panel-alert-error maze-game-quiz__alert-spaced">{listError}</div>}
        </div>
      </div>
    )
  }

  // ─── Setup Screen (instructor mode) ──────────────────────────────────────────

  if (phase === 'setup' && !isStudentMode) {
    const selQuiz = quizList.find(q => q.id === Number(selectedQuizId))
    const playableCount = selQuiz ? countPlayableQuestions(selQuiz.questions) : 0

    return (
      <div className="panel-page maze-game-quiz__page--relative">
        {/* Save Game Dialog */}
        {saveDialogOpen && (
          <div className="maze-game-quiz__modal-backdrop">
            <div className="maze-game-quiz__modal">
              <h2 className="maze-game-quiz__modal-title">Save to Library</h2>
              <p className="panel-meta maze-game-quiz__modal-meta">
                Saved games can be published to your classes from Manage Class.
              </p>
              <div className="panel-form-group">
                <label className="panel-label">Game Title *</label>
                <input
                  className="panel-input"
                  value={saveTitle}
                  onChange={e => setSaveTitle(e.target.value)}
                  placeholder="Give your game a name"
                  maxLength={120}
                />
              </div>
              <div className="panel-form-group">
                <label className="panel-label">Description (optional)</label>
                <textarea
                  className="panel-textarea"
                  value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                  placeholder="Describe this game for students"
                  rows={2}
                />
              </div>
              <div className="maze-game-quiz__modal-summary">
                <p className="panel-meta maze-game-quiz__modal-summary-text">
                  Quiz: <strong className="maze-game-quiz__modal-summary-quiz">{selQuiz?.title}</strong>
                  {' · '}Ghost: <strong className={ghostEnabled ? 'maze-game-quiz__modal-summary-ghost--on' : 'maze-game-quiz__modal-summary-ghost--off'}>
                    {ghostEnabled ? 'Enabled' : 'Disabled'}
                  </strong>
                  {' · '}Fog: <strong className={fogEnabled ? 'maze-game-quiz__modal-summary-ghost--on' : 'maze-game-quiz__modal-summary-ghost--off'}>
                    {fogEnabled ? 'On' : 'Off'}
                  </strong>
                </p>
              </div>
              <div className="panel-row maze-game-quiz__modal-actions">
                <button
                  className="panel-btn panel-btn-success maze-game-quiz__modal-btn"
                  onClick={handleSaveGame}
                  disabled={!saveTitle.trim() || saveLoading}
                >
                  {saveLoading ? 'Saving…' : 'Save Game'}
                </button>
                <button
                  className="panel-btn panel-btn-secondary maze-game-quiz__modal-btn"
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
          <div className="panel-hero maze-game-quiz__hero">
            <p className="panel-kicker">Instructor · Content Maker</p>
            <h1>Maze Quest</h1>
            <p>Turn any quiz from your library into a procedurally generated maze adventure.</p>
          </div>
          <button className="panel-btn panel-btn-secondary" type="button" onClick={onExit}>
            Back to Studio
          </button>
        </div>

        {listError && <div className="panel-alert panel-alert-error">{listError}</div>}

        {/* Step 1 */}
        <div className="panel-card">
          <h3 className="panel-section-title">1. Choose a Quiz</h3>
          <p className="panel-meta maze-game-quiz__section-meta">
            Supports multiple-choice (2-4 options) and true/false questions.
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
            <div className={`panel-form-group ${selQuiz ? 'maze-game-quiz__form-group--quiz-selected' : 'maze-game-quiz__form-group--no-quiz'}`}>
              <label className="panel-label">Search your quiz library</label>
              <QuizSearchSelect
                options={quizList.map(q => {
                  const n = countPlayableQuestions(q.questions)
                  return {
                    id: q.id,
                    title: `${q.title}${q.class_title ? ` · ${q.class_title}` : ''}${n === 0 ? ' · needs valid questions' : ''}`,
                  }
                })}
                value={selectedQuizId === '' ? '' : String(selectedQuizId)}
                onChange={id => setSelectedQuizId(id ? Number(id) : '')}
                placeholder="Type a quiz name to search…"
                emptyText="No matching quizzes in your library"
                ariaLabel="Search quizzes to build a game"
                optionIcon="quiz"
              />
            </div>
          )}
          {selQuiz && (
            <div className="maze-game-quiz__quiz-preview">
              <p className="maze-game-quiz__quiz-preview-title">{selQuiz.title}</p>
              {selQuiz.description && <p className="panel-meta maze-game-quiz__quiz-preview-desc">{selQuiz.description}</p>}
              <div className="maze-game-quiz__quiz-preview-stats">
                <span className="panel-meta">{playableCount} playable question{playableCount !== 1 ? 's' : ''}</span>
                <span className="panel-meta">→ {playableCount} maze level{playableCount !== 1 ? 's' : ''}</span>
                {selQuiz.class_title && <span className="panel-meta">Class: {selQuiz.class_title}</span>}
              </div>
              {playableCount === 0 && (
                <p className="panel-meta maze-game-quiz__quiz-preview-error">
                  Add multiple-choice (2-4 options) or true/false questions to use this quiz.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className="panel-card">
          <h3 className="panel-section-title">2. Game Settings</h3>
          <label className="maze-game-quiz__checkbox-label">
            <input
              type="checkbox"
              checked={ghostEnabled}
              onChange={e => setGhostEnabled(e.target.checked)}
              className="maze-game-quiz__checkbox"
            />
            <div>
              <span className="maze-game-quiz__checkbox-title">Enable Ghost Enemy 👻</span>
              <p className="panel-meta maze-game-quiz__checkbox-desc">
                A ghost waits at your spawn point. It appears and chases you 10 seconds after your first move.
                If it catches you, the level restarts with a new maze.
              </p>
            </div>
          </label>
          <label className="maze-game-quiz__checkbox-label">
            <input
              type="checkbox"
              checked={fogEnabled}
              onChange={e => setFogEnabled(e.target.checked)}
              className="maze-game-quiz__checkbox"
            />
            <div>
              <span className="maze-game-quiz__checkbox-title">Enable Fog of War 🔦</span>
              <p className="panel-meta maze-game-quiz__checkbox-desc">
                Only the area around the player is lit. Players get {TORCH_BUDGET} torches per level
                (right-click or the Place Torch button) to reveal more of the maze. Turn off to show the whole maze.
              </p>
            </div>
          </label>
        </div>

        {/* How to play */}
        <div className="panel-card maze-game-quiz__howto-card">
          <h3 className="panel-section-title">How to Play</h3>
          <ul className="maze-game-quiz__howto-list">
            <li>Move with <strong className="maze-game-quiz__howto-strong-light">Arrow Keys</strong> or <strong className="maze-game-quiz__howto-strong-light">WASD</strong></li>
            <li>Reach the <strong className="maze-game-quiz__howto-strong-gate">🚪 Gate</strong>. It blocks the only path to the exit.</li>
            <li>Answer the question correctly to open the gate</li>
            <li>Navigate to the <strong className="maze-game-quiz__howto-strong-exit">⭐ Exit</strong> to advance to the next level</li>
            <li>Every level generates a brand-new unique maze</li>
            <li>Press <strong className="maze-game-quiz__howto-strong-light">ESC</strong> to pause at any time</li>
            {ghostEnabled && <li><strong className="maze-game-quiz__howto-strong-ghost">👻 Ghost</strong> appears at spawn and chases you 10 seconds after your first move!</li>}
          </ul>
        </div>

        {/* Action buttons */}
        <div className="panel-row maze-game-quiz__actions">
          <button
            className="panel-btn panel-btn-success maze-game-quiz__action-btn"
            type="button"
            onClick={startGame}
            disabled={!selectedQuizId || listLoading || playableCount === 0}
          >
            ▶ Test Play
          </button>
          <button
            className="panel-btn panel-btn-secondary maze-game-quiz__action-btn"
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

  // ─── Game Complete ────────────────────────────────────────────────────────────

  if (phase === 'game-complete') {
    const finishTime = finalTimeSeconds ?? elapsedSeconds
    const totalQuestions = quiz?.questions.length ?? 0

    return (
      <div className="panel-page maze-game-quiz__page--centered-col">
        <div className="maze-game-quiz__complete-icon">🏆</div>
        <h1 className="maze-game-quiz__complete-title">You Escaped!</h1>
        <p className="maze-game-quiz__complete-subtitle">
          All {totalQuestions} questions answered and every maze conquered.
        </p>
        <p className="panel-meta maze-game-quiz__complete-quiz-meta">Quiz: {quiz?.title}</p>

        <div className="maze-game-quiz__summary-card">
          <p className="maze-game-quiz__summary-heading">
            Run Summary
          </p>
          <div className="maze-game-quiz__summary-grid">
            <div className="maze-game-quiz__summary-row">
              <span className="maze-game-quiz__summary-label">⏱ Completion Time</span>
              <span className="maze-game-quiz__summary-value">
                {formatRunTime(finishTime)}
              </span>
            </div>
            <div className="maze-game-quiz__summary-divider" />
            <div className="maze-game-quiz__summary-row">
              <span className="maze-game-quiz__summary-label">✗ Incorrect Answers</span>
              <span
                className="maze-game-quiz__summary-value maze-game-quiz__summary-value--wrong"
                style={{ color: wrongAnswerCount === 0 ? '#86efac' : '#fca5a5' }}
              >
                {wrongAnswerCount}
              </span>
            </div>
            <div className="maze-game-quiz__summary-row">
              <span className="maze-game-quiz__summary-label">✓ Questions Cleared</span>
              <span className="maze-game-quiz__summary-value maze-game-quiz__summary-value--correct">
                {totalQuestions} / {totalQuestions}
              </span>
            </div>
          </div>
          <p className="panel-meta maze-game-quiz__summary-footnote">
            Timer started on your first move and stopped when you reached the final exit. Pause time (ESC) is excluded.
          </p>
        </div>

        <div className="panel-row maze-game-quiz__complete-actions">
          <button className="panel-btn panel-btn-success maze-game-quiz__play-again-btn" onClick={isStudentMode ? resetToSetup : startGame}>
            Play Again
          </button>
          {!isStudentMode && (
            <button className="panel-btn panel-btn-secondary" onClick={resetToSetup}>Choose Quiz</button>
          )}
          <button className="panel-btn maze-game-quiz__exit-btn-muted" onClick={onExit}>
            {isStudentMode ? 'Back to Courses' : 'Back to Studio'}
          </button>
        </div>
      </div>
    )
  }

  // ─── Level Complete ───────────────────────────────────────────────────────────

  if (phase === 'level-complete') {
    const completedQ = quiz?.questions[level]
    const remaining = (quiz?.questions.length ?? 0) - level - 1
    return (
      <div className="panel-page maze-game-quiz__page--level-complete">
        <div className="maze-game-quiz__level-icon">🎉</div>
        <h1 className="maze-game-quiz__level-title">Level {level + 1} Complete!</h1>
        <p className="maze-game-quiz__level-subtitle">You answered correctly and found the exit.</p>
        {completedQ?.explanation && (
          <div className="maze-game-quiz__explanation-box">
            <p className="maze-game-quiz__explanation-label">Explanation</p>
            <p className="maze-game-quiz__explanation-text">{completedQ.explanation}</p>
          </div>
        )}
        <p className="panel-meta maze-game-quiz__level-remaining">
          {remaining > 0 ? `${remaining} level${remaining !== 1 ? 's' : ''} remaining` : 'Last level. Almost there!'}
        </p>
        <button className="panel-btn panel-btn-primary maze-game-quiz__next-level-btn" onClick={nextLevel}>
          Next Level →
        </button>
      </div>
    )
  }

  // ─── Main Game View ───────────────────────────────────────────────────────────

  if (!levelData || !quiz) return null

  const question = quiz.questions[level]
  const opts: QuestionOption[] = getOptionsForQuestion(question).map((o) => ({
    option_text: o.option_text,
    option_order: o.option_order,
  }))

  // Overlay geometry — keep in sync with the grid's border/padding/gap (CSS).
  const stride = cellPx + GRID_GAP
  const tokenStyle = (pos: Pos): CSSProperties => ({
    width: cellPx,
    height: cellPx,
    fontSize: cellPx * 0.62,
    transform: `translate(${GRID_EDGE + pos.c * stride}px, ${GRID_EDGE + pos.r * stride}px)`,
  })
  const ghostActive = ghostEnabled && ghostVisible
  const ghostDist = ghostActive ? Math.abs(ghost.r - player.r) + Math.abs(ghost.c - player.c) : 99
  const dangerLevel = ghostActive ? Math.max(0, Math.min(1, (7 - ghostDist) / 7)) : 0
  const scared = ghostActive && !ghostCaught && ghostDist <= 4
  // Ghost is hidden in the fog and fades in as it nears the player. With fog off
  // it's always visible (per the instructor's choice).
  const ghostOpacity = !fogEnabled ? 1 : Math.max(0, Math.min(1, (6 - ghostDist) / 5))

  const mazeHowToSteps: HowToStep[] = [
    { icon: '🎮', text: <>Move with <strong>Arrow Keys</strong> or <strong>WASD</strong> (or the on-screen pad on mobile).</> },
    { icon: '🚪', text: <>Reach the <strong>Gate</strong>, which blocks the only path to the exit.</> },
    { icon: '✅', text: <>Answer the gate question correctly to unlock it.</> },
    { icon: '⭐', text: <>Navigate to the <strong>Exit</strong> to advance to the next level.</> },
    ...(fogEnabled
      ? [{ icon: '🔥', text: <>Fog of War is on: click the maze (or tap 🔥) to drop a torch and reveal the area. You get {TORCH_BUDGET} torches per level.</> }]
      : []),
    ...(ghostEnabled
      ? [{ icon: '👻', text: <>The <strong>Ghost</strong> appears at spawn and starts chasing 10 seconds after your first move. If it catches you, the level restarts.</> }]
      : []),
    { icon: '⏸️', text: <>Press <strong>ESC</strong> (or tap ⏸) to pause at any time.</> },
  ]

  return (
    <div className="panel-page maze-game-quiz__page--playing">
      {/* Header */}
      <div className="maze-game-quiz__header">
        <div className="maze-game-quiz__header-titles">
          <p className="panel-kicker maze-game-quiz__header-kicker">
            {isStudentMode ? 'Maze Quest' : 'Instructor · Maze Quest'}
          </p>
          <h2 className="maze-game-quiz__header-title">{quiz.title}</h2>
        </div>
        <div className="maze-game-quiz__header-badges">
          {ghostEnabled && chaseCountdown !== null && (
            <span className="maze-game-quiz__badge--danger">
              👻 Appears in {chaseCountdown}s
            </span>
          )}
          {ghostEnabled && chasing && (
            <span className="maze-game-quiz__badge--danger">
              👻 Chasing!
            </span>
          )}
          {timerActive && (
            <span className="maze-game-quiz__badge--timer">
              ⏱ {formatRunTime(elapsedSeconds)}
            </span>
          )}
          <span className="maze-game-quiz__badge--level">
            Level {level + 1} / {quiz.questions.length}
          </span>
        </div>
        <button className="panel-btn panel-btn-secondary panel-btn-sm maze-game-quiz__header-pause" onClick={() => setPhase('paused')} title="Pause (ESC)">
          ⏸ Pause
        </button>
      </div>

      {/* Gate Question Popup */}
      {phase === 'at-gate' && (
        <div className="maze-game-quiz__gate-backdrop">
          <div className="maze-game-quiz__gate-modal">
            {ghostEnabled && ghostVisible && chasing && (
              <p className="maze-game-quiz__gate-chase-warning">
                👻 The ghost is still chasing while you answer!
              </p>
            )}
            <div className="maze-game-quiz__gate-header">
              <span className="maze-game-quiz__gate-icon">🚪</span>
              <div>
                <p className="maze-game-quiz__gate-kicker">
                  Gate Challenge
                </p>
                <h2 className="maze-game-quiz__gate-title">
                  Answer to unlock the gate
                </h2>
              </div>
            </div>

            <p className="maze-game-quiz__gate-question">
              {question.question_text}
            </p>

            <div className="maze-game-quiz__gate-options">
              {opts.map((opt, i) => {
                const sel = selectedAnswer === opt.option_text
                return (
                  <label
                    key={i}
                    className={`maze-game-quiz__gate-option${sel ? ' maze-game-quiz__gate-option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="maze-answer"
                      value={opt.option_text}
                      checked={sel}
                      onChange={() => setSelectedAnswer(opt.option_text)}
                      className="maze-game-quiz__gate-option-radio"
                    />
                    {opt.option_text}
                  </label>
                )
              })}
            </div>

            {answerFeedback && (
              <div className={`panel-alert ${answerFeedback === 'correct' ? 'panel-alert-success' : 'panel-alert-error'} maze-game-quiz__gate-feedback`}>
                {answerFeedback === 'correct' ? '✓ Correct! Gate unlocking…' : '✗ Wrong answer. Try another option!'}
              </div>
            )}

            <div className="panel-row maze-game-quiz__gate-actions">
              <button
                className="panel-btn panel-btn-primary maze-game-quiz__gate-action-btn"
                type="button"
                onClick={submitAnswer}
                disabled={!selectedAnswer || !!answerFeedback}
              >
                Submit Answer
              </button>
              <button
                className="panel-btn panel-btn-secondary maze-game-quiz__gate-action-btn"
                type="button"
                onClick={() => {
                  setSelectedAnswer('')
                  setAnswerFeedback(null)
                  setPhase('playing')
                }}
                disabled={!!answerFeedback}
              >
                Back to maze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over (hunter caught the player) */}
      {phase === 'game-over' && (
        <div className="maze-game-quiz__gate-backdrop">
          <div className="maze-game-quiz__gameover-modal" role="alertdialog" aria-labelledby="maze-gameover-title">
            <div className="maze-game-quiz__gameover-icon">👻</div>
            <h2 id="maze-gameover-title" className="maze-game-quiz__gameover-title">The hunter caught you!</h2>
            <p className="maze-game-quiz__gameover-text">
              Restart Level {level + 1}. A brand-new maze layout is waiting for you.
            </p>
            <div className="maze-game-quiz__gameover-actions">
              <button type="button" className="panel-btn panel-btn-primary maze-game-quiz__gameover-btn" onClick={restartLevel}>
                ↻ Restart Level
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-secondary maze-game-quiz__gameover-btn"
                onClick={() => { clearAllRunTimers(); onExit() }}
              >
                ← {isStudentMode ? 'Back to Courses' : 'Back to Studio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maze Grid */}
      <div className="maze-game-quiz__grid-wrap">
        <div
          ref={gridContainerRef}
          className="maze-game-quiz__grid-container"
          style={{ '--maze-accent': theme.accent, '--maze-accent-soft': theme.accentSoft } as CSSProperties}
          onClick={fogEnabled ? placeTorchOnPlayer : undefined}
        >
          <div
            className={`maze-game-quiz__grid${phase === 'at-gate' ? ' maze-game-quiz__grid--dimmed' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${ROWS}, ${cellPx}px)`,
            }}
          >
            {Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => renderCell(r, c)))}
          </div>

          {/* Torch markers (under the fog so their own glow shows through) */}
          {fogEnabled && torches.map((t, i) => (
            <div key={`torch-${i}`} className="maze-game-quiz__token maze-game-quiz__token--torch" style={tokenStyle(t)}>
              <span className="maze-game-quiz__token-emoji">🔥</span>
            </div>
          ))}

          {/* Fog of war — canvas with holes punched at the player + every torch */}
          {fogEnabled && (
            <canvas ref={fogCanvasRef} className="maze-game-quiz__fog-canvas" aria-hidden="true" />
          )}

          {/* Ghost proximity tension */}
          {dangerLevel > 0 && (
            <div className="maze-game-quiz__danger-vignette" style={{ opacity: 0.25 + dangerLevel * 0.55 }} />
          )}

          {/* Player token (slides between cells) */}
          <div
            className={`maze-game-quiz__token maze-game-quiz__token--player${ghostCaught ? ' maze-game-quiz__token--caught' : ''}${scared ? ' maze-game-quiz__token--scared' : ''}`}
            style={tokenStyle(player)}
          >
            <span className="maze-game-quiz__token-emoji">{ghostCaught ? '😵' : scared ? '😱' : '🧑'}</span>
          </div>

          {/* Ghost token — fades in from the fog as it nears the player */}
          {ghostActive && (
            <div
              className="maze-game-quiz__token maze-game-quiz__token--ghost"
              style={{ ...tokenStyle(ghost), opacity: ghostOpacity }}
            >
              <span className="maze-game-quiz__token-emoji">👻</span>
            </div>
          )}

          {phase === 'paused' && (
            <div className="maze-game-quiz__pause-overlay">
              <div className="maze-game-quiz__pause-icon">⏸</div>
              <div className="maze-game-quiz__pause-label">Paused</div>
              {timerActive && (
                <div className="maze-game-quiz__pause-timer">⏱ {formatRunTime(elapsedSeconds)}</div>
              )}
              <div className="maze-game-quiz__pause-actions">
                <button type="button" className="maze-game-quiz__light-btn" onClick={() => setPhase('playing')}>
                  ▶ Resume
                </button>
                <button
                  type="button"
                  className="maze-game-quiz__light-btn maze-game-quiz__light-btn--exit"
                  onClick={() => {
                    clearAllRunTimers()
                    onExit()
                  }}
                >
                  ← Exit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Torch bar — only relevant while fog is on */}
      {fogEnabled && (
        <div className="maze-game-quiz__torch-bar">
          <button
            type="button"
            className="maze-game-quiz__torch-btn"
            onClick={placeTorchOnPlayer}
            disabled={phase !== 'playing' || torchesLeft <= 0}
          >
            🔥 Place Torch
          </button>
          <span className="maze-game-quiz__torch-count">
            {torchesLeft} / {TORCH_BUDGET} left
          </span>
        </div>
      )}

      <GameTouchControls
        onDirection={handleTouchDirection}
        onPause={handleTouchPause}
        showPause={phase === 'playing' || phase === 'paused'}
      />

      {/* Controls hint */}
      <div className="maze-game-quiz__hint-wrap">
        <p className={`panel-meta maze-game-quiz__hint-text game-controls-hint--desktop`}>
          {phase === 'at-gate' ? '🚪 Answer the gate question in the popup'
            : fogEnabled ? 'Find the 🚪 gate · Arrow keys / WASD · Click the maze to drop a 🔥 torch · ESC to pause'
            : 'Find the 🚪 gate · Arrow keys or WASD · ESC to pause'}
        </p>
        <p className={`panel-meta maze-game-quiz__hint-text game-controls-hint--mobile`}>
          {phase === 'at-gate' ? '🚪 Answer the gate question in the popup'
            : fogEnabled ? 'Move with the pad · Tap 🔥 to drop a torch · Tap ⏸ to pause'
            : 'Use the on-screen pad to move · Tap ⏸ to pause'}
        </p>
        <div className="maze-game-quiz__legend">
          <span>🧑 You</span>
          <span>🚪 Gate (locked)</span>
          <span>✓ Gate (open)</span>
          <span>⭐ Exit</span>
          {fogEnabled && <span>🔥 Torch</span>}
          {ghostEnabled && <span>👻 Ghost</span>}
        </div>
      </div>

      <GameHowToModal
        open={howToOpen}
        gameName="Maze Quest"
        subtitle="Find the gate, answer to unlock it, then reach the exit."
        accent="#a855f7"
        icon="🧩"
        steps={mazeHowToSteps}
        primaryLabel="Let's Play!"
        onPrimary={() => setHowToOpen(false)}
        onClose={() => setHowToOpen(false)}
        dontShowAgain={howTo.disabled}
        onDontShowAgainChange={howTo.setDisabled}
      />
    </div>
  )
}
