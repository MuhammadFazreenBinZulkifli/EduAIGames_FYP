import { useEffect } from 'react'
import { APP_TITLE } from '../utils/routeTitles'

// Keeps the browser tab title as the site name only (favicon + EduAIGames).
export function usePageTitle() {
  useEffect(() => {
    document.title = APP_TITLE
  }, [])
}
