/**
 * Finish CSS extraction – apply className replacements to remaining TSX files.
 * Run: node scripts/finish-css-extraction.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentsDir = path.join(__dirname, '../src/components')

function countStyles(content) {
  return (content.match(/style=\{\{/g) || []).length + (content.match(/style=\{[a-zA-Z_]/g) || []).length
}

function applyReplacements(content, replacements) {
  let c = content
  for (const [from, to] of replacements) {
    c = c.split(from).join(to)
  }
  return c
}

// ─── SnakeGameQuiz ───────────────────────────────────────────────────────────
const SNAKE = [
  [`className="panel-meta" style={{ margin: '0 0 0.75rem' }}`, `className="panel-meta snake-game-quiz__section-meta"`],
  [`className="panel-empty" style={{ padding: '0.75rem 0' }}`, `className="panel-empty snake-game-quiz__empty"`],
  [`className="panel-form-group" style={{ marginBottom: selQuiz ? '0.75rem' : 0 }}`, `className={\`panel-form-group \${selQuiz ? 'snake-game-quiz__form-group--quiz-selected' : 'snake-game-quiz__form-group--no-quiz'}\`}`],
  [`<div style={{ padding: '0.8rem 1rem', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10 }}>`, `<div className="snake-game-quiz__quiz-preview">`],
  [`<p style={{ color: '#6ee7b7', fontWeight: 700, margin: '0 0 0.25rem' }}>`, `<p className="snake-game-quiz__quiz-preview-title">`],
  [`<p className="panel-meta" style={{ margin: '0 0 0.4rem' }}>`, `<p className="panel-meta snake-game-quiz__quiz-preview-desc">`],
  [`<div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>`, `<div className="snake-game-quiz__quiz-preview-stats">`],
  [`<p className="panel-meta" style={{ margin: '0.5rem 0 0', color: '#f87171' }}>`, `<p className="panel-meta snake-game-quiz__quiz-preview-error">`],
  [`className="panel-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}`, `className="panel-grid snake-game-quiz__settings-grid"`],
  [`className="panel-form-group" style={{ marginBottom: 0 }}`, `className="panel-form-group snake-game-quiz__form-group--compact"`],
  [`<label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', color: '#e2d9f3', marginTop: '1rem' }}>`, `<label className="snake-game-quiz__checkbox-label">`],
  [`style={{ width: 18, height: 18, marginTop: 2, accentColor: '#34d399', cursor: 'pointer', flexShrink: 0 }}`, `className="snake-game-quiz__checkbox"`],
  [`<span style={{ fontWeight: 600 }}>Enable Hunter Enemy 👾</span>`, `<span className="snake-game-quiz__checkbox-title">Enable Hunter Enemy 👾</span>`],
  [`<p className="panel-meta" style={{ margin: '0.15rem 0 0' }}>`, `<p className="panel-meta snake-game-quiz__checkbox-desc">`],
  [`className="panel-card" style={{ background: 'rgba(52,211,153,0.05)', borderColor: 'rgba(52,211,153,0.18)' }}`, `className="panel-card snake-game-quiz__howto-card"`],
  [`<ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#6ee7b7', lineHeight: 2, fontSize: '0.88rem' }}>`, `<ul className="snake-game-quiz__howto-list">`],
  [`<strong style={{ color: '#fff4e8' }}>`, `<strong className="snake-game-quiz__howto-strong-light">`],
  [`<strong style={{ color: '#4ade80' }}>`, `<strong className="snake-game-quiz__howto-strong-fruit">`],
  [`<strong style={{ color: '#d946ef' }}>`, `<strong className="snake-game-quiz__howto-strong-hunter">`],
  [`className="panel-row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}`, `className="panel-row snake-game-quiz__actions"`],
  [`style={{ flex: '1 1 160px', fontSize: '1rem', padding: '0.8rem 1.5rem' }}`, `className="snake-game-quiz__action-btn"`],
  [`className="panel-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}`, `className="panel-page snake-game-quiz__page--centered"`],
  [`<div style={{ textAlign: 'center', color: '#94a3b8' }}>`, `<div className="snake-game-quiz__loading-inner">`],
  [`<div style={{ fontSize: 48, marginBottom: 16 }}>🐍</div>`, `<div className="snake-game-quiz__loading-icon">🐍</div>`],
  [`className="panel-card" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}`, `className="panel-card snake-game-quiz__end-card"`],
  [`className="panel-card" style={{ maxWidth: 500, width: '100%', textAlign: 'center' }}`, `className="panel-card snake-game-quiz__end-card snake-game-quiz__end-card--wide"`],
  [`className="panel-card" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}`, `className="panel-card snake-game-quiz__end-card snake-game-quiz__end-card--level"`],
  [`<div style={{ fontSize: 56, marginBottom: 8 }}>💀</div>`, `<div className="snake-game-quiz__end-icon">💀</div>`],
  [`<div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>`, `<div className="snake-game-quiz__end-icon">🏆</div>`],
  [`<div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>`, `<div className="snake-game-quiz__end-icon snake-game-quiz__end-icon--level">✅</div>`],
  [`<h2 style={{ color: '#ef4444', margin: '0 0 8px' }}>Game Over</h2>`, `<h2 className="snake-game-quiz__end-title--over">Game Over</h2>`],
  [`<h2 style={{ color: '#4ade80', margin: '0 0 4px' }}>Quest Complete!</h2>`, `<h2 className="snake-game-quiz__end-title--complete">Quest Complete!</h2>`],
  [`<h2 style={{ color: '#4ade80', margin: '0 0 8px' }}>Correct!</h2>`, `<h2 className="snake-game-quiz__end-title--level">Correct!</h2>`],
  [`<p style={{ color: '#94a3b8', marginBottom: 24 }}>`, `<p className="snake-game-quiz__end-subtitle">`],
  [`<p style={{ color: '#94a3b8', marginBottom: 24 }}>{levelMsg}</p>`, `<p className="snake-game-quiz__end-subtitle snake-game-quiz__end-subtitle--level">{levelMsg}</p>`],
  [`<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>`, `<div className="snake-game-quiz__stats-grid">`],
  [`<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>`, `<div className="snake-game-quiz__stats-grid snake-game-quiz__stats-grid--level">`],
  [`className="panel-card" style={{ padding: '12px 16px' }}`, `className="panel-card snake-game-quiz__stat-card"`],
  [`className="panel-card" style={{ padding: 10 }}`, `className="panel-card snake-game-quiz__stat-card snake-game-quiz__stat-card--compact"`],
  [`<div style={{ color: '#94a3b8', fontSize: 12 }}>`, `<div className="snake-game-quiz__stat-label">`],
  [`<div style={{ color: '#94a3b8', fontSize: 11 }}>`, `<div className="snake-game-quiz__stat-label snake-game-quiz__stat-label--sm">`],
  [`<div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>`, `<div className="snake-game-quiz__score-label">`],
  [`<div style={{ color: '#e2e8f0', fontSize: 22, fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value">`],
  [`<div style={{ color: '#4ade80', fontSize: 22, fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--green">`],
  [`<div style={{ color: '#f87171', fontSize: 22, fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--red">`],
  [`<div style={{ color: '#fb923c', fontSize: 22, fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--orange">`],
  [`<div style={{ color: '#e2e8f0', fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--bold">`],
  [`<div style={{ color: '#f87171', fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--red snake-game-quiz__stat-value--bold">`],
  [`<div style={{ color: '#fb923c', fontWeight: 700 }}>`, `<div className="snake-game-quiz__stat-value snake-game-quiz__stat-value--orange snake-game-quiz__stat-value--bold">`],
  [`<div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '16px 24px', marginBottom: 20 }}>`, `<div className="snake-game-quiz__score-box">`],
  [`<div style={{ color: '#4ade80', fontSize: 42, fontWeight: 800 }}>`, `<div className="snake-game-quiz__score-value">`],
  [`<div style={{ display: 'flex', gap: 10 }}>`, `<div className="snake-game-quiz__end-actions">`],
  [`onClick={onExit}\n              style={{\n                flex: 1,\n                color: '#ffffff',\n                background: 'rgba(255,255,255,0.1)',\n                border: '1px solid rgba(255,255,255,0.35)',\n              }}`, `onClick={onExit}\n              className="snake-game-quiz__exit-btn"`],
  [`onClick={startGame} style={{ flex: 1 }}`, `onClick={startGame} className="snake-game-quiz__retry-btn"`],
  [`onClick={onExit} style={{ width: '100%' }}`, `onClick={onExit} className="snake-game-quiz__full-width-btn"`],
  [`onClick={continueNextLevel} style={{ width: '100%' }}`, `onClick={continueNextLevel} className="snake-game-quiz__full-width-btn"`],
  [`className="panel-page" style={{ alignItems: 'center', paddingBottom: 32 }}`, `className="panel-page snake-game-quiz__page--playing"`],
  [`<div style={{ width: boardW, maxWidth: '100%', margin: '0 auto' }}>`, `<div className="snake-game-quiz__board-wrap" style={{ width: boardW }}>`],
  [`<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>`, `<div className="snake-game-quiz__header">`],
  [`style={LIGHT_BTN}`, `className="snake-game-quiz__light-btn"`],
  [`style={{ ...LIGHT_BTN, padding: '10px 24px', fontSize: 15 }}`, `className="snake-game-quiz__light-btn snake-game-quiz__light-btn--lg"`],
  [`<h2 style={{ margin: 0, color: '#4ade80', fontSize: 18, textAlign: 'center', flex: 1 }}>`, `<h2 className="snake-game-quiz__title">`],
  [`<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>`, `<div className="snake-game-quiz__hud">`],
  [`<div style={{ background: '#0f1f14', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#94a3b8' }}>`, `<div className="snake-game-quiz__hud-chip">`],
  [`<div style={{ background: '#0f1f14', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#94a3b8', display: 'flex', gap: 4, alignItems: 'center' }}>`, `<div className="snake-game-quiz__hud-chip snake-game-quiz__hud-chip--lives">`],
  [`<strong style={{ color: '#e2e8f0' }}>`, `<strong className="snake-game-quiz__hud-strong">`],
  [`<strong style={{ color: '#f87171' }}>`, `<strong className="snake-game-quiz__hud-wrong">`],
  [`<strong style={{ color: '#fb923c' }}>`, `<strong className="snake-game-quiz__hud-penalty">`],
  [`<span style={{ color: '#ef4444', fontWeight: 700 }}>♥ ∞ Unlimited</span>`, `<span className="snake-game-quiz__hud-unlimited">♥ ∞ Unlimited</span>`],
  [`<div style={{ background: 'rgba(192,38,211,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#d946ef' }}>`, `<div className="snake-game-quiz__hud-hunter">`],
  [`<div style={{ background: 'rgba(192,38,211,0.1)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#c084fc' }}>`, `<div className="snake-game-quiz__hud-hunter-wait">`],
  [`<div style={{\n            width: '100%',\n            boxSizing: 'border-box',\n            background: '#0f1f14',\n            border: '1px solid rgba(52, 211, 153, 0.35)',\n            borderRadius: 10,\n            padding: '14px 16px',\n            marginBottom: 10,\n          }}>`, `<div className="snake-game-quiz__question-card">`],
  [`<div style={{ color: '#4ade80', fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>`, `<div className="snake-game-quiz__question-label">`],
  [`<div style={{ color: '#e2e8f0', fontSize: 15, marginBottom: 14, lineHeight: 1.55 }}>`, `<div className="snake-game-quiz__question-text">`],
  [`<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>`, `<div className="snake-game-quiz__options-grid">`],
  [`<span style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>`, `<span className="snake-game-quiz__option-text">`],
  [`<div style={{ position: 'relative', width: boardW, maxWidth: '100%' }}>`, `<div className="snake-game-quiz__grid-area" style={{ width: boardW }}>`],
  [`<div style={{\n              position: 'absolute', inset: 0,\n              background: 'rgba(0,0,0,0.55)', borderRadius: 10,\n              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',\n              gap: 10, pointerEvents: 'none',\n            }}>`, `<div className="snake-game-quiz__await-overlay">`],
  [`<div style={{ color: '#a7f3d0', fontSize: 16, fontWeight: 700 }}>`, `<div className="snake-game-quiz__await-title">`],
  [`<div style={{ color: '#94a3b8', fontSize: 13 }}>Timer begins on your first move</div>`, `<div className="snake-game-quiz__await-sub">Timer begins on your first move</div>`],
  [`<div style={{\n              position: 'absolute', inset: 0,\n              background: 'rgba(0,0,0,0.78)', borderRadius: 10,\n              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',\n              gap: 12,\n            }}>`, `<div className="snake-game-quiz__pause-overlay">`],
  [`<div style={{ fontSize: 36 }}>⏸</div>`, `<div className="snake-game-quiz__pause-icon">⏸</div>`],
  [`<div style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>Paused</div>`, `<div className="snake-game-quiz__pause-label">Paused</div>`],
  [`<div style={{ marginTop: 12, color: '#64748b', fontSize: 12, textAlign: 'center' }}>`, `<div className="snake-game-quiz__controls-hint">`],
]

// Color-prefix map for breakout (cyan) and trivia (pink) – derived from snake patterns
function gameReplacements(prefix, colors) {
  const { accent, accentRgb, hunterOn, strongAccent } = colors
  return SNAKE.map(([from, to]) => {
    let f = from
      .replace(/snake-game-quiz/g, prefix)
      .replace(/52,211,153/g, accentRgb)
      .replace(/52, 211, 153/g, accentRgb.replace(/,/g, ', '))
      .replace(/#6ee7b7/g, accent)
      .replace(/#4ade80/g, strongAccent)
      .replace(/#34d399/g, accent)
      .replace(/110, 231, 183/g, accentRgb)
    let t = to.replace(/snake-game-quiz/g, prefix)
    return [f, t]
  })
}

const BREAKOUT = gameReplacements('breakout-game-quiz', {
  accent: '#22d3ee',
  accentRgb: '34,211,238',
  hunterOn: '#d946ef',
  strongAccent: '#22d3ee',
})

const TRIVIA = gameReplacements('trivia-race-game-quiz', {
  accent: '#fb7185',
  accentRgb: '251,113,133',
  hunterOn: '#d946ef',
  strongAccent: '#fb7185',
})

// Copy snake CSS to breakout/trivia with prefix/color substitution
function deriveCss(snakeCssPath, outPath, prefixFrom, prefixTo, colorMap) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) return
  let css = fs.readFileSync(snakeCssPath, 'utf8')
  css = css.replaceAll(prefixFrom, prefixTo)
  for (const [from, to] of Object.entries(colorMap)) {
    css = css.replaceAll(from, to)
  }
  fs.writeFileSync(outPath, css)
}

const cssDir = path.join(componentsDir, 'App_CSS')
deriveCss(
  path.join(cssDir, 'SnakeGameQuiz_CSS.css'),
  path.join(cssDir, 'BreakoutGameQuiz_CSS.css'),
  'snake-game-quiz',
  'breakout-game-quiz',
  {
    'rgba(52, 211, 153': 'rgba(34, 211, 238',
    'rgba(52,211,153': 'rgba(34,211,238',
    '#6ee7b7': '#22d3ee',
    '#4ade80': '#22d3ee',
    '#34d399': '#22d3ee',
    '#a7f3d0': '#a5f3fc',
    '#0f1f14': '#0f1a1f',
    '#071009': '#070f12',
    'rgba(110, 231, 183': 'rgba(34, 211, 238',
    'rgba(16, 185, 129': 'rgba(6, 182, 212',
  }
)
deriveCss(
  path.join(cssDir, 'SnakeGameQuiz_CSS.css'),
  path.join(cssDir, 'TriviaRaceGameQuiz_CSS.css'),
  'snake-game-quiz',
  'trivia-race-game-quiz',
  {
    'rgba(52, 211, 153': 'rgba(251, 113, 133',
    'rgba(52,211,153': 'rgba(251,113,133',
    '#6ee7b7': '#fb7185',
    '#4ade80': '#fb7185',
    '#34d399': '#fb7185',
    '#a7f3d0': '#fecdd3',
    '#0f1f14': '#1f0f14',
    '#071009': '#120709',
    'rgba(110, 231, 183': 'rgba(251, 113, 133',
    'rgba(16, 185, 129': 'rgba(244, 63, 94',
  }
)

function ensureImport(content, cssFile) {
  if (content.includes(cssFile)) return content
  const lines = content.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImport = i
  }
  lines.splice(lastImport + 1, 0, `import './App_CSS/${cssFile}'`)
  return lines.join('\n')
}

function processFile(tsxName, cssName, replacements, extraFn) {
  const tsxPath = path.join(componentsDir, tsxName)
  if (!fs.existsSync(tsxPath)) return
  let content = fs.readFileSync(tsxPath, 'utf8')
  content = applyReplacements(content, replacements)
  if (extraFn) content = extraFn(content)
  content = ensureImport(content, cssName)
  // Fix duplicate className on buttons that got both panel-btn and action-btn
  content = content.replace(/className="panel-btn panel-btn-success"\n            type="button"\n            onClick={startGame}\n            disabled=[^\n]+\n            className="([^"]+)"/g,
    (m, cls) => m.replace(/\n            className="[^"]+"/, `\n            className="panel-btn panel-btn-success ${cls}"`))
  content = content.replace(/className="panel-btn panel-btn-secondary"\n            type="button"\n            onClick={openSaveDialog}\n            disabled=[^\n]+\n            className="([^"]+)"/g,
    (m, cls) => m.replace(/\n            className="[^"]+"/, `\n            className="panel-btn panel-btn-secondary ${cls}"`))
  fs.writeFileSync(tsxPath, content)
  console.log(`${tsxName}: ${countStyles(content)} inline styles remain`)
}

// Snake option rows and fruit badges – dynamic colors kept inline
function fixSnakeFruitRows(content) {
  return content.replace(
    /<div key={i} style=\{\{\s*display: 'flex', alignItems: 'center', gap: 8,\s*background: `\$\{FRUIT_COLORS\[f\.optionIndex % FRUIT_COLORS\.length\]\}18`,\s*border: `1px solid \$\{FRUIT_COLORS\[f\.optionIndex % FRUIT_COLORS\.length\]\}55`,\s*borderRadius: 8, padding: '8px 10px',\s*minWidth: 0,\s*\}\}>/g,
    `<div key={i} className="snake-game-quiz__option-row" style={{
                  background: \`\${FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length]}18\`,
                  border: \`1px solid \${FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length]}55\`,
                }}>`
  ).replace(
    /<span style=\{\{\s*color: '#fff',\s*width: 22, height: 22, borderRadius: '50%',\s*display: 'inline-flex', alignItems: 'center', justifyContent: 'center',\s*fontSize: 11, fontWeight: 800, flexShrink: 0,\s*background: FRUIT_COLORS\[f\.optionIndex % FRUIT_COLORS\.length\],\s*\}\}>/g,
    `<span className="snake-game-quiz__option-badge" style={{ background: FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length] }}>`
  ).replace(
    /<span key={i} style=\{\{ color: alive \? '#ef4444' : '#374151' \}\}>♥<\/span>/g,
    `<span key={i} className={alive ? 'snake-game-quiz__hud-heart--alive' : 'snake-game-quiz__hud-heart--dead'}>♥</span>`
  )
}

processFile('SnakeGameQuiz.tsx', 'SnakeGameQuiz_CSS.css', SNAKE, fixSnakeFruitRows)

function fixGameFruitRows(content, prefix) {
  return content
    .replace(
      new RegExp(`<div key={i} style=\\{\\{\\s*display: 'flex', alignItems: 'center', gap: 8,\\s*background: \`\\$\\{FRUIT_COLORS\\[f\\.optionIndex % FRUIT_COLORS\\.length\\]\\}18\`,\\s*border: \`1px solid \\$\\{FRUIT_COLORS\\[f\\.optionIndex % FRUIT_COLORS\\.length\\]\\}55\`,\\s*borderRadius: 8, padding: '8px 10px',\\s*minWidth: 0,\\s*\\}\\}>`, 'g'),
      `<div key={i} className="${prefix}__option-row" style={{
                  background: \`\${FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length]}18\`,
                  border: \`1px solid \${FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length]}55\`,
                }}>`
    )
    .replace(
      new RegExp(`<span style=\\{\\{\\s*color: '#fff',\\s*width: 22, height: 22, borderRadius: '50%',\\s*display: 'inline-flex', alignItems: 'center', justifyContent: 'center',\\s*fontSize: 11, fontWeight: 800, flexShrink: 0,\\s*background: FRUIT_COLORS\\[f\\.optionIndex % FRUIT_COLORS\\.length\\],\\s*\\}\\}>`, 'g'),
      `<span className="${prefix}__option-badge" style={{ background: FRUIT_COLORS[f.optionIndex % FRUIT_COLORS.length] }}>`
    )
}

processFile('BreakoutGameQuiz.tsx', 'BreakoutGameQuiz_CSS.css', BREAKOUT, (c) => fixGameFruitRows(c, 'breakout-game-quiz'))
processFile('TriviaRaceGameQuiz.tsx', 'TriviaRaceGameQuiz_CSS.css', TRIVIA, (c) => fixGameFruitRows(c, 'trivia-race-game-quiz'))

// Fix MazeGameQuiz unused React import
const mazePath = path.join(componentsDir, 'MazeGameQuiz.tsx')
let maze = fs.readFileSync(mazePath, 'utf8')
maze = maze.replace(/^import React, /, 'import ')
fs.writeFileSync(mazePath, maze)
console.log(`MazeGameQuiz.tsx: ${countStyles(maze)} inline styles remain`)

console.log('Done.')
