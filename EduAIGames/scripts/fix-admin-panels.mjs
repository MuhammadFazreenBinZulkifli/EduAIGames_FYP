/**
 * Fix AdminExtendedPanels.tsx — remove OS prop, replace all OS references
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/components/admin/AdminExtendedPanels.tsx')
let c = fs.readFileSync(file, 'utf8')

// Add panels CSS import
if (!c.includes('AdminExtendedPanels_CSS.css')) {
  c = c.replace(
    `import '../App_CSS/AdminDashboard_CSS.css'`,
    `import '../App_CSS/AdminDashboard_CSS.css'\nimport '../App_CSS/AdminExtendedPanels_CSS.css'`
  )
}

// Remove OSStyles, statCard
c = c.replace(/type OSStyles = Record<string, CSSProperties>\n\n/, '')
c = c.replace(/const statCard = \(\): CSSProperties => \(\{[\s\S]*?\}\)\n\n/, '')

// Remove OS from interfaces
c = c.replace(/\s+OS: OSStyles\n/g, '\n')
c = c.replace(/, OS: OSStyles/g, '')
c = c.replace(/OS: OSStyles;/g, '')

// Remove OS from function signatures
c = c.replace(/export function (\w+)\(\{ adminId, OS, /g, 'export function $1({ adminId, ')
c = c.replace(/function OverviewPanel\(\{ adminId, OS, /g, 'function OverviewPanel({ adminId, ')
c = c.replace(/function (\w+)\(\{ adminId, OS \}/g, 'function $1({ adminId }')
c = c.replace(/, OS, /g, ', ')
c = c.replace(/, OS \}/g, ' }')
c = c.replace(/\(OS\)/g, '()')
c = c.replace(/, OS\)/g, ')')

// AdminNotificationsBell signature
c = c.replace(
  /}: \{ adminId: number; OS: OSStyles; onOpenApprovals: \(\) => void \}\)/,
  '}: { adminId: number; onOpenApprovals: () => void })'
)
c = c.replace(
  /}: \{ adminId: number; userId: number; OS: OSStyles; onClose: \(\) => void \}\)/,
  '}: { adminId: number; userId: number; onClose: () => void })'
)

// Remove CSSProperties local vars - replace with class names
c = c.replace(/const card: CSSProperties = \{[\s\S]*?\}\n\n/g, '')
c = c.replace(/const chartCard: CSSProperties = \{[\s\S]*?\}\n\n/g, '')
c = c.replace(/const labelStyle: CSSProperties = \{[^}]+\}\n/g, '')
c = c.replace(/const box: CSSProperties = \{[\s\S]*?\}\n\n/g, '')

// OS style map
const osMap = {
  'OS.toolbar': 'admin-os__toolbar',
  'OS.btnSecondary': 'admin-os__btn-secondary',
  'OS.btnPrimary': 'admin-os__btn-primary',
  'OS.btnDanger': 'admin-os__btn-danger',
  'OS.btnSuccess': 'admin-os__btn-success',
  'OS.tableWrap': 'admin-os__table-wrap',
  'OS.table': 'admin-os__table',
  'OS.th': 'admin-os__th',
  'OS.td': 'admin-os__td',
  'OS.importBox': 'admin-os__import-box',
  'OS.importTitle': 'admin-os__import-title',
  'OS.importMeta': 'admin-os__import-meta',
  'OS.filterSelect': 'admin-os__filter-select',
  'OS.searchInput': 'admin-os__search-input',
  'OS.logoutBtn': 'admin-os__logout-btn',
}
for (const [from, cls] of Object.entries(osMap)) {
  c = c.replaceAll(`style={${from}}`, `className="${cls}"`)
}

// Spreads and conditionals
const replacements = [
  [`style={{ ...OS.td, textAlign: 'center', color: '#9ca3af' }}`, `className="admin-os__td admin-os__td--empty"`],
  [`style={{ ...OS.td, textAlign: 'center', color: '#9ca3af', padding: '2rem' }}`, `className="admin-os__td admin-os__td--empty"`],
  [`style={{ ...OS.td, color: '#6b7280' }}`, `className="admin-os__td admin-os__td--muted"`],
  [`style={{ ...OS.td, fontWeight: 600 }}`, `className="admin-os__td admin-os__td--bold"`],
  [`style={{ ...OS.td, whiteSpace: 'nowrap' }}`, `className="admin-os__td admin-os__td--nowrap"`],
  [`style={{ ...OS.td, fontSize: '0.78rem', color: '#6b7280' }}`, `className="admin-os__td admin-os__td--muted"`],
  [`style={{ background: i % 2 ? '#f8fafc' : '#fff' }}`, ``],
  [`style={{ background: idx % 2 ? '#f8fafc' : '#fff' }}`, ``],
  [`style={sub === 'games' ? OS.btnPrimary : OS.btnSecondary}`, `className={sub === 'games' ? 'admin-os__btn-primary' : 'admin-os__btn-secondary'}`],
  [`style={sub === 'materials' ? OS.btnPrimary : OS.btnSecondary}`, `className={sub === 'materials' ? 'admin-os__btn-primary' : 'admin-os__btn-secondary'}`],
  [`style={{ ...OS.importTitle, fontSize: '1.05rem', marginBottom: '0.35rem' }}`, `className="admin-os__import-title admin-panels__settings-heading"`],
  [`style={{ ...OS.importMeta, marginBottom: '0.85rem' }}`, `className="admin-os__import-meta"`],
  [`style={{ ...OS.importTitle, fontSize: '1rem' }}`, `className="admin-os__import-title admin-panels__settings-heading"`],
  [`style={{ ...OS.logoutBtn, position: 'relative' }}`, `className="admin-os__logout-btn admin-panels__notification-wrap"`],
  [`style={{ ...OS.btnPrimary, width: '100%', borderRadius: 0, margin: 0 }}`, `className="admin-os__btn-primary"`],
  [`style={{ ...OS.btnSecondary, marginTop: 12 }}`, `className="admin-os__btn-secondary"`],
  [`style={{ ...OS.searchInput, width: '100%', marginBottom: 8, paddingLeft: '0.7rem' }}`, `className="admin-os__search-input"`],
  [`style={{ ...OS.searchInput, width: '100%', maxWidth: 360, marginBottom: '1rem', paddingLeft: '0.7rem' }}`, `className="admin-os__search-input admin-panels__impersonate-search"`],
  [`style={{ ...OS.btnSuccess, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-success admin-os__btn-xs"`],
  [`style={{ ...OS.btnSecondary, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-secondary admin-os__btn-xs"`],
  [`style={{ ...OS.btnDanger, padding: '2px 8px', fontSize: '0.75rem' }}`, `className="admin-os__btn-danger admin-os__btn-xs"`],
  [`style={{ ...OS.btnPrimary, padding: '2px 10px', fontSize: '0.75rem' }}`, `className="admin-os__btn-primary admin-os__btn-xs"`],
  [`style={card}`, `className="admin-panels__kpi-card"`],
  [`style={chartCard}`, `className="admin-panels__chart-card"`],
  [`style={{ ...chartCard, marginBottom: '1.25rem' }}`, `className="admin-panels__chart-card admin-panels__chart-card--spaced"`],
  [`style={labelStyle}`, `className="admin-panels__checkbox-label"`],
  [`style={box}`, `className="admin-panels__danger-zone"`],
  [`style={{ fontFamily: '"Georgia", serif' }}`, `className="admin-panels__root"`],
  [`style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}`, `className="admin-panels__kpi-header"`],
  [`style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}`, `className="admin-panels__kpi-label"`],
  [`style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}`, `className="admin-panels__chart-header"`],
  [`style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a2e' }}`, `className="admin-panels__chart-title"`],
  [`style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a2e', marginBottom: '0.75rem' }}`, `className="admin-panels__chart-title admin-panels__chart-title--mb"`],
  [`style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#6b7280' }}`, `className="admin-panels__chart-legend"`],
  [`style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}`, `className="admin-panels__bar-chart"`],
  [`style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}`, `className="admin-panels__bar-col"`],
  [`style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', height: 110, gap: 1 }}`, `className="admin-panels__bar-stack"`],
  [`style={{ height: 2, background: '#e5e7eb', borderRadius: 2 }}`, `className="admin-panels__bar-empty"`],
  [`style={{ fontSize: '0.6rem', color: '#9ca3af', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}`, `className="admin-panels__bar-label"`],
  [`style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}`, `className="admin-panels__grid-2"`],
  [`style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}`, `className="admin-panels__donut-wrap"`],
  [`style={{ position: 'relative', flexShrink: 0 }}`, `className="admin-panels__donut-chart-wrap"`],
  [`style={{ transform: 'rotate(-90deg)' }}`, `className="admin-panels__donut-svg"`],
  [`style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}`, `className="admin-panels__legend-list"`],
  [`style={{ listStyle: 'none', margin: 0, padding: 0 }}`, `className="admin-panels__pending-list"`],
  [`style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}`, `className="admin-panels__empty-msg"`],
  [`style={{ fontFamily: '"Georgia", serif', fontSize: '0.85rem', color: '#374151' }}`, `className="admin-os__toolbar-count"`],
]
for (const [from, to] of replacements) c = c.replaceAll(from, to)

// Dynamic fail count - keep color inline is ok, use class + style for color only
c = c.replace(
  `style={{ ...OS.td, color: Number(q.fail_count) > 0 ? '#b91c1c' : 'inherit' }}`,
  `className="admin-os__td" style={{ color: Number(q.fail_count) > 0 ? '#b91c1c' : 'inherit' }}`
)

// KPI icon and value - dynamic colors stay as minimal inline
c = c.replace(
  /<span style=\{\{\s*width: 30, height: 30, borderRadius: 6, background: k\.bg,[\s\S]*?\}\}>\{k\.icon\}<\/span>/g,
  `<span className="admin-panels__kpi-icon" style={{ background: k.bg }}>{k.icon}</span>`
)
c = c.replace(
  /<div style=\{\{ fontSize: '1\.9rem', fontWeight: 700, color: k\.color, lineHeight: 1 \}\}>\{k\.value\}<\/div>/g,
  `<div className="admin-panels__kpi-value" style={{ color: k.color }}>{k.value}</div>`
)

// Donut center
c = c.replace(
  /<div style=\{\{\s*position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',[\s\S]*?\}\}>/g,
  `<div className="admin-panels__donut-center">`
)

// Legend items
c = c.replace(
  `style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.2rem 0', fontSize: '0.82rem' }}`,
  `className="admin-panels__legend-item"`
)
c = c.replace(
  `style={{ fontWeight: 700, color: '#374151' }}`,
  `className="admin-panels__legend-pct"`
)
c = c.replace(
  `style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: s.color, marginRight: 6 }}`,
  `className="admin-panels__legend-swatch" style={{ background: s.color }}`
)

// Bar chart dynamic heights - use class + style height
c = c.replace(
  `<div style={{ height: ih, background: '#2563eb', borderRadius: '2px 2px 0 0', opacity: 0.85 }}`,
  `<div className="admin-panels__bar-instructor" style={{ height: ih }}`
)
c = c.replace(
  `<div style={{ height: sh, background: '#059669', borderRadius: ih === 0 ? '2px 2px 0 0' : 0, opacity: 0.9 }}`,
  `<div className={\`admin-panels__bar-student\${ih === 0 ? ' admin-panels__bar-student--solo' : ''}\`} style={{ height: sh }}`
)

// Legend dots
c = c.replace(
  `<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#059669', marginRight: 4 }} />`,
  `<span className="admin-panels__legend-dot admin-panels__legend-dot--students" />`
)
c = c.replace(
  `<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#2563eb', marginRight: 4 }} />`,
  `<span className="admin-panels__legend-dot admin-panels__legend-dot--instructors" />`
)

// Review link
c = c.replace(
  `style={{ border: 'none', background: 'transparent', color: '#c2410c', fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"Georgia", serif', fontWeight: 700 }}`,
  `className="admin-panels__review-link"`
)

// Pending items - batch replace common patterns
c = c.replace(
  `style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem', gap: '0.5rem',
                }}`,
  `className="admin-panels__pending-item"`
)

// Remove unused useMemo if not used
if (!c.match(/useMemo\(/)) {
  c = c.replace('import { useEffect, useMemo, useState }', 'import { useEffect, useState }')
}

// Fix OverviewPanel OS param if still there
c = c.replace(/function OverviewPanel\(\{ adminId, OS, /, 'function OverviewPanel({ adminId, ')

fs.writeFileSync(file, c)
console.log('Fixed. Remaining OS refs:', (c.match(/\bOS\b/g) || []).length)
console.log('Remaining style={:', (c.match(/style=\{/g) || []).length)
