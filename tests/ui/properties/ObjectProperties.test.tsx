// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ObjectProperties from '../../../src/ui/properties/ObjectProperties'
import { getStore, resetStore } from '../../../src/ui/store'
import { activeFixture } from '../ticket/helpers'
import type { Guid } from '../../../src/domain/types'

beforeEach(() => resetStore())
afterEach(cleanup)

const state = () => getStore().campaign.active!.state
const byRdn = (rdn: string) => Object.values(state().objects).find((object) => object.rdn === rdn)!.guid

describe('object properties (read only)', () => {
  it('Member Of shows direct groups and labels the primary group separately', async () => {
    const user = userEvent.setup()
    render(<ObjectProperties state={state()} guid={activeFixture().ids.target!} />)
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('Primary group')
    expect(panel).toHaveTextContent('Domain Users')
    expect(panel).toHaveTextContent('not a membership')
    const list = within(panel).getByRole('list')
    const names = within(list).getAllByRole('listitem').map((row) => row.textContent)
    expect(names.some((name) => name?.includes('GG-Pharmacy-Staff'))).toBe(true)
    expect(names.some((name) => name?.includes('Security · Global'))).toBe(true)
    // The primary group is not listed as a membership, and nested groups are not flattened in.
    expect(names.some((name) => name?.includes('Domain Users'))).toBe(false)
    expect(names).toHaveLength(state().indexes.groupsByMember[activeFixture().ids.target!]!.length)
  })

  it('Account tab states lockout and status in words and technical values', async () => {
    const user = userEvent.setup()
    render(<ObjectProperties state={state()} guid={activeFixture().ids.target!} />)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('Locked outYes (LockedOut True)')
    expect(panel).toHaveTextContent('Enabled · Locked out')
    expect(panel).not.toHaveTextContent(/password value/i)
  })

  it('General tab shows type and distinguished name; arrow keys move between tabs', () => {
    render(<ObjectProperties state={state()} guid={byRdn('Pharmacy')} />)
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent('OU')
    expect(panel).toHaveTextContent('OU=Pharmacy,DC=corp,DC=contoso,DC=local')
    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Properties' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('has no sign-in account')
  })

  it('shows a prompt when nothing is selected, and never changes state', () => {
    const before = state()
    render(<ObjectProperties state={before} guid={null} />)
    expect(screen.getByText(/Pick an object in the tree/)).toBeInTheDocument()
    cleanup()
    render(<ObjectProperties state={before} guid={'missing' as Guid} />)
    expect(getStore().campaign.active!.state).toBe(before)
  })
})
