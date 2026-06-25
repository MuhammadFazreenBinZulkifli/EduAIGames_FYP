import { useState, useEffect, useCallback, useRef } from 'react'
import './App_CSS/MazeGameQuiz_CSS.css'
import { API_BASE_URL } from '../config'
import { usePanelUI } from '../context/PanelUIContext'
import { useResponsiveCellSize } from '../hooks/useResponsiveCellSize'
import { useGameImmersiveMode } from '../hooks/useGameImmersiveMode'
import GameTouchControls, { type TouchDirection } from './GameTouchControls'
import PanelSkeleton from './PanelSkeleton'
import PanelEmptyState from './PanelEmptyState'
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROWS = 29        // 2× the original 15 rows (must be odd)
const COLS = 29        // 2× the original 15 cols (must be odd)
const CELL_PX = 22
const GHOST_SPAWN_DELAY_MS = 10000
const GHOST_SPAWN_COUNTDOWN_SEC = 10
const GHOST_TICK_MS = 360
const GHOST_TICK_MIN_MS = 100
const GHOST_WRONG_SPEED_DELTA = 55

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  wall: '#0d0820',
  path: '#19102e',
  playerBg: '#f97316',
  playerBorder: '#fb923c',
  playerGlow: 'rgba(249,115,22,0.7)',
  exitBg: 'rgba(250,204,21,0.22)',
  exitBorder: '#facc15',
  gateLockedBg: 'rgba(167,139,250,0.38)',
  gateLockedBorder: '#a78bfa',
  gateOpenBg: 'rgba(134,239,172,0.25)',
  gateOpenBorder: '#86efac',
}

// ─── Maze Generation (recursive-backtracking DFS) ─────────────────────────────

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Builds a solvable maze grid using recursive backtracking.
function generateMaze(rows: number, cols: number): number[][] {
  const g: number[][] = Array.from({ length: rows }, () => Array(cols).fill(1))

  const carve = (r: number, c: number) => {
    g[r][c] = 0
    for (const [dr, dc] of shuffleArr<[number, number]>([[0,2],[0,-2],[2,0],[-2,0]])) {
      const nr = r + dr, nc = c + dc
      if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && g[nr][nc] === 1) {
        g[r + dr / 2][c + dc / 2] = 0
        carve(nr, nc)
      }
    }
  }
  carve(1, 1)
  addExtraDeadEnds(g, rows, cols, Math.floor((rows * cols) / 28))
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

// ─── Level builder ────────────────────────────────────────────────────────────

// Places start, exit, and a question gate along a valid maze path.
function buildLevel(): LevelData {
  const grid = generateMaze(ROWS, COLS)
  const start: Pos = { r: 1, c: 1 }
  const exit: Pos = { r: ROWS - 2, c: COLS - 2 }
  const path = bfsPath(grid, start, exit)
  let gateIdx = Math.floor(path.length * 0.55)
  gateIdx = Math.max(5, Math.min(gateIdx, path.length - 6))
  const gate = path[gateIdx] ?? path[Math.floor(path.length / 2)]
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [finalTimeSeconds, setFinalTimeSeconds] = useState<number | null>(null)
  const [wrongAnswerCount, setWrongAnswerCount] = useState(0)

  // Refs to avoid stale closures in intervals
  const playerRef = useRef<Pos>({ r: 1, c: 1 })
  const levelDataRef = useRef<LevelData | null>(null)
  const ghostTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ghostTickMsRef = useRef(GHOST_TICK_MS)
  const [ghostTickMs, setGhostTickMs] = useState(GHOST_TICK_MS)
  const caughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runStartedRef = useRef<boolean>(false)
  const levelMoveStartedRef = useRef<boolean>(false)
  const timerStartRef = useRef<number | null>(null)
  const pausedDurationRef = useRef(0)
  const pauseStartRef = useRef<number | null>(null)

  const cellPx = useResponsiveCellSize(CELL_PX, COLS)

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

  // Pause time when ESC menu is open
  useEffect(() => {
    if (phase === 'paused') {
      pauseStartRef.current = Date.now()
    } else if (pauseStartRef.current !== null) {
      pausedDurationRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      if (timerActive) setElapsedSeconds(computeElapsedSeconds())
    }
  }, [phase, timerActive, computeElapsedSeconds])

  // Live run timer (stops only on game complete or reset)
  useEffect(() => {
    if (!timerActive || phase === 'paused' || phase === 'game-complete') return
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
        const ld = buildLevel()
        setLevelData(ld)
        setPlayer(ld.start)
        setGhost({ ...ld.start })
        clearRunStats()
        setLevel(0)
        setPhase('playing')
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to load game')
        setPhase('setup')
      }
    }
    load()
  }, [isStudentMode, studentGameData])

  // ── Ghost movement (chases during play and gate questions; not when paused) ──
  useEffect(() => {
    if (ghostTimerRef.current) clearInterval(ghostTimerRef.current)
    const ghostActivePhase = phase === 'playing' || phase === 'at-gate'
    if (!ghostActivePhase || !ghostEnabled || !ghostVisible || !levelData) return

    const tick = () => {
      const ld = levelDataRef.current
      if (!ld) return
      setGhost(prev => bfsStep(ld.grid, prev, playerRef.current) ?? prev)
    }
    tick()
    ghostTimerRef.current = setInterval(tick, ghostTickMs)

    return () => { if (ghostTimerRef.current) clearInterval(ghostTimerRef.current) }
  }, [phase, ghostEnabled, ghostVisible, levelData, ghostTickMs])

  // ── Ghost catch detection (still active while answering at gate) ─────────────
  useEffect(() => {
    if (!ghostEnabled || !ghostVisible || (phase !== 'playing' && phase !== 'at-gate')) return
    if (ghost.r === player.r && ghost.c === player.c) {
      setGhostCaught(true)
      if (caughtTimerRef.current) clearTimeout(caughtTimerRef.current)
      caughtTimerRef.current = setTimeout(() => setGhostCaught(false), 2000)
    }
  }, [ghost, player, ghostEnabled, ghostVisible, phase])

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

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    if (!selectedQuizId) return
    const q = quizList.find(q => q.id === Number(selectedQuizId))
    if (!q || !q.questions.length) return
    const playable = normalizeQuestionsForGame(q.questions)
    if (playable.length === 0) {
      setListError('This quiz has no playable questions. Use multiple-choice (2–4 options) or true/false.')
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
    setGhostCaught(false)
    setSelectedAnswer('')
    setAnswerFeedback(null)
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
    const isPlayer = player.r === r && player.c === c
    const isGhost = ghostEnabled && ghostVisible && ghost.r === r && ghost.c === c
    const isGate = levelData.gate.r === r && levelData.gate.c === c
    const isExit = levelData.exit.r === r && levelData.exit.c === c
    const isWall = levelData.grid[r][c] === 1

    let bg = isWall ? C.wall : C.path
    let border = '1px solid transparent'
    let boxShadow = 'none'
    let emoji = ''
    let borderRadius = '2px'

    if (isExit && !isPlayer) {
      bg = C.exitBg
      border = `1.5px solid ${C.exitBorder}`
      boxShadow = `0 0 6px rgba(250,204,21,0.4)`
      emoji = '⭐'
      borderRadius = '6px'
    }
    if (isGate && !isPlayer) {
      bg = levelData.gateOpen ? C.gateOpenBg : C.gateLockedBg
      border = `1.5px solid ${levelData.gateOpen ? C.gateOpenBorder : C.gateLockedBorder}`
      boxShadow = levelData.gateOpen
        ? '0 0 6px rgba(134,239,172,0.45)'
        : '0 0 8px rgba(167,139,250,0.55)'
      emoji = levelData.gateOpen ? '✓' : '🚪'
      borderRadius = '5px'
    }
    if (isGhost && !isPlayer) { emoji = '👻' }
    if (isPlayer) {
      bg = ghostCaught ? 'rgba(239,68,68,0.7)' : C.playerBg
      border = `2px solid ${ghostCaught ? '#ef4444' : C.playerBorder}`
      boxShadow = `0 0 10px ${ghostCaught ? 'rgba(239,68,68,0.8)' : C.playerGlow}`
      emoji = ghostCaught ? '😵' : '🧑'
      borderRadius = '50%'
    }

    return (
      <div
        key={`${r}-${c}`}
        className="maze-game-quiz__cell"
        style={{
          width: cellPx,
          height: cellPx,
          background: bg,
          border,
          boxShadow,
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
            <div className={`panel-form-group ${selQuiz ? 'maze-game-quiz__form-group--quiz-selected' : 'maze-game-quiz__form-group--no-quiz'}`}>
              <label className="panel-label">Select Quiz</label>
              <select
                className="panel-select"
                value={selectedQuizId}
                onChange={e => setSelectedQuizId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Choose a quiz from your library…</option>
                {quizList.map(q => {
                  const n = countPlayableQuestions(q.questions)
                  return (
                    <option key={q.id} value={q.id} disabled={n === 0}>
                      {q.title} ({n} playable{n === 0 ? ', needs valid questions' : ''})
                      {q.class_title ? ` · ${q.class_title}` : ''}
                    </option>
                  )
                })}
              </select>
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
                  Add multiple-choice (2–4 options) or true/false questions to use this quiz.
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
            ▶ Start Game
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

  return (
    <div className="panel-page maze-game-quiz__page--playing">
      {/* Header */}
      <div className="maze-game-quiz__header">
        <div>
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
          <button className="panel-btn panel-btn-secondary panel-btn-sm" onClick={() => setPhase('paused')} title="Pause (ESC)">
            ⏸ Pause
          </button>
        </div>
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

      {/* Maze Grid */}
      <div className="maze-game-quiz__grid-wrap">
        <div className="maze-game-quiz__grid-container">
          <div
            className={`maze-game-quiz__grid${phase === 'at-gate' ? ' maze-game-quiz__grid--dimmed' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${ROWS}, ${cellPx}px)`,
            }}
          >
            {Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => renderCell(r, c)))}
          </div>
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

      <GameTouchControls
        onDirection={handleTouchDirection}
        onPause={handleTouchPause}
        showPause={phase === 'playing' || phase === 'paused'}
      />

      {/* Controls hint */}
      <div className="maze-game-quiz__hint-wrap">
        <p className={`panel-meta maze-game-quiz__hint-text game-controls-hint--desktop${ghostCaught ? ' maze-game-quiz__hint-text--caught' : ''}`}>
          {ghostCaught ? '😵 Stunned! Wait 2 seconds…'
            : phase === 'at-gate' ? '🚪 Answer the gate question in the popup'
            : 'Find the 🚪 gate · Arrow keys or WASD · ESC to pause'}
        </p>
        <p className={`panel-meta maze-game-quiz__hint-text game-controls-hint--mobile${ghostCaught ? ' maze-game-quiz__hint-text--caught' : ''}`}>
          {ghostCaught ? '😵 Stunned! Wait 2 seconds…'
            : phase === 'at-gate' ? '🚪 Answer the gate question in the popup'
            : 'Use the on-screen pad to move · Tap ⏸ to pause'}
        </p>
        <div className="maze-game-quiz__legend">
          <span>🧑 You</span>
          <span>🚪 Gate (locked)</span>
          <span>✓ Gate (open)</span>
          <span>⭐ Exit</span>
          {ghostEnabled && <span>👻 Ghost</span>}
        </div>
      </div>
    </div>
  )
}
