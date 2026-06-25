export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'eduai-theme'

export function getTheme(): ThemeMode {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function setTheme(theme: ThemeMode): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  applyTheme(theme)
  window.dispatchEvent(new Event('theme-change'))
}

export function toggleTheme(): ThemeMode {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/** Call once before React mounts to avoid flash of wrong theme. */
export function initTheme(): void {
  applyTheme(getTheme())
}
