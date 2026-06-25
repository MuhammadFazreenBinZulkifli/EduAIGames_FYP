import { useEffect, useState } from 'react'

// Phones (portrait reflow target). Tablets/desktop keep the landscape board.
const MOBILE_MAX_WIDTH = 768

export interface GameViewport {
  /** True on phone-sized screens — used to switch the board to a portrait layout. */
  isMobile: boolean
  width: number
  height: number
}

function read(): GameViewport {
  if (typeof window === 'undefined') {
    return { isMobile: false, width: 1280, height: 800 }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  return { isMobile: width <= MOBILE_MAX_WIDTH, width, height }
}

// Reactive viewport info for game boards: tracks size + a mobile flag so a board
// can reflow to portrait on phones while leaving desktop untouched.
export function useGameViewport(): GameViewport {
  const [vp, setVp] = useState<GameViewport>(read)

  useEffect(() => {
    const onChange = () => setVp(read())
    window.addEventListener('resize', onChange, { passive: true })
    window.addEventListener('orientationchange', onChange, { passive: true })
    // Re-read once on mount in case the first paint happened before hydration.
    onChange()
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [])

  return vp
}
