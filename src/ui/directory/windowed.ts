import { useCallback, useState, type UIEvent } from 'react'

/** Rows rendered above and below the visible window. */
export const WINDOW_BUFFER = 6

export interface WindowSlice {
  start: number
  end: number
  /** Space above the first rendered row, in px. */
  before: number
  /** Space below the last rendered row, in px. */
  after: number
}

/** The rows a fixed-height list must render: the visible ones plus a small buffer on each side. */
export function windowSlice(count: number, rowHeight: number, viewport: number, scrollTop: number, buffer = WINDOW_BUFFER): WindowSlice {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer)
  const visible = Math.ceil(viewport / rowHeight)
  const end = Math.min(count, first + visible + buffer * 2)
  const start = Math.min(first, end)
  return { start, end, before: start * rowHeight, after: Math.max(0, (count - end) * rowHeight) }
}

/**
 * Windowed rendering for a scrolling list with fixed row height. The viewport height is fixed
 * (CSS sets the same height), so jsdom and the browser agree on which rows exist.
 */
export function useWindow(count: number, rowHeight: number, viewport: number) {
  const [scrollTop, setScrollTop] = useState(0)
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => setScrollTop(event.currentTarget.scrollTop), [])
  /** Scrolls so row `index` is visible. */
  const reveal = useCallback((element: HTMLElement | null, index: number) => {
    if (!element) return
    const top = index * rowHeight
    let next = element.scrollTop
    if (top < next) next = top
    else if (top + rowHeight > next + viewport) next = top + rowHeight - viewport
    if (next !== element.scrollTop) { element.scrollTop = next; setScrollTop(next) }
  }, [rowHeight, viewport])
  return { slice: windowSlice(count, rowHeight, viewport, scrollTop), onScroll, reveal }
}
