/**
 * Batch-extract inline styles from component TSX files into App_CSS/*.css
 * Run: node scripts/extract-styles.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentsDir = path.join(__dirname, '../src/components')
const cssDir = path.join(componentsDir, 'App_CSS')

const FILES = [
  'StudentCourses.tsx',
  'QuizCreation.tsx',
  'QuizReviewSection.tsx',
  'StudentGrades.tsx',
  'QuizAnswering.tsx',
  'QuizPreview.tsx',
  'AIQuizGenerator.tsx',
  'InstructorQuizLibrary.tsx',
  'BreakoutGameQuiz.tsx',
  'TriviaRaceGameQuiz.tsx',
  'MazeGameQuiz.tsx',
  'SnakeGameQuiz.tsx',
]

function camelToKebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase()
}

function jsValueToCss(key, value) {
  const k = camelToKebab(key)
  if (typeof value === 'number') {
    const unitless = ['opacity', 'z-index', 'font-weight', 'flex', 'flex-grow', 'flex-shrink', 'line-height', 'order']
    if (unitless.some(u => k.includes(u)) || key === 'flex') return `${k}: ${value}`
    return `${k}: ${value}px`
  }
  return `${k}: ${value}`
}

function parseStyleObject(str) {
  const props = {}
  // simple key: value pairs
  const re = /(\w+):\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^,}\n]+)/g
  let m
  while ((m = re.exec(str)) !== null) {
    let val = m[2].trim()
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1)
    } else if (/^\d+$/.test(val)) {
      val = Number(val)
    }
    props[m[1]] = val
  }
  return props
}

function hashStyle(props) {
  return Object.entries(props).sort().map(([k,v]) => `${k}:${v}`).join('|')
}

function processFile(filename) {
  const tsxPath = path.join(componentsDir, filename)
  if (!fs.existsSync(tsxPath)) {
    console.log('Skip (not found):', filename)
    return
  }

  let content = fs.readFileSync(tsxPath, 'utf8')
  if (content.includes('style={{')) {
    console.log('Needs manual/special handling:', filename, '- inline styles remain')
  } else {
    console.log('Already clean:', filename)
  }
}

for (const f of FILES) processFile(f)
console.log('Done audit.')
