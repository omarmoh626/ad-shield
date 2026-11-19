// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { introduceTicket } from '../../../src/tickets/engine'
import { getTicket } from '../../../src/tickets/cases'

afterEach(cleanup)
beforeEach(resetStore)

describe('PowerShell terminal', () => {
  it('prints command output and recalls command with Up', async () => {
    const user = userEvent.setup(); render(<App />)
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    await user.type(command, 'Get-Command')
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/Get-ADUser/)).toBeTruthy()
    await user.click(command); await user.keyboard('{ArrowUp}')
    expect(command).toHaveValue('Get-Command')
  })

  it('completes cmdlets and then parameter names from registry', async () => {
    // Clear module-level UI state left by earlier rendered app instances.
    const user = userEvent.setup();
    render(<App />)
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    await user.type(command, 'Get-ADU')
    await user.keyboard('{Tab}')
    expect(command).toHaveValue('Get-ADUser ')
    await user.type(command, '-Pro')
    await user.keyboard('{Tab}')
    expect(command).toHaveValue('Get-ADUser -Properties ')
  })

  it('shows parse errors and leaves domain state unchanged', async () => {
    const user = userEvent.setup(); render(<App />)
    const before = getStore().campaign.active!.state
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    await user.type(command, "Get-ADUser -Identity 'unterminated")
    await user.keyboard('{Enter}')
    expect(await screen.findByText(/Error:.*string|Error:.*quote/i)).toBeTruthy()
    expect(getStore().campaign.active!.state).toBe(before)
  })

  it('masks secure prompt and never displays submitted value', async () => {
    const user = userEvent.setup(); render(<App />)
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    await user.type(command, "Read-Host -AsSecureString -Prompt 'Password (simulated)'")
    await user.keyboard('{Enter}')
    const secret = await screen.findByLabelText(/simulated/i)
    expect(secret).toHaveAttribute('type', 'password')
    await user.type(secret, 'NeverRenderMe123!')
    await user.click(screen.getByRole('button', { name: 'Submit simulated input' }))
    expect(screen.queryByText('NeverRenderMe123!')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'PowerShell command' })).toBeInTheDocument()
    expect(getStore().draft).not.toContain('NeverRenderMe123!')
  })

  it('keeps terminal API available to actions', async () => {
    render(<App />)
    actions.terminal.runLine('Get-Command')
    expect(await screen.findByText(/Get-ADUser/)).toBeTruthy()
  })

  it('replays multiple secure prompts without losing queued verdicts', async () => {
    const user = userEvent.setup(); render(<App />)
    actions.terminal.runLine("Read-Host -AsSecureString -Prompt 'First simulated password'\nRead-Host -AsSecureString -Prompt 'Second simulated password'")
    let secret = await screen.findByLabelText(/First simulated password.*simulated/i)
    await user.type(secret, 'SecureValueOne123!')
    await user.click(screen.getByRole('button', { name: 'Submit simulated input' }))
    secret = await screen.findByLabelText(/Second simulated password.*simulated/i)
    await user.type(secret, 'SecureValueTwo456!')
    await user.click(screen.getByRole('button', { name: 'Submit simulated input' }))
    // Both verdicts stay queued through replay: the run finishes and does not ask again.
    expect(await screen.findByRole('textbox', { name: 'PowerShell command' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/simulated password/i)).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/SecureValue(?:One|Two)/)
    expect(JSON.stringify(getStore())).not.toMatch(/SecureValue(?:One|Two)/)
    expect(localStorage.getItem('adshield.v1') ?? '').not.toMatch(/SecureValue(?:One|Two)/)
  })

  it('script pad runs one line at a time, then all lines', async () => {
    const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: 'Script pad' }))
    const pad = screen.getByLabelText('Script pad')
    await user.clear(pad)
    await user.type(pad, "Get-Help Get-ADUser{Enter}Get-Command -Name 'Get-ADGroup'")
    await user.click(screen.getByRole('button', { name: /Run one line · next: line 1/ }))
    expect(await screen.findByText('PS C:\\Lab> Get-Help Get-ADUser')).toBeInTheDocument()
    expect(screen.queryByText("PS C:\\Lab> Get-Command -Name 'Get-ADGroup'")).toBeNull()
    await user.click(screen.getByRole('button', { name: /Run one line · next: line 2/ }))
    expect(await screen.findByText("PS C:\\Lab> Get-Command -Name 'Get-ADGroup'")).toBeInTheDocument()
  })

  it('asks for confirmation and replays with the selected answer', async () => {
    const user = userEvent.setup(); render(<App />)
    actions.terminal.runLine("Remove-ADGroupMember -Identity 'GG-Pharmacy-Staff' -Members mali")
    expect(await screen.findByRole('group', { name: 'Confirmation prompt' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(await screen.findByText(/cancelled because the change was not confirmed/i)).toBeTruthy()
  })

  // T10 K1 (D9): one console session per case attempt.
  const TYPED = 'Typed-Secret-2026x'
  async function typeLine(user: ReturnType<typeof userEvent.setup>, line: string) {
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    await user.click(command); await user.type(command, line.replace(/[{[]/g, (c) => c + c)); await user.keyboard('{Enter}')
  }
  async function answerSecure(user: ReturnType<typeof userEvent.setup>) {
    const secret = await screen.findByLabelText(/simulated/i)
    await user.type(secret, TYPED); await user.keyboard('{Enter}')
  }

  it('keeps $pw from Read-Host -AsSecureString for the next typed line', async () => {
    const user = userEvent.setup(); render(<App />)
    await typeLine(user, "$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString")
    await answerSecure(user)
    await typeLine(user, "New-ADUser -Name 'Test Person' -SamAccountName tperson -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local' -AccountPassword $pw -Enabled $true")
    const state = getStore().campaign.active!.state
    const created = Object.values(state.objects).find((object) => object.attrs.sAMAccountName === 'tperson')
    expect(created).toBeTruthy()
    expect(created!.attrs.enabled).toBe(true)
    expect(screen.queryByText(/Cannot convert value/)).toBeNull()
  })

  /** Live values of every input and textarea on the page (a DOM property; innerHTML does not show it). */
  const liveValues = (except?: string) => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
    .filter((field) => field.id !== except).map((field) => field.value)

  it('never puts the typed password in a live field, the page, the save, the store, events, or history', async () => {
    const user = userEvent.setup(); render(<App />)
    await typeLine(user, "$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString")
    // While the prompt is open, only the masked secure field holds the characters.
    const secret = await screen.findByLabelText(/simulated/i) as HTMLInputElement
    await user.type(secret, TYPED)
    expect(secret.type).toBe('password')
    expect(secret.value).toBe(TYPED)
    expect(liveValues('secure').some((value) => value.includes(TYPED))).toBe(false)
    expect(document.body.textContent).not.toContain(TYPED)
    await user.keyboard('{Enter}')
    // After submission no field holds them, and neither does anything else.
    expect(liveValues().some((value) => value.includes(TYPED))).toBe(false)
    await typeLine(user, "New-ADUser -Name 'Test Person' -SamAccountName tperson -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local' -AccountPassword $pw -Enabled $true")
    await typeLine(user, '$pw')
    expect(liveValues().some((value) => value.includes(TYPED))).toBe(false)
    const saved = localStorage.getItem('adshield.v1') ?? ''
    expect(saved).toContain('tperson')
    expect(saved).not.toContain(TYPED)
    expect(document.body.innerHTML).not.toContain(TYPED)
    expect(document.body.textContent).not.toContain(TYPED)
    expect(JSON.stringify(getStore())).not.toContain(TYPED)
    expect(JSON.stringify(getStore().campaign.active!.state.events)).not.toContain(TYPED)
    const command = screen.getByRole('textbox', { name: 'PowerShell command' })
    for (let step = 0; step < 3; step += 1) {
      await user.click(command); await user.keyboard('{ArrowUp}')
      expect((command as HTMLInputElement).value).not.toContain(TYPED)
    }
  })

  it('clears console variables on Reset this attempt', async () => {
    const user = userEvent.setup(); render(<App />)
    await typeLine(user, "$note = 'kept'")
    await typeLine(user, '$note')
    expect(await screen.findByText('kept')).toBeTruthy()
    act(() => { actions.resetAttempt() })
    await typeLine(user, '"[$note]"')
    expect(await screen.findByText('[]')).toBeTruthy()
  })

  it('clears console variables when another case opens', async () => {
    const user = userEvent.setup(); render(<App />)
    await typeLine(user, "$note = 'kept'")
    act(() => { actions.setCampaign(introduceTicket({ ...getStore().campaign, active: undefined, queue: [...getStore().campaign.queue, 'case02'] }, getTicket('case02')!, 1)) })
    act(() => { actions.startInvestigating('PowerShell') })
    await typeLine(user, '"[$note]"')
    expect(await screen.findByText('[]')).toBeTruthy()
  })

  it('starts with no console variables after the app mounts again (reload)', async () => {
    const user = userEvent.setup()
    const first = render(<App />)
    await typeLine(user, "$note = 'kept'")
    first.unmount()
    render(<App />)
    act(() => { actions.startInvestigating('PowerShell') })
    await typeLine(user, '"[$note]"')
    expect(await screen.findByText('[]')).toBeTruthy()
  })
})

