/**
 * Phase 2: replace remaining OS spread patterns in AdminDashboard.tsx
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/components/AdminDashboard.tsx')
let c = fs.readFileSync(file, 'utf8')

// CellText
c = c.replace(
  /className="admin-os__cell-text"/.test(c) ? 'SKIP' : `className="admin-os__cell-text"`,
)
c = c.replace(
  `      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        minWidth: 0,
      }}`,
  `      className="admin-os__cell-text"`
)

// Super badge & tab count (multiline)
c = c.replace(
  /<span style=\{\{\s*fontSize: '0\.72rem', fontWeight: 700, letterSpacing: '0\.06em',\s*background: '#7c2d12', color: '#fde68a', padding: '3px 10px', borderRadius: 4,\s*\}\}>SUPER ADMIN<\/span>/,
  `<span className="admin-os__super-badge">SUPER ADMIN</span>`
)
c = c.replace(
  /<span style=\{\{\s*marginLeft: '0\.4rem', fontSize: '0\.72rem', fontWeight: 400,\s*background: 'rgba\(255,255,255,0\.12\)', padding: '1px 6px', borderRadius: 8, color: '#94a3b8',\s*\}\}>/g,
  `<span className="admin-os__tab-count">`
)

// Search wrappers
c = c.replaceAll(
  `<div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>⌕</span>`,
  `<div className="admin-os__search-wrap">
                <span className="admin-os__search-icon">⌕</span>`
)

// Toolbar counts
c = c.replaceAll(
  `<span style={{ color: '#6b7280', fontSize: '0.82rem', fontFamily: '"Georgia", serif' }}>`,
  `<span className="admin-os__toolbar-count">`
)

// OS spread replacements
const spreads = [
  [`style={{ ...OS.th, ...(i === 0 ? { padding: '0.65rem 0.4rem', textAlign: 'center' } : {}) }}`, `className={i === 0 ? 'admin-os__th admin-os__th--checkbox' : 'admin-os__th'}`],
  [`style={{ ...OS.td, textAlign: 'center', color: '#9ca3af', padding: '2rem' }}`, `className="admin-os__td admin-os__td--empty"`],
  [`style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}`, ``],
  [`style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}`, ``],
  [`style={{ ...OS.td, textAlign: 'center' }}`, `className="admin-os__td admin-os__td--center"`],
  [`style={{ ...OS.td, ...OS.tdNum }}`, `className="admin-os__td admin-os__td-num"`],
  [`style={{ ...OS.td, overflow: 'hidden', maxWidth: 0 }}`, `className="admin-os__td admin-os__td--overflow"`],
  [`style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}`, `className="admin-os__user-cell"`],
  [`style={{ ...OS.td, ...OS.tdClamp, color: '#6b7280' }}`, `className="admin-os__td admin-os__td-clamp admin-os__td--muted"`],
  [`style={{ ...OS.td, color: '#6b7280', whiteSpace: 'nowrap' }}`, `className="admin-os__td admin-os__td--muted admin-os__td--nowrap"`],
  [`style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}`, `className="admin-os__row-actions admin-os__row-actions--sm"`],
  [`style={{ ...OS.btnSecondary, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-secondary admin-os__btn-xs"`],
  [`style={{ ...OS.btnSuccess, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-success admin-os__btn-xs"`],
  [`style={{ ...OS.btnDanger, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-danger admin-os__btn-xs"`],
  [`style={{ color: '#d1d5db', fontSize: '0.78rem' }}`, `className="admin-os__protected-label"`],
  [`style={{ ...OS.td, fontWeight: 600 }}`, `className="admin-os__td admin-os__td--bold"`],
  [`style={{ ...OS.td, color: '#6b7280' }}`, `className="admin-os__td admin-os__td--muted"`],
  [`style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}`, `className="admin-os__row-actions"`],
  [`style={{ ...OS.btnSuccess, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-success admin-os__btn-sm"`],
  [`style={{ ...OS.btnDanger, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-danger admin-os__btn-sm"`],
  [`style={{ ...OS.btnSecondary, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-secondary admin-os__btn-sm"`],
  [`style={{ ...OS.td, color: '#9ca3af', width: 40 }}`, `className="admin-os__td admin-os__td--index"`],
  [`style={{ ...OS.td, fontWeight: 600, color: '#1a1a2e' }}`, `className="admin-os__td admin-os__td--bold"`],
  [`style={{ ...OS.td, ...OS.tdClamp, color: '#6b7280' }}`, `className="admin-os__td admin-os__td-clamp admin-os__td--muted"`],
  [`style={{ ...OS.td, ...OS.tdClamp }}`, `className="admin-os__td admin-os__td-clamp"`],
  [`style={{ ...OS.td, fontFamily: 'monospace', fontSize: '0.82rem', color: '#374151' }}`, `className="admin-os__td admin-os__td--mono"`],
  [`style={{ display: 'flex', gap: '0.35rem' }}`, `className="admin-os__row-actions"`],
  [`style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '1.25rem' }}`, `className="admin-os__import-actions"`],
  [`style={{ ...OS.btnPrimary, cursor: 'pointer', margin: 0, fontWeight: 700 }}`, `className="admin-os__btn-primary admin-os__import-file-label"`],
  [`style={{ display: 'none' }}`, `className="admin-os__import-file-input"`],
  [`style={{ alignSelf: 'center', fontFamily: '"Georgia", serif', fontSize: '0.85rem', color: '#374151' }}`, `className="admin-os__import-file-name"`],
  [`style={{ ...OS.tableWrap, marginBottom: '1rem' }}`, `className="admin-os__table-wrap admin-os__import-preview"`],
  [`style={{ ...OS.td, color: '#9ca3af' }}`, `className="admin-os__td admin-os__td--index"`],
  [`style={{ ...OS.td, color: '#d1d5db', letterSpacing: '0.15em' }}`, `className="admin-os__td admin-os__td--password"`],
  [`style={{ ...OS.importMeta, marginBottom: '0.75rem' }}`, `className="admin-os__import-meta admin-os__import-meta--compact"`],
  [`style={{ ...OS.btnSuccess, padding: '0.55rem 1.5rem', fontSize: '0.95rem' }}`, `className="admin-os__btn-success admin-os__btn-import"`],
  [`style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid #86efac', borderRadius: 5, background: '#f0fdf4' }}`, `className="admin-os__import-summary"`],
  [`style={{ margin: '0 0 0.35rem', fontWeight: 700, color: '#14532d', fontFamily: '"Georgia", serif' }}`, `className="admin-os__import-summary-title"`],
  [`style={{ margin: 0, fontFamily: '"Georgia", serif', fontSize: '0.87rem', color: '#374151' }}`, `className="admin-os__import-summary-body"`],
  [`style={{ marginTop: '0.5rem', paddingLeft: '1.2rem', fontFamily: '"Georgia", serif', fontSize: '0.82rem', color: '#b91c1c' }}`, `className="admin-os__import-failures"`],
]

for (const [from, to] of spreads) {
  c = c.replaceAll(from, to)
}

// col widths
const cols = [
  [`style={{ width: 36 }}`, `className="admin-os__col-w36"`],
  [`style={{ width: 40 }}`, `className="admin-os__col-w40"`],
  [`style={{ width: 88 }}`, `className="admin-os__col-w88"`],
  [`style={{ width: 96 }}`, `className="admin-os__col-w96"`],
  [`style={{ width: 108 }}`, `className="admin-os__col-w108"`],
  [`style={{ width: '20%' }}`, `className="admin-os__col-pct20"`],
  [`style={{ width: '14%' }}`, `className="admin-os__col-pct14"`],
  [`style={{ width: '32%' }}`, `className="admin-os__col-pct32"`],
  [`style={{ width: '36%' }}`, `className="admin-os__col-pct36"`],
  [`style={{ width: '28%' }}`, `className="admin-os__col-pct28"`],
  [`style={{ width: '10%' }}`, `className="admin-os__col-pct10"`],
  [`style={{ width: '12%' }}`, `className="admin-os__col-pct12"`],
]
for (const [from, to] of cols) c = c.replaceAll(from, to)

// Avatar div - need to read the pattern
c = c.replace(
  /<div style=\{\{\s*width: 28, height: 28, borderRadius: '50%', flexShrink: 0,[\s\S]*?\}\}>/g,
  `<div className="admin-os__avatar">`
)

// Remaining style={{ ...OS.td }} alone
c = c.replaceAll(`className="admin-os__td"`, `className="admin-os__td"`)
c = c.replace(/style=\{\{ \.\.\.OS\.td \}\}/g, `className="admin-os__td"`)
c = c.replace(/style=\{\{ \.\.\.OS\.th \}\}/g, `className="admin-os__th"`)

// import fail strong
c = c.replace(
  `<strong style={{ color: importSummary.failed > 0 ? '#b91c1c' : 'inherit' }}>`,
  `<strong className={importSummary.failed > 0 ? 'admin-os__import-failures--warn' : ''}>`
)

fs.writeFileSync(file, c)
console.log('Phase 2 done. Remaining style={:', (c.match(/style=\{/g) || []).length)
