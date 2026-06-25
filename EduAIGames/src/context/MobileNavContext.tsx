import { createContext, useContext, useState, type ReactNode } from 'react'

interface MobileNavCtx {
  /** When true, the mobile top bar is hidden (e.g. during game play). */
  immersive: boolean
  setImmersive: (value: boolean) => void
}

const MobileNavContext = createContext<MobileNavCtx>({
  immersive: false,
  setImmersive: () => {},
})

/** Lets game/quiz components hide the mobile nav bar during active play. */
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [immersive, setImmersive] = useState(false)
  return (
    <MobileNavContext.Provider value={{ immersive, setImmersive }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav(): MobileNavCtx {
  return useContext(MobileNavContext)
}
