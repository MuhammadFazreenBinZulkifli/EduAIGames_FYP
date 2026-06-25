import './App_CSS/UserAvatar_CSS.css'

interface UserAvatarProps {
  username: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Displays user avatar image or initial-letter fallback.
export default function UserAvatar({ username, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
  const initials = username
    .split(' ')
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        className={`user-avatar user-avatar--${size} ${className}`}
      />
    )
  }

  return (
    <div
      className={`user-avatar user-avatar--${size} user-avatar--initials ${className}`}
      aria-label={username}
      role="img"
    >
      {initials}
    </div>
  )
}
