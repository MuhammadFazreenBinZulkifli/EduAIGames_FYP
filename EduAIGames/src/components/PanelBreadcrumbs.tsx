import { Link } from 'react-router-dom'
import './App_CSS/PanelBreadcrumbs_CSS.css'

export interface BreadcrumbItem {
  label: string
  to?: string
  onClick?: () => void
}

interface PanelBreadcrumbsProps {
  items: BreadcrumbItem[]
}

// Desktop wayfinding trail for nested panel routes.
export default function PanelBreadcrumbs({ items }: PanelBreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav className="panel-breadcrumbs" aria-label="Breadcrumb">
      <ol className="panel-breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="panel-breadcrumbs__item">
              {index > 0 && <span className="panel-breadcrumbs__sep" aria-hidden>/</span>}
              {item.to && !isLast ? (
                <Link to={item.to} className="panel-breadcrumbs__link">
                  {item.label}
                </Link>
              ) : item.onClick && !isLast ? (
                <button type="button" className="panel-breadcrumbs__link" onClick={item.onClick}>
                  {item.label}
                </button>
              ) : (
                <span className="panel-breadcrumbs__current" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
