export type IconName =
  | 'dashboard'
  | 'classes'
  | 'join'
  | 'content'
  | 'grades'
  | 'library'
  | 'studio'
  | 'performance'
  | 'settings'
  | 'logout'
  | 'quiz'
  | 'clock'
  | 'check'
  | 'trophy'
  | 'game'
  | 'globe'
  | 'chatbot'
  | 'edit'
  | 'ai'
  | 'search'
  | 'users'
  | 'lock'
  | 'copy'
  | 'file'
  | 'alert'
  | 'calendar'
  | 'trash'
  | 'bell'
  | 'megaphone'

interface SidebarIconProps {
  name: IconName
  className?: string
  size?: number
}

// Minimal stroke icons for sidebar and dashboard panels.
export default function SidebarIcon({ name, className = '', size = 20 }: SidebarIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `panel-icon ${className}`.trim(),
    'aria-hidden': true,
  }

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      )
    case 'classes':
      return (
        <svg {...common}>
          <path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z" />
          <path d="M4 12.5 12 17l8-4.5" />
          <path d="M4 16.5 12 21l8-4.5" />
        </svg>
      )
    case 'join':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" />
          <path d="M14 10h7M17.5 7.5v5" />
          <path d="M3 20c0-2.8 2.2-5 5-5h0" />
        </svg>
      )
    case 'content':
      return (
        <svg {...common}>
          <path d="M5 5h14v14H5z" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      )
    case 'grades':
    case 'performance':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16v-4M12 16V8M16 16v-6" />
        </svg>
      )
    case 'library':
      return (
        <svg {...common}>
          <path d="M5 5h5v14H5z" />
          <path d="M14 5h5v14h-5z" />
          <path d="M7 9h1M16 9h1M7 13h1M16 13h1" />
        </svg>
      )
    case 'studio':
      return (
        <svg {...common}>
          <path d="M12 3l2.2 6.8H21l-5.6 4.1 2.1 6.8L12 16.6 6.5 20.7l2.1-6.8L3 9.8h6.8L12 3z" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-2" />
          <path d="M14 12H3m0 0 3-3m-3 3 3 3" />
        </svg>
      )
    case 'quiz':
      return (
        <svg {...common}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )
    case 'trophy':
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4z" />
          <path d="M7 4H5a2 2 0 0 0 0 4h2M17 4h2a2 2 0 0 1 0 4h-2" />
        </svg>
      )
    case 'game':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="10" rx="2" />
          <path d="M8 13h2M9 12v2" />
          <path d="M15 12h.01M17 14h.01" />
          <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
        </svg>
      )
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16" />
        </svg>
      )
    case 'chatbot':
      return (
        <svg {...common}>
          <path d="M12 8V4H8" />
          <rect x="4" y="8" width="16" height="10" rx="2" />
          <path d="M9 13h.01M12 13h.01M15 13h.01" />
          <path d="M8 18l-2 2v-2" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...common}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      )
    case 'ai':
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.5H19l-4.5 3.3 1.7 5.5L12 14.1 7.8 17.3l1.7-5.5L5 8.5h5.2L12 3z" />
          <path d="M5 20h14" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6h0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M14 20c0.2-2.8 2.4-5 5-5" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h9" />
        </svg>
      )
    case 'file':
      return (
        <svg {...common}>
          <path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-4-5z" />
          <path d="M14 3v5h5M10 13h4M10 17h4" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 4 3 20h18L12 4z" />
          <path d="M12 10v4M12 18h.01" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M8 4v4M16 4v4M4 10h16" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <path d="M12 4a5 5 0 0 0-5 5v3l-2 3h14l-2-3V9a5 5 0 0 0-5-5z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      )
    case 'megaphone':
      return (
        <svg {...common}>
          <path d="M4 10v4h4l5 4V6L8 10H4z" />
          <path d="M16 9a3 3 0 0 1 0 6M18 7a5 5 0 0 1 0 10" />
        </svg>
      )
    default:
      return null
  }
}
