// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { menuItemsFor } from '../../../src/ui/editors/requests'
import { activeFixture, rail, type } from '../ticket/helpers'
import type { Guid } from '../../../src/domain/types'
import { createDefaultRegistry, createRuntime, run } from '../../../src/ps/runtime'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'

beforeEach(() => resetStore())
afterEach(cleanup)

const state = () => getStore().campaign.active!.state
const bySam = (sam: string) => Object.values(state().objects).find((object) => object.attrs.sAMAccountName === sam)!
const tree = () => screen.getByRole('tree')
const details = () => within(document.querySelector<HTMLElement>('.details')!)

async function openDirectory(user: UserEvent) {
  await user.click(screen.getByRole('tab', { name: 'Directory' }))
}
async function openObject(user: UserEvent, ou: string, name: RegExp) {
  const twisty = within(tree()).queryByRole('button', { name: `Expand ${ou}` })
  if (twisty) await user.click(twisty)
  await user.click(within(tree()).getByRole('treeitem', { name }))
}

describe('ADUC editors', () => {
  it('case 01 GUI route by clicking: Directory, Pharmacy, Maya Ali, Account, Unlock account, Apply', async () => {
    const user = userEvent.setup(); render(<App />)
    const fixture = activeFixture()
    const [, ou, name] = fixture.routes.gui[0]!.path
    await openDirectory(user)
    await openObject(user, ou!, new RegExp(`^${name}`))
    expect(screen.getByRole('region', { name: `Properties of ${name}` })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    await user.click(screen.getByRole('checkbox', { name: 'Unlock account' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    const banner = screen.getByText(/Saved · simulated/).closest('[role="status"]') as HTMLElement
    expect(banner).toHaveTextContent('4767')
    expect(within(banner).getByLabelText('Same change in PowerShell')).toHaveTextContent(`Unlock-ADAccount -Identity ${String(state().objects[fixture.ids.target!]!.attrs.sAMAccountName)}`)
    expect(state().objects[fixture.ids.target!]!.attrs.lockedOut).toBe(false)
    expect(getStore().campaign.active!.history.map((entry) => entry.source)).toEqual(['gui'])
    // The remaining check is the simulated sign-in test, then the engine closes the ticket.
    await user.click(rail().getByRole('button', { name: /sign-in · simulated/ }))
    await user.click(rail().getByRole('button', { name: 'Finish case' }))
    expect(getStore().screen).toBe('Debrief')
    expect(getStore().campaign.completed).toContain('case01')
  })

  it('stale editor: a terminal change to the open account shows the conflict and keeps the draft', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Maya Ali/)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    await user.click(screen.getByRole('checkbox', { name: 'Unlock account' }))
    await user.click(screen.getByRole('tab', { name: 'PowerShell' }))
    await type(user, "Set-ADUser -Identity mali -Title 'Duty Pharmacist'")
    await openDirectory(user)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    expect(screen.getByRole('checkbox', { name: 'Unlock account' })).toBeChecked()
    await user.click(details().getByRole('button', { name: 'Apply' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Not saved: an object this change touches changed after you opened the form.')
    expect(alert).toHaveTextContent('Maya Ali changed:')
    expect(alert).toHaveTextContent(/title: .*Duty Pharmacist/)
    expect(screen.getByRole('checkbox', { name: 'Unlock account' })).toBeChecked()
    expect(bySam('mali').attrs.lockedOut).toBe(true)
    await user.click(within(alert).getByRole('button', { name: 'Review with the new values' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(bySam('mali').attrs.lockedOut).toBe(false)
  })

  it('stale membership save lists the touched group that changed, not only the selected object (audit F2)', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Maya Ali/)
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    const financeStaff = Object.values(state().objects).find((object) => object.rdn === 'GG-Finance-Staff')!.guid
    await user.selectOptions(screen.getByLabelText('Add to group'), financeStaff)
    act(() => actions.terminal.runLine('Add-ADGroupMember -Identity GG-Finance-Staff -Members pnair'))
    await openDirectory(user)
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    expect(screen.getByLabelText('Add to group')).toHaveValue(financeStaff)
    await user.click(details().getByRole('button', { name: 'Apply' }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('GG-Finance-Staff changed:')
    expect(alert).toHaveTextContent('Its group memberships changed.')
    expect(alert).not.toHaveTextContent('Maya Ali changed:')
    expect(screen.getByLabelText('Add to group')).toHaveValue(financeStaff)
    expect(state().indexes.groupsByMember[bySam('mali').guid]).not.toContain(financeStaff)
  })

  it('a partial group save matches the console and never resubmits the committed change (audit F1)', async () => {
    const user = userEvent.setup(); render(<App />)
    const start = state()
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Priya Nair/)
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    const admins = Object.values(state().objects).find((object) => object.rdn === 'Domain Admins')!.guid
    const pharmacyStaff = Object.values(state().objects).find((object) => object.rdn === 'GG-Pharmacy-Staff')!.guid
    await user.selectOptions(screen.getByLabelText('Add to group'), admins)
    await user.click(screen.getByRole('checkbox', { name: 'Remove from GG-Pharmacy-Staff' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    let alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/^Error: Not allowed:/)
    expect(alert).toHaveTextContent('Saved before the failure · simulated.')
    expect(within(alert).getByLabelText('Same change in PowerShell')).toHaveTextContent('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false')
    expect(state().indexes.groupsByMember[bySam('pnair').guid] ?? []).not.toContain(pharmacyStaff)
    // The console runs the same two commands the same way: the removal commits, the add is refused.
    const rt = createRuntime({ registry: createDefaultRegistry(), actor: buildBaseDomain().ids['user.operator']!, confirm: () => true })
    const consoleResult = run("Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false; Add-ADGroupMember -Identity 'Domain Admins' -Members pnair", rt, start)
    expect(consoleResult.errors).toHaveLength(1)
    expect(consoleResult.state.memberships).toEqual(state().memberships)
    // Apply again: only the refused add is sent; the removal is never resubmitted.
    const removals = () => getStore().campaign.active!.history.filter((entry) => entry.action.type === 'group.removeMember').length
    expect(removals()).toBe(1)
    expect(screen.getByLabelText('Add to group')).toHaveValue(admins)
    await user.click(details().getByRole('button', { name: 'Apply' }))
    alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/^Error: Not allowed:/)
    expect(alert).not.toHaveTextContent('Saved before the failure')
    expect(removals()).toBe(1)
    // Choosing an allowed group finishes the draft with one more change.
    const financeStaff = Object.values(state().objects).find((object) => object.rdn === 'GG-Finance-Staff')!.guid
    await user.selectOptions(screen.getByLabelText('Add to group'), financeStaff)
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(removals()).toBe(1)
    expect(state().indexes.groupsByMember[bySam('pnair').guid]).toContain(financeStaff)
  })

  it('an edit to a different object does not make the open form stale', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Maya Ali/)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    await user.click(screen.getByRole('checkbox', { name: 'Unlock account' }))
    act(() => actions.terminal.runLine("Set-ADUser -Identity pnair -Title 'Senior Technician'"))
    await openDirectory(user)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bySam('pnair').attrs.title).toBe('Senior Technician')
    expect(bySam('mali').attrs.lockedOut).toBe(false)
  })

  it('duplicate display names: the editor targets the selected object, not the namesake', async () => {
    const user = userEvent.setup(); render(<App />)
    await type(user, "$pw = Read-Host -Prompt 'pw' -AsSecureString; New-ADUser -Name 'Maya Ali' -SamAccountName mali2 -Path 'OU=Finance,DC=corp,DC=contoso,DC=local' -AccountPassword $pw -Enabled $true")
    await user.type(await screen.findByLabelText(/pw.*simulated/), 'Namesake-Pass123')
    await user.keyboard('{Enter}')
    expect(bySam('mali2').attrs.enabled).toBe(true)
    await openDirectory(user)
    await openObject(user, 'Finance', /^Maya Ali/)
    expect(getStore().selectedObject).toBe(bySam('mali2').guid)
    await user.click(within(screen.getByRole('group', { name: 'Quick actions' })).getByRole('button', { name: 'Disable account' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(bySam('mali2').attrs.enabled).toBe(false)
    expect(bySam('mali').attrs.enabled).toBe(true)
    expect(screen.getByLabelText('Same change in PowerShell')).toHaveTextContent('Disable-ADAccount -Identity mali2')
  })

  it('each context-menu action is reachable by keyboard and by a visible button', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    for (const [ou, name] of [['Pharmacy', /^Maya Ali/], ['Role Groups', /^GG-Pharmacy-Staff/], ['Pharmacy', /^Pharmacy/]] as const) {
      if (ou === 'Role Groups') await openObject(user, 'Groups', /^Role Groups/)
      await openObject(user, ou, name)
      const object = state().objects[getStore().selectedObject!]!
      const items = menuItemsFor(object)
      expect(items.length).toBeGreaterThan(0)
      const quick = within(screen.getByRole('group', { name: 'Quick actions' }))
      for (const [index, item] of items.entries()) {
        // Keyboard: Shift+F10 on the tree opens the menu; arrows reach the item; Enter chooses it.
        tree().focus()
        fireEvent.keyDown(tree(), { key: 'F10', shiftKey: true })
        const menu = screen.getByRole('menu', { name: /^Actions for/ })
        expect(within(menu).getAllByRole('menuitem').map((node) => node.textContent)).toEqual(items.map((entry) => entry.label))
        for (let step = 0; step < index; step += 1) await user.keyboard('{ArrowDown}')
        expect(document.activeElement).toHaveTextContent(item.label)
        await user.keyboard('{Enter}')
        expect(screen.queryByRole('menu')).toBeNull()
        if (item.tab) expect(screen.getByRole('tab', { name: item.tab })).toHaveAttribute('aria-selected', 'true')
        expect(document.querySelector('.details')!.contains(document.activeElement)).toBe(true)
        // Button: the same item as a visible button.
        await user.click(quick.getByRole('button', { name: item.label.replace(/…$/, '') }))
        expect(document.querySelector('.details')!.contains(document.activeElement)).toBe(true)
      }
      // Esc closes the menu without choosing.
      fireEvent.keyDown(tree(), { key: 'ContextMenu' })
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('menu')).toBeNull()
    }
  })

  it('the password dialog stores nothing after Apply', async () => {
    const user = userEvent.setup(); render(<App />)
    const secret = 'Tr0ub4dor-Lab-77'
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Priya Nair/)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    const field = screen.getByLabelText('New password (simulated)')
    expect(field).toHaveAttribute('type', 'password')
    await user.type(field, secret)
    await user.click(within(screen.getByRole('form', { name: 'Reset password' })).getByRole('button', { name: 'Reset password' }))
    expect(field).toHaveValue('')
    expect(bySam('pnair').attrs.credentialVersion).toBe(2)
    expect(JSON.stringify(getStore())).not.toContain(secret)
    expect(JSON.stringify({ ...localStorage })).not.toContain(secret)
    expect(document.body.innerHTML).not.toContain(secret)
    expect(screen.getAllByLabelText('Same change in PowerShell').some((node) => node.textContent?.includes('-AsSecureString'))).toBe(true)
  })

  it('shows an authorization error from the pipeline instead of swallowing it', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    await openObject(user, 'Users', /^Administrator/)
    await user.click(screen.getByRole('tab', { name: 'Account' }))
    await user.click(screen.getByRole('checkbox', { name: /Account turned on/ }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/^Error: Not allowed:/)
    expect(bySam('Administrator').attrs.enabled).toBe(true)
  })

  it('move, group membership, new user, and share permissions each apply through the pipeline and show the equivalent', async () => {
    const user = userEvent.setup(); render(<App />)
    await openDirectory(user)
    await openObject(user, 'Pharmacy', /^Priya Nair/)
    // Groups tab: add to GG-Finance-Staff and remove from GG-Pharmacy-Staff in one Apply.
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    const financeStaff = Object.values(state().objects).find((object) => object.rdn === 'GG-Finance-Staff')!.guid
    await user.selectOptions(screen.getByLabelText('Add to group'), financeStaff)
    await user.click(screen.getByRole('checkbox', { name: 'Remove from GG-Pharmacy-Staff' }))
    await user.click(details().getByRole('button', { name: 'Apply' }))
    expect(screen.getByLabelText('Same change in PowerShell')).toHaveTextContent('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false')
    expect(screen.getByLabelText('Same change in PowerShell')).toHaveTextContent('Add-ADGroupMember -Identity GG-Finance-Staff -Members pnair')
    expect(state().indexes.groupsByMember[bySam('pnair').guid]).toContain(financeStaff)
    // General tab: move to Finance.
    await user.click(screen.getByRole('tab', { name: 'General' }))
    const finance = Object.values(state().objects).find((object) => object.rdn === 'Finance')!.guid
    await user.selectOptions(screen.getByLabelText('Move to'), finance)
    await user.click(within(screen.getByRole('form', { name: 'Move' })).getByRole('button', { name: 'Apply' }))
    expect(state().objects[bySam('pnair').guid]!.parent).toBe(finance)
    expect(screen.getByLabelText('Same change in PowerShell')).toHaveTextContent("Move-ADObject -Identity pnair -TargetPath 'OU=Finance,DC=corp,DC=contoso,DC=local'")
    // Share permissions: a direct read grant on Finance (DECISIONS D4).
    await user.click(within(screen.getByRole('group', { name: 'Quick actions' })).getByRole('button', { name: 'Share permissions' }))
    const share = screen.getByRole('form', { name: 'Share permissions' })
    await user.selectOptions(within(share).getByLabelText('Share'), 'share.finance')
    await user.selectOptions(within(share).getByLabelText('Layer'), 'share')
    expect(share).toHaveTextContent('Careful: a direct grant to one person')
    await user.click(within(share).getByRole('button', { name: 'Add entry' }))
    expect(within(share).getByLabelText('Same change in PowerShell')).toHaveTextContent('Add-SimResourcePermission -Resource Finance -Identity pnair -Right Read -Layer Share')
    // New user in an OU.
    await openObject(user, 'Nursing', /^Nursing/)
    await user.click(screen.getByRole('tab', { name: 'General' }))
    const create = screen.getByRole('form', { name: 'New user' })
    await user.type(within(create).getByLabelText('Full name'), 'Sam Quinn')
    await user.type(within(create).getByLabelText('Sign-in name (sAMAccountName)'), 'squinn')
    await user.click(within(create).getByRole('button', { name: 'Create' }))
    expect(bySam('squinn').attrs.enabled).toBe(false)
    expect(within(create).getByText(/Careful: The account was created disabled/)).toBeVisible()
    expect(within(create).getByLabelText('Same change in PowerShell')).toHaveTextContent("New-ADUser -Name 'Sam Quinn' -SamAccountName squinn -Path 'OU=Nursing,DC=corp,DC=contoso,DC=local' -Enabled $true")
    expect(getStore().campaign.active!.history.every((entry) => entry.source === 'gui')).toBe(true)
  })

  it('the before and after view in Evidence shows a GUI change', async () => {
    const user = userEvent.setup(); render(<App />)
    act(() => { actions.dispatchGui({ type: 'user.unlock', target: activeFixture().ids.target! as Guid }, state().revision) })
    await user.click(screen.getByRole('tab', { name: /^Evidence/ }))
    const diff = screen.getByRole('region', { name: /Before and after/ })
    expect(within(diff).getByRole('row', { name: /lockedOut True False/ })).toBeInTheDocument()
  })
})
