/**
 * Refactor AdminExtendedPanels.tsx: replace OS inline styles with CSS classes
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/components/admin/AdminExtendedPanels.tsx')
let c = fs.readFileSync(file, 'utf8')

// Add import
if (!c.includes('AdminDashboard_CSS.css')) {
  c = c.replace(
    `import { invalidatePlatformFeaturesCache } from '../../hooks/usePlatformFeatures'`,
    `import { invalidatePlatformFeaturesCache } from '../../hooks/usePlatformFeatures'\nimport '../App_CSS/AdminDashboard_CSS.css'`
  )
}

// Remove OSStyles type and statCard
c = c.replace(/type OSStyles = Record<string, CSSProperties>\n\n/, '')
c = c.replace(/const statCard = \(OS: OSStyles\): CSSProperties => \(\{[\s\S]*?\}\)\n\n/, '')
c = c.replace(/, type CSSProperties/g, '')
c = c.replace(/import \{ useEffect, useMemo, useState, type CSSProperties \}/, 'import { useEffect, useMemo, useState }')

// Remove OS from interfaces
c = c.replace(/\s+OS: OSStyles\n/g, '\n')
c = c.replace(/\(OS: OSStyles\)/g, '()')
c = c.replace(/statCard\(OS\)/g, `'admin-os__stat-card'`)

// OS style replacements
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
}

for (const [from, cls] of Object.entries(osMap)) {
  c = c.replaceAll(`style={${from}}`, `className="${cls}"`)
}

// Common spreads
const spreads = [
  [`style={{ ...OS.td, textAlign: 'center', color: '#9ca3af', padding: '2rem' }}`, `className="admin-os__td admin-os__td--empty"`],
  [`style={{ ...OS.td, color: '#6b7280' }}`, `className="admin-os__td admin-os__td--muted"`],
  [`style={{ ...OS.td, fontWeight: 600 }}`, `className="admin-os__td admin-os__td--bold"`],
  [`style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}`, `className="admin-os__row-actions"`],
  [`style={{ ...OS.btnDanger, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-danger admin-os__btn-sm"`],
  [`style={{ ...OS.btnSecondary, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-secondary admin-os__btn-sm"`],
  [`style={{ ...OS.btnSuccess, padding: '3px 10px', fontSize: '0.8rem' }}`, `className="admin-os__btn-success admin-os__btn-sm"`],
  [`style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}`, `className="admin-os__import-actions"`],
  [`style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}`, `className="admin-os__row-actions"`],
  [`style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}`, `className="admin-os__row-actions"`],
  [`style={{ flex: 1 }}`, `className="admin-os__toolbar-spacer"`],
]
for (const [from, to] of spreads) c = c.replaceAll(from, to)
c = c.replace(/style=\{\{ \.\.\.OS\.td \}\}/g, `className="admin-os__td"`)

// statCard style prop -> className
c = c.replace(/style=\{statCard\(OS\)\}/g, `className="admin-os__stat-card"`)
c = c.replace(/style=\{'admin-os__stat-card'\}/g, `className="admin-os__stat-card"`)

// Remove OS from function params destructuring
c = c.replace(/export function (\w+)\(\{ adminId, OS, /g, 'export function $1({ adminId, ')
c = c.replace(/function (\w+)\(\{ adminId, OS, /g, 'function $1({ adminId, ')
c = c.replace(/export function (\w+)\(\{ adminId, OS \}/g, 'export function $1({ adminId }')
c = c.replace(/function OverviewPanel\(\{ adminId, OS, /g, 'function OverviewPanel({ adminId, ')
c = c.replace(/, OS,/g, ',')
c = c.replace(/, OS \}/g, ' }')
c = c.replace(/\(OS\)/g, '()')

fs.writeFileSync(file, c)
console.log('AdminExtendedPanels done. Remaining style={:', (c.match(/style=\{/g) || []).length)
