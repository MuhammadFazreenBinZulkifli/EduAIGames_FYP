/**
 * Refactor AdminDashboard.tsx: replace OS inline styles with CSS classes
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/components/AdminDashboard.tsx')
let c = fs.readFileSync(file, 'utf8')

const osMap = {
  'OS.page': 'admin-os__page',
  'OS.topBar': 'admin-os__top-bar',
  'OS.topBarTitle': 'admin-os__top-bar-title',
  'OS.topBarRight': 'admin-os__top-bar-right',
  'OS.topBarEmail': 'admin-os__top-bar-email',
  'OS.logoutBtn': 'admin-os__logout-btn',
  'OS.hero': 'admin-os__hero',
  'OS.heroTitle': 'admin-os__hero-title',
  'OS.heroSub': 'admin-os__hero-sub',
  'OS.nav': 'admin-os__nav',
  'OS.body': 'admin-os__body',
  'OS.toolbar': 'admin-os__toolbar',
  'OS.searchInput': 'admin-os__search-input',
  'OS.filterSelect': 'admin-os__filter-select',
  'OS.btnPrimary': 'admin-os__btn-primary',
  'OS.btnSecondary': 'admin-os__btn-secondary',
  'OS.btnDanger': 'admin-os__btn-danger',
  'OS.btnSuccess': 'admin-os__btn-success',
  'OS.tableWrap': 'admin-os__table-wrap',
  'OS.table': 'admin-os__table',
  'OS.tdClamp': 'admin-os__td-clamp',
  'OS.tdNum': 'admin-os__td-num',
  'OS.th': 'admin-os__th',
  'OS.td': 'admin-os__td',
  'OS.alertDismiss': 'admin-os__alert-dismiss',
  'OS.pagination': 'admin-os__pagination',
  'OS.importBox': 'admin-os__import-box',
  'OS.importTitle': 'admin-os__import-title',
  'OS.importMeta': 'admin-os__import-meta',
}

for (const [from, cls] of Object.entries(osMap)) {
  c = c.replaceAll(`style={${from}}`, `className="${cls}"`)
}

// Spread logout btn
c = c.replace(
  `style={{ ...OS.logoutBtn, alignSelf: 'center', marginBottom: 4 }}`,
  `className="admin-os__logout-btn admin-os__refresh-btn"`
)

// Nav tab
c = c.replace(
  `style={osNavTab(activeTab === tab.id)}`,
  `className={\`admin-os__nav-tab\${activeTab === tab.id ? ' admin-os__nav-tab--active' : ''}\`}`
)

// Alerts
c = c.replace(`style={osAlert('error')}`, `className="admin-os__alert admin-os__alert--error"`)
c = c.replace(`style={osAlert('success')}`, `className="admin-os__alert admin-os__alert--success"`)

// Page buttons - various patterns
c = c.replace(
  /style=\{osPageBtn\(v === page\)\}/g,
  `className={\`admin-os__page-btn\${v === page ? ' admin-os__page-btn--active' : ''}\`}`
)
c = c.replace(
  /style=\{osPageBtn\(false, page === 1\)\}/g,
  `className={\`admin-os__page-btn\${page === 1 ? ' admin-os__page-btn--disabled' : ''}\`}`
)
c = c.replace(
  /style=\{osPageBtn\(false, page === pages\)\}/g,
  `className={\`admin-os__page-btn\${page === pages ? ' admin-os__page-btn--disabled' : ''}\`}`
)

// Status/role badges
c = c.replace(
  /style=\{statusBadge\(([^)]+)\)\}/g,
  `className={\`admin-os__status-badge admin-os__status-badge--\${$1}\`}`
)
c = c.replace(
  /style=\{roleBadge\(([^)]+)\)\}/g,
  `className={\`admin-os__role-badge admin-os__role-badge--\${$1}\`}`
)

// Remove OS prop from panel components
c = c.replace(/\s+OS=\{OS\}/g, '')

// Remove helper functions and OS object (lines 121-442 approx)
c = c.replace(
  /\/\/ ─── Old-school style tokens[\s\S]*?^const ROWS_PER_PAGE/m,
  'const ROWS_PER_PAGE'
)

// CellText inline style
c = c.replace(
  `style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        minWidth: 0,
      }}`,
  `className="admin-os__cell-text"`
)

// Super admin badge
c = c.replace(
  `<span style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em',
              background: '#7c2d12', color: '#fde68a', padding: '3px 10px', borderRadius: 4,
            }}>SUPER ADMIN</span>`,
  `<span className="admin-os__super-badge">SUPER ADMIN</span>`
)

// Tab count badge
c = c.replace(
  `<span style={{
                marginLeft: '0.4rem', fontSize: '0.72rem', fontWeight: 400,
                background: 'rgba(255,255,255,0.12)', padding: '1px 6px', borderRadius: 8, color: '#94a3b8',
              }}>`,
  `<span className="admin-os__tab-count">`
)

// Nav spacer
c = c.replace(`<div style={{ flex: 1 }} />`, `<div className="admin-os__nav-spacer" />`)
c = c.replaceAll(`<div style={{ flex: 1 }} />`, `<div className="admin-os__toolbar-spacer" />`)

// Loading
c = c.replace(
  `<div style={{ textAlign: 'center', padding: '3rem 0', color: '#6b7280', fontFamily: '"Georgia", serif' }}>`,
  `<div className="admin-os__loading">`
)

// Search wrapper
c = c.replace(
  `<div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>⌕</span>`,
  `<div className="admin-os__search-wrap">
                <span className="admin-os__search-icon">⌕</span>`
)

// Toolbar count
c = c.replace(
  `<span style={{ color: '#6b7280', fontSize: '0.82rem', fontFamily: '"Georgia", serif' }}>`,
  `<span className="admin-os__toolbar-count">`
)

// Pagination info
c = c.replace(
  `<span style={{ marginRight: '0.5rem', color: '#6b7280', fontSize: '0.82rem' }}>`,
  `<span className="admin-os__pagination-info">`
)

// Pagination ellipsis
c = c.replace(
  `<span key={\`e\${i}\`} style={{ padding: '0 4px', color: '#9ca3af' }}>…</span>`,
  `<span key={\`e\${i}\`} className="admin-os__pagination-ellipsis">…</span>`
)

// TH checkbox column spread
c = c.replace(
  `style={{
                          ...OS.th,
                          ...(i === 0 ? { padding: '0.65rem 0.4rem', textAlign: 'center' } : {}),
                        }}`,
  `className={i === 0 ? 'admin-os__th admin-os__th--checkbox' : 'admin-os__th'}`
)

// Add import if missing
if (!c.includes("App_CSS/AdminDashboard_CSS.css")) {
  c = c.replace(
    /^import /m,
    `import './App_CSS/AdminDashboard_CSS.css'\nimport `
  )
}

// Remove unused CSSProperties from import if present
c = c.replace(/, type CSSProperties/g, '')
c = c.replace(/type CSSProperties, /g, '')

fs.writeFileSync(file, c)
console.log('AdminDashboard.tsx updated')
