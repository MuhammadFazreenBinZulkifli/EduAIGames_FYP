type FrontPageIconName =
  | 'quiz'
  | 'games'
  | 'chatbot'
  | 'grades'
  | 'classes'
  | 'ai'

interface FrontPageIconProps {
  name: FrontPageIconName
  className?: string
}

// Stroke icons for the public marketing page feature cards.
export default function FrontPageIcon({ name, className = '' }: FrontPageIconProps) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `frontpage-svg-icon ${className}`.trim(),
    'aria-hidden': true,
  }

  switch (name) {
    case 'quiz':
      return (
        <svg {...common}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      )
    case 'games':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="10" rx="2" />
          <path d="M8 13h2M9 12v2" />
          <path d="M15 12h.01M17 14h.01" />
          <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
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
    case 'grades':
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15l3-3 2 2 5-6" />
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
    case 'ai':
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.5H19l-4.5 3.3 1.7 5.5L12 14.1 7.8 17.3l1.7-5.5L5 8.5h5.2L12 3z" />
          <path d="M5 20h14" />
        </svg>
      )
    default:
      return null
  }
}
