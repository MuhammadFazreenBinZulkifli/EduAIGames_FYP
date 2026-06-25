import { useSyncExternalStore } from 'react'
import { getTheme, toggleTheme, type ThemeMode } from '../theme'

// Listens for theme changes so the toggle stays in sync.
function subscribe(onStoreChange: () => void) {
  window.addEventListener('theme-change', onStoreChange)
  return () => window.removeEventListener('theme-change', onStoreChange)
}

function getSnapshot(): ThemeMode {
  return getTheme()
}

// Button that switches between light and dark mode.
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as ThemeMode)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={() => toggleTheme()}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
