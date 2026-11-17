import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { MenuItem } from '../editors/requests'

export interface ObjectMenuProps {
  label: string
  items: MenuItem[]
  /** Viewport position for a right-click; omitted for the Actions button and the keyboard. */
  at?: { x: number; y: number }
  onChoose(item: MenuItem): void
  onClose(): void
}

/**
 * Context menu for a directory object (ADUC right-click). Opens with right-click, Shift+F10,
 * the Menu key, or the visible Actions button. Arrow keys move, Enter chooses, Esc closes.
 * Every item is also a visible button in the quick-actions bar.
 */
export default function ObjectMenu({ label, items, at, onChoose, onClose }: ObjectMenuProps) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [])
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const nodes = [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    const go = (index: number) => { event.preventDefault(); nodes[(index + nodes.length) % nodes.length]?.focus() }
    switch (event.key) {
      case 'ArrowDown': go(at + 1); break
      case 'ArrowUp': go(at - 1); break
      case 'Home': go(0); break
      case 'End': go(nodes.length - 1); break
      case 'Escape': case 'Tab': event.preventDefault(); onClose(); break
    }
  }
  return <div
    ref={box}
    className="menu"
    role="menu"
    aria-label={label}
    onKeyDown={onKey}
    onBlur={(event) => { if (!box.current?.contains(event.relatedTarget as Node | null)) onClose() }}
    style={at ? { position: 'fixed', left: at.x, top: at.y } : undefined}
  >
    {items.map((item) => <button key={item.item} type="button" role="menuitem" tabIndex={-1} onClick={() => onChoose(item)}>{item.label}</button>)}
  </div>
}

/** The same items as visible buttons (DESIGN s8: context menus also offered as visible buttons). */
export function QuickActions({ items, onChoose }: { items: MenuItem[]; onChoose(item: MenuItem): void }) {
  if (!items.length) return null
  return <div className="quick-actions" role="group" aria-label="Quick actions">
    {items.map((item) => <button key={item.item} type="button" onClick={() => onChoose(item)}>{item.label.replace(/…$/, '')}</button>)}
  </div>
}
