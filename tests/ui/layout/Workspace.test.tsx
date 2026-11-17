// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'
import { case01 } from '../../../src/tickets/cases/case01'
import { createCampaign, introduceTicket } from '../../../src/tickets/engine'

beforeEach(() => {
  resetStore()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
})
afterEach(cleanup)

describe('responsive workspace', () => {
  it('exposes named slots and keeps draft and active case across narrow tabs', async () => {
    const user = userEvent.setup(); render(<App />)
    expect(document.querySelector('[data-region="top"]')).toBeTruthy()
    expect(document.querySelector('[data-region="left"]')).toBeTruthy()
    expect(document.querySelector('[data-region="upper"]')).toBeTruthy()
    expect(document.querySelector('[data-region="lower"]')).toBeTruthy()
    const mobileTabs = within(screen.getByRole('navigation', { name: 'Workspace tabs' }))
    await user.type(screen.getByRole('textbox', { name: 'PowerShell command' }), 'Get-ADUser')
    await user.click(mobileTabs.getByRole('button', { name: 'Directory' }))
    await user.click(mobileTabs.getByRole('button', { name: 'PowerShell' }))
    expect(screen.getByRole('textbox', { name: 'PowerShell command' })).toHaveValue('Get-ADUser')
    expect(getStore().campaign.active?.id).toBe('case01')
  })

  it('takes header title and goal from the active fixture variant, not hard-coded copy', () => {
    const campaign = introduceTicket(createCampaign(buildBaseDomain().state, ['case01']), case01, 2)
    actions.setCampaign(campaign)
    render(<App />)
    const request = case01.build(2).request
    expect(screen.getByRole('banner')).toHaveTextContent(request.title)
    expect(screen.getByText(request.goal)).toBeInTheDocument()
  })

  it('maps D1 slots onto Work tabs and keeps the terminal transcript across tabs and screens', async () => {
    const user = userEvent.setup(); render(<App />)
    expect(document.querySelector('[data-region="lower"]')).toContainElement(screen.getByRole('textbox', { name: 'PowerShell command' }))
    await user.type(screen.getByRole('textbox', { name: 'PowerShell command' }), 'Get-Command{Enter}')
    expect(await screen.findByText(/Get-ADUser/)).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Directory' }))
    expect(document.querySelector('[data-region="upper"]')).toBeVisible()
    expect(document.querySelector('[data-region="lower"]')).not.toBeVisible()
    await user.click(within(screen.getByRole('navigation', { name: 'Workspace tabs' })).getByRole('button', { name: 'Ticket' }))
    expect(getStore().screen).toBe('Read')
    await user.click(within(screen.getByRole('navigation', { name: 'Workspace tabs' })).getByRole('button', { name: 'PowerShell' }))
    expect(screen.getByText(/Get-ADUser/)).toBeVisible()
  })

  it('runLine from another tab opens the PowerShell tab and runs in the mounted terminal', async () => {
    render(<App />)
    act(() => actions.setTab('Directory'))
    act(() => actions.terminal.runLine('Get-Command'))
    expect(getStore().tab).toBe('PowerShell')
    expect(await screen.findByText(/Get-ADUser/)).toBeVisible()
  })
})
