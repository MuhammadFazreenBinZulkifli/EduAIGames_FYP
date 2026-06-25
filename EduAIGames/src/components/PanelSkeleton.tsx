import './App_CSS/PanelSkeleton_CSS.css'

interface PanelSkeletonProps {
  variant?: 'cards' | 'list' | 'hero' | 'table'
  count?: number
}

// Lightweight loading placeholders — no shimmer animation (desktop-friendly).
export default function PanelSkeleton({ variant = 'cards', count = 3 }: PanelSkeletonProps) {
  if (variant === 'hero') {
    return (
      <div className="panel-skeleton panel-skeleton--hero" aria-hidden>
        <div className="panel-skeleton__line panel-skeleton__line--sm" />
        <div className="panel-skeleton__line panel-skeleton__line--lg" />
        <div className="panel-skeleton__line panel-skeleton__line--md" />
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className="panel-skeleton panel-skeleton--table" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="panel-skeleton__row" />
        ))}
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className="panel-skeleton-list" aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="panel-skeleton panel-skeleton--list-item">
            <div className="panel-skeleton__icon" />
            <div className="panel-skeleton__body">
              <div className="panel-skeleton__line panel-skeleton__line--md" />
              <div className="panel-skeleton__line panel-skeleton__line--sm" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="panel-skeleton-grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel-skeleton panel-skeleton--card">
          <div className="panel-skeleton__icon" />
          <div className="panel-skeleton__line panel-skeleton__line--md" />
          <div className="panel-skeleton__line panel-skeleton__line--sm" />
          <div className="panel-skeleton__line panel-skeleton__line--xs" />
        </div>
      ))}
    </div>
  )
}
