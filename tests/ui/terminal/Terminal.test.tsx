// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'

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
})
