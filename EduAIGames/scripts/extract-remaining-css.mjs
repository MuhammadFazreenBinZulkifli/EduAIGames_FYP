/**
 * Batch CSS extraction for remaining component TSX files.
 * Run: node scripts/extract-remaining-css.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentsDir = path.join(__dirname, '../src/components')

// Common replacements across multiple files (order matters - longer first)
const COMMON = [
  [`className="panel-hero" style={{ marginBottom: 0, flex: 1 }}`, `className="panel-hero game-quiz__hero"`],
  [`className="panel-meta" style={{ margin: '0 0 0.75rem' }}`, `className="panel-meta game-quiz__intro-meta"`],
  [`className="panel-meta" style={{ marginBottom: '0.75rem' }}`, `className="panel-meta game-quiz__intro-meta"`],
  [`className="panel-meta" style={{ marginBottom: '1.25rem' }}`, `className="panel-meta game-quiz__modal-meta"`],
  [`className="panel-meta" style={{ margin: 0 }}`, `className="panel-meta game-quiz__modal-summary"`],
  [`className="panel-row" style={{ gap: '0.65rem' }}`, `className="panel-row game-quiz__modal-actions"`],
  [`className="panel-btn panel-btn-secondary" style={{ flex: 1 }}`, `className="panel-btn panel-btn-secondary game-quiz__btn-flex"`],
  [`className="panel-btn panel-btn-primary" style={{ flex: 1 }}`, `className="panel-btn panel-btn-primary game-quiz__btn-flex"`],
  [`className="panel-empty" style={{ padding: '0.75rem 0' }}`, `className="panel-empty game-quiz__empty-compact"`],
  [`className="panel-form-group" style={{ marginBottom: selQuiz ? '0.75rem' : 0 }}`, `className="panel-form-group game-quiz__quiz-select-group"`],
  [`className="panel-form-group" style={{ marginBottom: 0 }}`, `className="panel-form-group game-quiz__form-group-flush"`],
  [`style={{ marginBottom: '0.75rem' }}`, `className="game-quiz__mb-75"`],
  [`style={{ marginBottom: '1rem' }}`, `className="game-quiz__mb-1"`],
  [`style={{ marginTop: '0.5rem' }}`, `className="game-quiz__mt-50"`],
  [`style={{ marginTop: '0.75rem' }}`, `className="game-quiz__mt-75"`],
  [`style={{ flex: 1 }}`, `className="game-quiz__flex-1"`],
  [`style={{ textDecoration: 'none' }}`, `className="game-quiz__no-underline"`],
  [`style={{ gap: '0.5rem', flexWrap: 'wrap' }}`, `className="game-quiz__row-wrap"`],
  [`style={{ gap: '0.35rem', flexShrink: 0 }}`, `className="game-quiz__actions"`],
  [`style={{ flex: 1, minWidth: 0 }}`, `className="game-quiz__flex-min"`],
]

const GAME_QUIZ_CSS = `
/* Shared game-quiz utility classes (per-component CSS files) */
.game-quiz__hero { margin-bottom: 0; flex: 1; }
.game-quiz__intro-meta { margin: 0 0 0.75rem; }
.game-quiz__modal-meta { margin-bottom: 1.25rem; }
.game-quiz__modal-summary { margin: 0; }
.game-quiz__modal-actions { gap: 0.65rem; }
.game-quiz__btn-flex { flex: 1; }
.game-quiz__empty-compact { padding: 0.75rem 0; }
.game-quiz__quiz-select-group { margin-bottom: 0.75rem; }
.game-quiz__form-group-flush { margin-bottom: 0; }
.game-quiz__mb-75 { margin-bottom: 0.75rem; }
.game-quiz__mb-1 { margin-bottom: 1rem; }
.game-quiz__mt-50 { margin-top: 0.5rem; }
.game-quiz__mt-75 { margin-top: 0.75rem; }
.game-quiz__flex-1 { flex: 1; }
.game-quiz__no-underline { text-decoration: none; }
.game-quiz__row-wrap { gap: 0.5rem; flex-wrap: wrap; }
.game-quiz__actions { gap: 0.35rem; flex-shrink: 0; }
.game-quiz__flex-min { flex: 1; min-width: 0; }

.game-quiz__page-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.game-quiz__page-center--short { min-height: 50vh; }

.game-quiz__page-relative { position: relative; }

.game-quiz__loading-wrap { text-align: center; }

.game-quiz__loading-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.game-quiz__modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.game-quiz__modal {
  background: linear-gradient(145deg, #2a2438, #1e1a28);
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 14px;
  padding: 1.5rem;
  width: min(420px, 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.game-quiz__modal-title {
  color: #fff4e8;
  margin: 0 0 0.3rem;
  font-size: 1.2rem;
}

.game-quiz__modal-summary-box {
  padding: 0.75rem 1rem;
  background: rgba(167, 139, 250, 0.1);
  border: 1px solid rgba(167, 139, 250, 0.25);
  border-radius: 8px;
  margin-bottom: 1.25rem;
}

.game-quiz__quiz-title { color: #c4b5fd; font-weight: 700; margin: 0 0 0.25rem; }
.game-quiz__quiz-title--snake { color: #6ee7b7; }
.game-quiz__quiz-title--breakout { color: #22d3ee; }
.game-quiz__quiz-title--race { color: #fb7185; }

.game-quiz__strong-purple { color: #c4b5fd; }
.game-quiz__strong-green { color: #6ee7b7; }
.game-quiz__strong-cyan { color: #22d3ee; }
.game-quiz__strong-pink { color: #fb7185; }
.game-quiz__strong-ghost-on { color: #f0abfc; }
.game-quiz__strong-ghost-off { color: #6b6075; }

.game-quiz__settings-box {
  padding: 0.8rem 1rem;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.2);
  border-radius: 10px;
}

.game-quiz__settings-row {
  display: flex;
  gap: 1.2rem;
  flex-wrap: wrap;
}

.game-quiz__error-meta { margin: 0.5rem 0 0; color: #f87171; }

.game-quiz__toggle-label {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  cursor: pointer;
  color: #e2d9f3;
}

.game-quiz__toggle-input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: #a78bfa;
  cursor: pointer;
  flex-shrink: 0;
}

.game-quiz__toggle-title { font-weight: 600; }
.game-quiz__toggle-desc { margin: 0.15rem 0 0; }

.game-quiz__question-title {
  color: #fff4e8;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.game-quiz__explanation-text {
  font-size: 0.76rem;
  color: #a78bfa;
  margin: 0;
}

.game-quiz__canvas-wrap { position: relative; }
.game-quiz__canvas { display: block; }

.game-quiz__hud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}

.game-quiz__hud-item {
  font-size: 0.82rem;
  color: #9993a3;
}

.game-quiz__hud-value {
  color: #ffb37a;
  font-weight: 700;
}

.game-quiz__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  border-radius: inherit;
}

.game-quiz__overlay-card {
  text-align: center;
  padding: 1.5rem 2rem;
  background: rgba(30, 26, 40, 0.95);
  border: 1px solid rgba(167, 139, 250, 0.35);
  border-radius: 12px;
}

.game-quiz__overlay-title {
  color: #fff4e8;
  margin: 0 0 0.5rem;
  font-size: 1.3rem;
}

.game-quiz__overlay-sub {
  color: #9993a3;
  margin: 0 0 1rem;
  font-size: 0.88rem;
}

.game-quiz__grid-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.game-quiz__cell-text {
  font-weight: 400;
  color: #9993a3;
  margin-left: 0.4rem;
  font-size: 0.78rem;
}

.game-quiz__save-row { margin-top: 0.4rem; }
.game-quiz__form-row { gap: 0.5rem; flex-wrap: wrap; }
.game-quiz__nav-row { gap: 0.4rem; flex-wrap: wrap; }
.game-quiz__btn-row { margin-top: 0.5rem; }
.game-quiz__btn-row-gap { gap: 0.5rem; }
.game-quiz__hero-row { gap: 0.5rem; }
.game-quiz__list-header { margin-bottom: 0.75rem; }
.game-quiz__card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.game-quiz__card-kicker { margin-bottom: 0.25rem; }
.game-quiz__card-title {
  margin: 0;
  color: #fff4e8;
  font-size: 1.15rem;
}
.game-quiz__alert-mb { margin-bottom: 1rem; }
.game-quiz__alert-mt { margin-top: 1rem; }
.game-quiz__btn-min { min-width: 150px; }
.game-quiz__progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}
.game-quiz__timer-text {
  font-size: 0.78rem;
  color: #9993a3;
  margin-top: -0.5rem;
  margin-bottom: 0.75rem;
}
`

function ensureImport(content, cssFile, isAdmin = false) {
  const importPath = isAdmin ? `'../App_CSS/${cssFile}'` : `'./App_CSS/${cssFile}'`
  if (content.includes(cssFile)) return content
  const lines = content.split('\n')
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImport = i
  }
  lines.splice(lastImport + 1, 0, `import ${importPath}`)
  return lines.join('\n')
}

function applyCommon(content) {
  let c = content
  for (const [from, to] of COMMON) {
    if (from.startsWith('style=')) {
      c = c.replaceAll(` ${from}`, ` className="${to.replace('className="', '').replace('"', '')}"`)
    } else {
      c = c.replaceAll(from, to)
    }
  }
  return c
}

const FILES = [
  { tsx: 'QuizCreation.tsx', css: 'QuizCreation_CSS.css', admin: false },
  { tsx: 'StudentGrades.tsx', css: 'StudentGrades_CSS.css', admin: false },
  { tsx: 'QuizAnswering.tsx', css: 'QuizAnswering_CSS.css', admin: false },
  { tsx: 'QuizPreview.tsx', css: 'QuizPreview_CSS.css', admin: false },
  { tsx: 'AIQuizGenerator.tsx', css: 'AIQuizGenerator_CSS.css', admin: false },
  { tsx: 'InstructorQuizLibrary.tsx', css: 'InstructorQuizLibrary_CSS.css', admin: false },
  { tsx: 'MazeGameQuiz.tsx', css: 'MazeGameQuiz_CSS.css', admin: false },
  { tsx: 'SnakeGameQuiz.tsx', css: 'SnakeGameQuiz_CSS.css', admin: false },
  { tsx: 'BreakoutGameQuiz.tsx', css: 'BreakoutGameQuiz_CSS.css', admin: false },
  { tsx: 'TriviaRaceGameQuiz.tsx', css: 'TriviaRaceGameQuiz_CSS.css', admin: false },
]

for (const { tsx, css, admin } of FILES) {
  const tsxPath = path.join(componentsDir, tsx)
  const cssPath = path.join(componentsDir, 'App_CSS', css)
  if (!fs.existsSync(tsxPath)) continue

  let content = fs.readFileSync(tsxPath, 'utf8')
  content = applyCommon(content)
  content = ensureImport(content, css, admin)

  // Write CSS if game file and doesn't exist or is empty
  if (tsx.includes('GameQuiz') && !fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, `/* ${tsx.replace('.tsx', '')} styles */\n${GAME_QUIZ_CSS}\n`)
  }

  fs.writeFileSync(tsxPath, content)
  const remaining = (content.match(/style=\{\{/g) || []).length + (content.match(/style=\{[a-zA-Z]/g) || []).length
  console.log(`${tsx}: ${remaining} inline styles remain`)
}

console.log('Phase 1 common replacements done.')
