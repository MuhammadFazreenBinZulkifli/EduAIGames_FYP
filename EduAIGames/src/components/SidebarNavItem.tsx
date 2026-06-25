import type { ReactNode } from 'react'
import { NavLink, type NavLinkProps } from 'react-router-dom'
import { useSidebar } from '../context/SidebarContext'

export interface SubNavItem {
  label: string
  to: string
}

interface SidebarNavItemProps {
  to: NavLinkProps['to']
  end?: boolean
  label: string
  hint?: string
  icon: ReactNode
  isActive?: boolean
  /** Recent or static sub-links shown below the nav item. */
  subItems?: SubNavItem[]
  /** "See all" destination (defaults to the item's own `to`). */
  allItemsTo?: string
  /** "See all" label text (defaults to "See all"). */
  allItemsLabel?: string
}

// Sidebar link with optional collapsible sub-nav and flyout in icon-only mode.
export default function SidebarNavItem({
  to,
  end,
  label,
  hint,
  icon,
  isActive,
  subItems,
  allItemsTo,
  allItemsLabel,
}: SidebarNavItemProps) {
  const { collapsed } = useSidebar()
  const hasSubItems = !!subItems && subItems.length > 0
  const seeAllTo = allItemsTo ?? (typeof to === 'string' ? to : String(to))
  const seeAllLabel = allItemsLabel ?? 'See all'

  const mainLinkClass = ({ isActive: routeActive }: { isActive: boolean }) =>
    `app-sidebar-item${(isActive ?? routeActive) ? ' active' : ''}`

  return (
    <div
      className={[
        'sidebar-nav-group',
        hasSubItems ? 'sidebar-nav-group--has-sub' : '',
        collapsed ? 'sidebar-nav-group--collapsed' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Main nav link */}
      <NavLink
        to={to}
        end={end}
        className={mainLinkClass}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
      >
        <span className="app-sidebar-item-icon-wrap">{icon}</span>
        {!collapsed && (
          <span className="app-sidebar-item-body">
            <span className="app-sidebar-item-label">{label}</span>
            {hint && <span className="app-sidebar-item-hint">{hint}</span>}
          </span>
        )}
      </NavLink>

      {/* Expanded sub-nav (always visible when there are items) */}
      {!collapsed && hasSubItems && (
        <div className="sidebar-sub-nav" role="group" aria-label={`${label} shortcuts`}>
          {subItems!.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-sub-item${isActive ? ' sidebar-sub-item--active' : ''}`
              }
            >
              <span className="sidebar-sub-item__dot" aria-hidden="true" />
              <span className="sidebar-sub-item__label">{item.label}</span>
            </NavLink>
          ))}
          <NavLink
            to={seeAllTo}
            className={({ isActive }) =>
              `sidebar-sub-item sidebar-sub-item--see-all${isActive ? ' sidebar-sub-item--active' : ''}`
            }
          >
            <span className="sidebar-sub-item__label">{seeAllLabel} →</span>
          </NavLink>
        </div>
      )}

      {/* Collapsed flyout (appears on hover via CSS) */}
      {collapsed && (
        <div className="sidebar-flyout" role="menu" aria-label={label}>
          <p className="sidebar-flyout__header">{label}</p>
          {hasSubItems && (
            <div className="sidebar-flyout__items">
              {subItems!.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  role="menuitem"
                  className={({ isActive }) =>
                    `sidebar-flyout__item${isActive ? ' sidebar-flyout__item--active' : ''}`
                  }
                >
                  <span className="sidebar-flyout__item-dot" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
          <NavLink to={seeAllTo} role="menuitem" className="sidebar-flyout__see-all">
            {hasSubItems ? `${seeAllLabel} →` : 'Open →'}
          </NavLink>
        </div>
      )}
    </div>
  )
}
