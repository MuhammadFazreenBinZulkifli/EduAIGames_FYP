import SidebarIcon, { type IconName } from './SidebarIcons'

export type PanelIconVariant = 'empty' | 'card' | 'card-banner' | 'action' | 'inline' | 'notification'
export type PanelIconColor = 'orange' | 'purple' | 'green' | 'blue' | 'pink' | 'default'

interface PanelIconProps {
  name: IconName
  variant?: PanelIconVariant
  color?: PanelIconColor
}

const SIZE: Record<PanelIconVariant, number> = {
  empty: 36,
  card: 20,
  'card-banner': 32,
  action: 22,
  inline: 18,
  notification: 16,
}

// SVG icon wrapper for panel pages — empty states, cards, and inline UI.
export default function PanelIcon({ name, variant = 'inline', color = 'default' }: PanelIconProps) {
  const colorClass = color !== 'default' ? ` panel-icon-wrap--${color}` : ''
  return (
    <span className={`panel-icon-wrap panel-icon-wrap--${variant}${colorClass}`} aria-hidden="true">
      <SidebarIcon name={name} size={SIZE[variant]} />
    </span>
  )
}
