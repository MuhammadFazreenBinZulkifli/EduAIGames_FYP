import { useEffect, useState } from 'react'

/** Scales grid cell size down on narrow viewports so game boards fit on screen.
 *  Returns the smaller of `baseSize` and the computed max that keeps all columns visible.
 */
export function useResponsiveCellSize(
  baseSize: number,
  gridCols: number,
  horizontalPadding = 32
): number {
  const compute = () => {
    const available = window.innerWidth - horizontalPadding
    const maxSize = Math.floor(available / gridCols)
    const minSize = 10
    return Math.min(baseSize, Math.max(minSize, maxSize))
  }

  const [size, setSize] = useState(compute)

  useEffect(() => {
    const handler = () => setSize(compute())
    window.addEventListener('resize', handler, { passive: true })
    setSize(compute())
    return () => window.removeEventListener('resize', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize, gridCols, horizontalPadding])

  return size
}
