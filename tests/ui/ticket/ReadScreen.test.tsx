// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore } from '../../../src/ui/store'
import { markFirstUses, termsFor } from '../../../src/ui/glossary/terms'
import { activeFixture, type, visibleText } from './helpers'

afterEach(cleanup)

// No resetStore here: this file checks what a fresh app load shows.
describe('Read screen and first open', () => {
  it('opens on case 01 with the console ready and hints closed', async () => {
    const user = userEvent.setup(); render(<App />)
    const request = activeFixture().request
    expect(getStore().campaign.active?.id).toBe('case01')
    expect(screen.getByRole('heading', { level: 1, name: request.title })).toBeVisible()
    // The console is mounted behind the ticket, so the draft and transcript are ready.
    const command = screen.getByLabelText('PowerShell command')
    expect(command).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start investigating' }))
    expect(command).toBeVisible()
    expect(command).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Show hint 1 of 3' })).toBeVisible()
    expect(screen.queryByText(activeFixture().hints[0].content)).toBeNull()
  })

  it('shows sender, priority, impact, verification evidence, needs, and the account the learner owns', () => {
    act(() => actions.openActive())
    render(<App />)
    const fixture = activeFixture()
    const read = screen.getByRole('article', { name: fixture.request.title })
    const text = visibleText(read)
    for (const part of [`New ticket from the ${fixture.request.sender}`, `Priority: ${fixture.request.priority}`, fixture.request.impact, fixture.request.alreadyChecked, fixture.request.needs, ...fixture.request.evidence]) expect(text).toContain(part)
    expect(within(screen.getByRole('heading', { name: 'What you own' }).parentElement!).getByText(fixture.responsibility.account, { selector: 'code' })).toBeInTheDocument()
    expect(text).toContain(fixture.responsibility.outcome)
  })

  it('defines an unfamiliar term in place on first use, including OU, GPO, and ACL', async () => {
    const terms = termsFor(activeFixture().request.glossary)
    const [first, second] = markFirstUses(['Move it to the OU. The OU and its GPO apply.', 'Read the ACL, then the GPO again.'], terms)
    const marked = [...first!, ...second!].filter((segment) => 'term' in segment).map((segment) => segment.text)
    expect(marked).toEqual(['OU', 'GPO', 'ACL'])
    // "you" never counts as OU.
    expect(markFirstUses(['Thank you'], terms)[0]!.some((segment) => 'term' in segment)).toBe(false)

    act(() => actions.openActive())
    const user = userEvent.setup(); render(<App />)
    // The evidence mentions event 4740 first; the term is defined right there.
    const termButton = screen.getByRole('button', { name: /^event 4740$/i })
    await user.click(termButton)
    expect(termButton).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(termButton.getAttribute('aria-describedby')!)).toHaveTextContent(/recorded when an account is locked out/)
    expect(document.getElementById(termButton.getAttribute('aria-describedby')!)).toBeVisible()
  })

  it('puts "simulated" next to sign-in tests and password prompts', async () => {
    act(() => actions.openActive())
    const user = userEvent.setup(); render(<App />)
    await user.click(screen.getByRole('button', { name: 'Start investigating' }))
    expect(screen.getByRole('button', { name: /Test Maya's sign-in · simulated/ })).toBeVisible()
    await type(user, "$pw = Read-Host -Prompt 'New password' -AsSecureString")
    expect(await screen.findByLabelText(/New password.*simulated/)).toHaveAttribute('type', 'password')
  })
})
