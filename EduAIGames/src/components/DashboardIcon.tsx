import SidebarIcon, { type IconName } from './SidebarIcons'

type DashboardIconVariant = 'tile' | 'stat' | 'tip' | 'inline' | 'thumb'

interface DashboardIconProps {
  name: IconName
  variant?: DashboardIconVariant
}

const SIZE: Record<DashboardIconVariant, number> = {
  tile: 26,
  stat: 22,
  tip: 28,
  inline: 20,
  thumb: 22,
}

// SVG icon wrapper for dashboard tiles, stats, and spotlight cards.
export default function DashboardIcon({ name, variant = 'inline' }: DashboardIconProps) {
  return (
    <span className={`dash-panel-icon dash-panel-icon--${variant}`} aria-hidden="true">
      <SidebarIcon name={name} size={SIZE[variant]} />
    </span>
  )
}
