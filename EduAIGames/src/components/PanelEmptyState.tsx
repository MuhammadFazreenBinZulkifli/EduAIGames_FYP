import type { ReactNode } from 'react'
import PanelIcon from './PanelIcon'
import type { IconName } from './SidebarIcons'

interface PanelEmptyStateProps {
  icon: IconName
  title: string
  description?: ReactNode
  action?: { label: string; onClick: () => void }
}

// Standardized empty state with SVG icon, title, and optional CTA.
export default function PanelEmptyState({ icon, title, description, action }: PanelEmptyStateProps) {
  return (
    <div className="panel-empty panel-empty--polished">
      <PanelIcon name={icon} variant="empty" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <button
          type="button"
          className="panel-btn panel-btn-primary panel-btn-sm panel-empty__action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
