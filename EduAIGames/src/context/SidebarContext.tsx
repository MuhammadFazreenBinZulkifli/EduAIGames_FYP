import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface SidebarCtx {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarCtx>({ collapsed: false, toggle: () => {} })

const MOBILE_BREAKPOINT = 980

function isMobile() {
  try { return window.innerWidth < MOBILE_BREAKPOINT } catch { return false }
}

// Provides sidebar collapse state (persisted across desktop sessions) to nav items.
// On mobile viewports the sidebar is always a full-width drawer, never icon-only.
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (isMobile()) return false
    try { return localStorage.getItem('eduai-sidebar-collapsed') === '1' } catch { return false }
  })

  // Whenever the viewport crosses the mobile breakpoint, ensure collapsed = false.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < MOBILE_BREAKPOINT) setCollapsed(false)
    }
    window.addEventListener('resize', onResize, { passive: true })
    // Run once on mount to catch cases where the page loaded at mobile size.
    if (isMobile()) setCollapsed(false)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toggle = () => {
    // Collapse toggle is a desktop-only feature.
    if (isMobile()) return
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('eduai-sidebar-collapsed', next ? '1' : '0') } catch { /* ignore */ }
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar(): SidebarCtx {
  return useContext(SidebarContext)
}
