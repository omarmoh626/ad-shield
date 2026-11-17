// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import DirectoryTree from '../../../src/ui/directory/DirectoryTree'
import { visibleRows } from '../../../src/ui/directory/tree'
import { windowSlice } from '../../../src/ui/directory/windowed'
import { typeLabel, statusLabel } from '../../../src/ui/directory/labels'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'
import { createObject } from '../../../src/domain/graph'
import type { DomainState, Guid } from '../../../src/domain/types'
import { activeFixture, type } from '../ticket/helpers'

beforeEach(() => resetStore())
afterEach(cleanup)

const tree = () => screen.getByRole('tree')
const item = (name: RegExp | string) => within(tree()).getByRole('treeitem', { name })

describe('directory tree', () => {
  it('shows a user created from the console at once, in the right container', async () => {
    const user = userEvent.setup(); render(<App />)
    await type(user, "New-ADUser -Name 'Jordan Pike' -SamAccountName jpike -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local'")
    await user.click(screen.getByRole('tab', { name: 'Directory' }))
    await user.click(within(tree()).getByRole('button', { name: 'Expand Pharmacy' }))
    const pharmacy = item(/^Pharmacy/)
    const jordan = item(/^Jordan Pike/)
    expect(jordan).toHaveAttribute('aria-level', String(Number(pharmacy.getAttribute('aria-level')) + 1))
    expect(jordan).toHaveTextContent('Person')
    // Rows are depth first, so Jordan sits after Pharmacy and before the next OU at Pharmacy's level.
    const rows = within(tree()).getAllByRole('treeitem')
    const after = rows.slice(rows.indexOf(pharmacy) + 1)
    const end = after.findIndex((row) => row.getAttribute('aria-level') === pharmacy.getAttribute('aria-level'))
    expect(after.slice(0, end)).toContain(jordan)
  })

  it('navigates with the keyboard: expand, collapse, select', () => {
    const state = getStore().campaign.active!.state
    const onSelect = vi.fn()
    render(<DirectoryTree state={state} selected={null} onSelect={onSelect} />)
    const root = tree()
    root.focus()
    // Starts on the domain, expanded.
    expect(item(/^corp\.contoso\.local/)).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(item(/^corp\.contoso\.local/)).toHaveAttribute('aria-expanded', 'false')
    expect(within(root).getAllByRole('treeitem')).toHaveLength(1)
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(item(/^corp\.contoso\.local/)).toHaveAttribute('aria-expanded', 'true')
    // Move down to Pharmacy, expand it, step into its first child, select with Enter.
    const rows = () => within(root).getAllByRole('treeitem')
    const pharmacyAt = rows().findIndex((row) => row.textContent?.startsWith('Pharmacy'))
    for (let step = 0; step < pharmacyAt; step += 1) fireEvent.keyDown(root, { key: 'ArrowDown' })
    expect(root).toHaveAttribute('aria-activedescendant', rows()[pharmacyAt]!.id)
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(item(/^Pharmacy/)).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(root, { key: 'ArrowRight' })
    const child = rows()[pharmacyAt + 1]!
    expect(root).toHaveAttribute('aria-activedescendant', child.id)
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(child.id.replace(/^tree-/, ''))
    // Left on a leaf goes to the parent; Left again collapses it.
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(root).toHaveAttribute('aria-activedescendant', rows()[pharmacyAt]!.id)
    fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(item(/^Pharmacy/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('mounts fewer row elements than nodes for a 2,000-node tree', () => {
    let state: DomainState = buildBaseDomain().state
    const ou = Object.values(state.objects).find((object) => object.rdn === 'Pharmacy')!.guid
    let last: Guid | undefined
    for (let index = 0; index < 2_000; index += 1) {
      const created = createObject(state, { objectClass: 'user', rdn: `Load ${String(index).padStart(4, '0')}`, parent: ou, attrs: { enabled: true }, securityPrincipal: false })
      state = created.state
      last = created.object.guid
    }
    // Selecting a deep node opens its ancestors, so the whole OU is in the row list.
    render(<DirectoryTree state={state} selected={last!} onSelect={() => {}} />)
    const total = visibleRows(state, new Set([state.objects[ou]!.parent!, ou])).length
    expect(total).toBeGreaterThan(2_000)
    const mounted = within(tree()).getAllByRole('treeitem').length
    expect(mounted).toBeLessThan(60)
    expect(mounted).toBeGreaterThan(0)
  })

  it('windowSlice covers the viewport plus a small buffer and pads the rest', () => {
    const slice = windowSlice(2_000, 34, 476, 34 * 1_000)
    expect(slice.start).toBe(994)
    expect(slice.end - slice.start).toBe(14 + 12)
    expect(slice.before + (slice.end - slice.start) * 34 + slice.after).toBe(2_000 * 34)
  })

  it('labels every node type and account status in text', () => {
    const state = getStore().campaign.active!.state
    const fixture = activeFixture()
    const maya = state.objects[fixture.ids.target!]!
    expect(typeLabel(maya)).toBe('Person')
    expect(statusLabel(maya)).toBe('Enabled · Locked out')
    const labels = new Set(Object.values(state.objects).map(typeLabel))
    for (const label of ['Domain', 'OU', 'Container', 'Person', 'Group', 'Computer', 'Service account']) expect(labels).toContain(label)
  })

  it('keeps the selection across narrow tabs and shows it in the tree', async () => {
    const user = userEvent.setup(); render(<App />)
    const target = activeFixture().ids.target!
    act(() => { actions.startInvestigating('Directory'); actions.setSelectedObject(target) })
    expect(item(/^Maya Ali/)).toHaveAttribute('aria-selected', 'true')
    const narrow = within(screen.getByRole('navigation', { name: 'Workspace tabs' }))
    await user.click(narrow.getByRole('button', { name: 'PowerShell' }))
    await user.click(narrow.getByRole('button', { name: 'Ticket' }))
    await user.click(narrow.getByRole('button', { name: 'Directory' }))
    expect(getStore().selectedObject).toBe(target)
    expect(screen.getByRole('region', { name: 'Properties of Maya Ali' })).toBeVisible()
  })

  it('selecting in the tree never changes domain state', async () => {
    const user = userEvent.setup(); render(<App />)
    act(() => actions.startInvestigating('Directory'))
    const before = getStore().campaign.active!.state
    await user.click(within(tree()).getByRole('button', { name: 'Expand Pharmacy' }))
    await user.click(item(/^Maya Ali/))
    expect(getStore().campaign.active!.state).toBe(before)
    expect(getStore().selectedObject).toBe(activeFixture().ids.target)
  })
})
