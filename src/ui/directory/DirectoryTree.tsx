import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { DomainState, Guid } from '../../domain/types'
import { ancestorsOf, rootsOf, visibleRows } from './tree'
import { displayName, statusLabel, typeLabel } from './labels'
import { useWindow } from './windowed'

export const TREE_ROW_HEIGHT = 34
export const TREE_VIEWPORT = 476

export interface DirectoryTreeProps {
  state: DomainState
  selected: Guid | null
  onSelect(guid: Guid): void
}

/**
 * Collapsible directory tree (read view). It renders only the visible rows plus a buffer,
 * and never writes domain state: selection goes to the store through `onSelect`.
 */
export default function DirectoryTree({ state, selected, onSelect }: DirectoryTreeProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<Guid>>(() => new Set(rootsOf(state).map((root) => root.guid)))
  const [cursor, setCursor] = useState<Guid | null>(selected)
  const box = useRef<HTMLDivElement>(null)
  /** A selection waiting to be scrolled into the window once its ancestors are open. */
  const pendingReveal = useRef<Guid | null>(null)
  // A selection made elsewhere (for example a hint's GUI steps, or a restored selection) opens
  // its ancestors once and scrolls its row into the window.
  useEffect(() => {
    if (!selected || !state.objects[selected]) return
    const missing = ancestorsOf(state, selected).filter((guid) => !expanded.has(guid))
    if (missing.length) setExpanded(new Set([...expanded, ...missing]))
    setCursor(selected)
    pendingReveal.current = selected
    // Only a new selection opens ancestors; later collapses stay collapsed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])
  const rows = useMemo(() => visibleRows(state, expanded), [state, expanded])
  const { slice, onScroll, reveal } = useWindow(rows.length, TREE_ROW_HEIGHT, TREE_VIEWPORT)
  useEffect(() => {
    const wanted = pendingReveal.current
    if (!wanted) return
    const at = rows.findIndex((row) => row.guid === wanted)
    if (at < 0) return
    pendingReveal.current = null
    reveal(box.current, at)
  }, [rows, reveal])
  const active = cursor && rows.some((row) => row.guid === cursor) ? cursor : (selected ?? rows[0]?.guid ?? null)
  const index = rows.findIndex((row) => row.guid === active)
  // aria-activedescendant must name a mounted row; an unmounted cursor is revealed on the next key.
  const activeMounted = index >= slice.start && index < slice.end

  const toggle = (guid: Guid, to?: boolean) => setExpanded((current) => {
    const next = new Set(current)
    const want = to ?? !current.has(guid)
    if (want) next.add(guid); else next.delete(guid)
    return next
  })
  const moveTo = (at: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, at))]
    if (!row) return
    setCursor(row.guid)
    reveal(box.current, rows.indexOf(row))
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = rows[index]
    if (!row) return
    if (!activeMounted) reveal(box.current, index)
    const handled = () => event.preventDefault()
    switch (event.key) {
      case 'ArrowDown': handled(); moveTo(index + 1); break
      case 'ArrowUp': handled(); moveTo(index - 1); break
      case 'Home': handled(); moveTo(0); break
      case 'End': handled(); moveTo(rows.length - 1); break
      case 'ArrowRight':
        handled()
        if (row.hasChildren && !row.expanded) toggle(row.guid, true)
        else if (row.expanded) moveTo(index + 1)
        break
      case 'ArrowLeft':
        handled()
        if (row.expanded) toggle(row.guid, false)
        else if (row.parent) moveTo(rows.findIndex((r) => r.guid === row.parent))
        break
      case 'Enter': case ' ': handled(); onSelect(row.guid); break
    }
  }

  return <div
    ref={box}
    className="dir-tree"
    role="tree"
    aria-label="Directory · corp.contoso.local · simulated"
    tabIndex={0}
    aria-activedescendant={active && activeMounted ? `tree-${active}` : undefined}
    onKeyDown={onKey}
    onScroll={onScroll}
    style={{ height: TREE_VIEWPORT }}
  >
    <div style={{ height: slice.before }} aria-hidden="true" />
    {rows.slice(slice.start, slice.end).map((row) => {
      const object = state.objects[row.guid]!
      const status = statusLabel(object)
      return <div
        key={row.guid}
        id={`tree-${row.guid}`}
        role="treeitem"
        aria-level={row.depth + 1}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-selected={row.guid === selected}
        data-cursor={row.guid === active || undefined}
        className="tree-row"
        style={{ height: TREE_ROW_HEIGHT, paddingLeft: 8 + row.depth * 16 }}
        onClick={() => { setCursor(row.guid); onSelect(row.guid) }}
      >
        {row.hasChildren
          ? <button type="button" tabIndex={-1} className="tree-twisty" aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${displayName(object)}`} onClick={(event) => { event.stopPropagation(); toggle(row.guid) }}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d={row.expanded ? 'M2 4l4 4 4-4' : 'M4 2l4 4-4 4'} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
          : <span className="tree-twisty" aria-hidden="true" />}
        <span className="tree-name">{displayName(object)}</span>
        <span className="tree-type">{typeLabel(object)}{status ? ` · ${status}` : ''}</span>
      </div>
    })}
    <div style={{ height: slice.after }} aria-hidden="true" />
  </div>
}
