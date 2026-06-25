import type { ReactNode } from 'react'
import { truncateClassDescription } from '../constants/classLimits'
import PanelIcon from './PanelIcon'
import type { IconName } from './SidebarIcons'
import type { PanelIconColor } from './PanelIcon'

export interface ClassCardData {
  id: number
  title: string
  description?: string | null
  background_image?: string | null
}

/** banner = image strip + fallback icon; icon = small coloured tile above the title */
type ClassCardVariant = 'banner' | 'icon'

interface ClassCardBaseProps {
  classItem: ClassCardData
  variant: ClassCardVariant
  clickable?: boolean
  onClick?: () => void
  descriptionFallback?: string
  submeta?: ReactNode
  actionLabel?: string
  footer?: ReactNode
  header?: ReactNode
  bodyExtra?: ReactNode
  children?: ReactNode
  className?: string
  bannerFallbackIcon?: IconName
  cardIcon?: IconName
  cardIconColor?: PanelIconColor
}

// Shared class card for student/instructor class pickers and lists.
export default function ClassCard({
  classItem,
  variant,
  clickable = false,
  onClick,
  descriptionFallback = 'View class details',
  submeta,
  actionLabel,
  footer,
  header,
  bodyExtra,
  children,
  className = '',
  bannerFallbackIcon = 'classes',
  cardIcon = 'classes',
  cardIconColor = 'orange',
}: ClassCardBaseProps) {
  const cardClass = [
    'panel-class-card',
    'panel-class-card--polished',
    clickable ? 'panel-class-card--clickable' : '',
    variant === 'banner' ? 'panel-class-card--banner-card' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const description = classItem.description
    ? truncateClassDescription(classItem.description)
    : descriptionFallback

  const descriptionClass = classItem.description ? 'panel-class-card-description' : 'panel-meta'

  const inner = (
    <>
      {variant === 'banner' && (
        <div
          className="panel-class-card__banner"
          style={classItem.background_image ? { backgroundImage: `url(${classItem.background_image})` } : undefined}
        >
          {!classItem.background_image && (
            <PanelIcon name={bannerFallbackIcon} variant="card-banner" color="orange" />
          )}
        </div>
      )}

      {variant === 'icon' && (
        <div className={`panel-class-card__icon panel-class-card__icon--${cardIconColor}`}>
          <PanelIcon name={cardIcon} variant="card" color={cardIconColor} />
        </div>
      )}

      {header}

      <h3>{classItem.title}</h3>

      <p className={descriptionClass} title={classItem.description || undefined}>
        {description}
      </p>

      {submeta && <span className="panel-meta panel-class-card-submeta">{submeta}</span>}
      {bodyExtra}
      {children}

      {actionLabel && <span className="panel-class-card-action">{actionLabel}</span>}
      {footer}
    </>
  )

  if (clickable) {
    return (
      <button type="button" className={cardClass} onClick={onClick}>
        {inner}
      </button>
    )
  }

  return <div className={cardClass}>{inner}</div>
}
