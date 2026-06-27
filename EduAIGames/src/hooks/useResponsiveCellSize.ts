import { useEffect, useState } from 'react'

interface ResponsiveCellOptions {
  /** When set, the cell is also constrained so all rows fit the viewport height. */
  gridRows?: number
  /** Vertical space (px) reserved for headers/controls/hints when fitting height. */
  verticalReserve?: number
  /** Smallest allowed cell size (defaults to 10). */
  minSize?: number
}

/** Scales grid cell size down on narrow viewports so game boards fit on screen.
 *  Returns the smaller of `baseSize`, the max that keeps all columns visible, and
 *  (when `gridRows` is supplied) the max that keeps all rows visible too.
 */
export function useResponsiveCellSize(
  baseSize: number,
  gridCols: number,
  horizontalPadding = 32,
  options?: ResponsiveCellOptions
): number {
  const gridRows = options?.gridRows
  const verticalReserve = options?.verticalReserve ?? 0
  const minSize = options?.minSize ?? 10

  const compute = () => {
    const available = window.innerWidth - horizontalPadding
    let maxSize = Math.floor(available / gridCols)
    if (gridRows && gridRows > 0) {
      const verticalAvailable = window.innerHeight - verticalReserve
      maxSize = Math.min(maxSize, Math.floor(verticalAvailable / gridRows))
    }
    return Math.min(baseSize, Math.max(minSize, maxSize))
  }

  const [size, setSize] = useState(compute)

  useEffect(() => {
    const handler = () => setSize(compute())
    window.addEventListener('resize', handler, { passive: true })
    setSize(compute())
    return () => window.removeEventListener('resize', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize, gridCols, horizontalPadding, gridRows, verticalReserve, minSize])

  return size
}
