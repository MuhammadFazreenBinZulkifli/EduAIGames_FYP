import { useEffect } from 'react'
import { useMobileNav } from '../context/MobileNavContext'

/** Hides the mobile nav bar while `active` is true (game play, quiz focus, etc.). */
export function useGameImmersiveMode(active: boolean) {
  const { setImmersive } = useMobileNav()

  useEffect(() => {
    setImmersive(active)
    return () => setImmersive(false)
  }, [active, setImmersive])
}
