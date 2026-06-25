/** Human-readable lines for published game cards (student / instructor). */

export type GameType = 'maze' | 'snake' | 'breakout' | 'race'

export const GAME_TYPE_META: Record<GameType, { icon: string; label: string; color: string; bg: string }> = {
  maze: { icon: '🎮', label: 'Maze Quest', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  snake: { icon: '🐍', label: 'Snake Quest', color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  breakout: { icon: '🧱', label: 'Brick Breaker', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
  race: { icon: '🏃', label: 'Trivia Race', color: '#fb7185', bg: 'rgba(251,113,133,0.15)' },
}

export function gameTypeMeta(gameType: string) {
  return GAME_TYPE_META[(gameType as GameType)] ?? GAME_TYPE_META.maze
}

export function formatGameSettingsLines(
  gameType: GameType,
  settingsRaw: string,
  ghostEnabled: boolean
): string[] {
  let s: Record<string, unknown> = {}
  try {
    s = JSON.parse(settingsRaw || '{}') as Record<string, unknown>
  } catch {
    s = {}
  }

  const lines: string[] = []

  if (gameType === 'breakout') {
    const speed = s.ballSpeed as string | undefined
    const paddle = s.paddleSize as string | undefined
    const lives = s.lives as number | undefined
    lines.push('Format: Brick breaker (smash the answer)')
    if (speed) lines.push(`Ball speed: ${speed}`)
    if (paddle) lines.push(`Paddle: ${paddle}`)
    if (lives === -1) lines.push('Lives: Unlimited')
    else if (typeof lives === 'number') lines.push(`Lives: ${lives}`)
  } else if (gameType === 'race') {
    const speed = s.runSpeed as string | undefined
    const theme = s.theme as string | undefined
    const lives = s.lives as number | undefined
    const chaser = s.chaserEnabled as boolean | undefined
    lines.push('Format: Lane race (pick the answer lane)')
    if (speed) lines.push(`Run speed: ${speed}`)
    if (theme) lines.push(`Theme: ${theme}`)
    if (lives === -1) lines.push('Lives: Unlimited')
    else if (typeof lives === 'number') lines.push(`Lives: ${lives}`)
    lines.push(chaser ? 'Chaser: Enabled' : 'Chaser: Disabled')
  } else if (gameType === 'snake') {
    const grid = s.gridSize as string | undefined
    const speed = s.speed as string | undefined
    const difficulty = s.difficulty as string | undefined
    const lives = s.lives as number | undefined
    if (grid) lines.push(`Grid: ${grid} (18×${grid === 'small' ? 24 : grid === 'large' ? 36 : 30})`)
    if (speed) lines.push(`Speed: ${speed}`)
    if (difficulty) lines.push(`Difficulty: ${difficulty}`)
    if (lives === -1) lines.push('Lives: Unlimited')
    else if (typeof lives === 'number') lines.push(`Lives: ${lives}`)
    lines.push(ghostEnabled || s.hunterEnabled ? 'Hunter: Enabled' : 'Hunter: Disabled')
  } else {
    lines.push('Format: Maze quest (quiz gates)')
    lines.push(ghostEnabled ? 'Ghost: Enabled' : 'Ghost: Disabled')
  }

  return lines
}
