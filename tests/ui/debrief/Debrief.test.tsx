// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'
import { case01 } from '../../../src/tickets/cases/case01'
import { createCampaign, introduceTicket } from '../../../src/tickets/engine'
import { getTicket } from '../../../src/tickets/cases'
import { activeFixture, rail, solveWithTerminal } from '../ticket/helpers'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(cleanup)

async function finish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(rail().getByRole('button', { name: 'Finish case' }))
  return screen.getByRole('article', { name: /./ })
}

describe('debrief', () => {
  it('can be reached with the terminal only, and shows the change actually made from attempt history', async () => {
    const user = userEvent.setup(); render(<App />)
    const fixture = activeFixture()
    // Move lab time first: a canned debrief could not know about this step.
    await user.click(screen.getByRole('button', { name: 'Advance lab time' }))
    await solveWithTerminal(user)
    const debrief = await finish(user)
    const closed = getStore().campaign.history.at(-1)!
    expect(getStore().screen).toBe('Debrief')
    expect(getStore().campaign.completed).toEqual(['case01'])
    expect(debrief).toHaveTextContent('first time solved')
    const steps = within(within(debrief).getByRole('region', { name: 'What you did' }).querySelector('ol')!).getAllByRole('listitem').map((item) => item.textContent)
    expect(steps[0]).toMatch(/Lab time moved forward 1 min \(simulated\)/)
    expect(steps.some((text) => /You unlocked Maya Ali \(mali\)\..*Event 4767/.test(text ?? ''))).toBe(true)
    expect(steps.some((text) => /Maya Ali \(mali\) signed in \(simulated\).*Event 4624/.test(text ?? ''))).toBe(true)
    expect(debrief).toHaveTextContent(fixture.debrief(closed).change)
    expect(debrief).toHaveTextContent(fixture.debrief(closed).verification)
    expect(within(debrief).getByRole('region', { name: 'Saved to your cheat sheet' })).toHaveTextContent(fixture.debrief(closed).reusableCommand)
    expect(within(debrief).getByRole('region', { name: 'What you left alone' })).toHaveTextContent(/password was not changed/)
  })

  it('names the other variant’s person when that variant was solved', async () => {
    act(() => actions.setCampaign(introduceTicket(createCampaign(buildBaseDomain().state, ['case01']), case01, 2)))
    const user = userEvent.setup(); render(<App />)
    const name = activeFixture().request.who.person.split(',')[0]!
    expect(name).not.toBe('Maya Ali')
    await solveWithTerminal(user)
    const debrief = await finish(user)
    expect(debrief).toHaveTextContent(`You unlocked ${name} (${activeOrClosedAccount()}).`)
    expect(debrief).not.toHaveTextContent('Maya Ali')
  })

  it('transfer question feedback points to group membership and share permissions', async () => {
    const user = userEvent.setup(); render(<App />)
    await solveWithTerminal(user)
    const debrief = await finish(user)
    const quick = within(within(debrief).getByRole('region', { name: 'Quick check' }))
    expect(quick.getByRole('button', { name: 'Check my answer' })).toBeDisabled()
    await user.click(quick.getByRole('radio', { name: 'Reset the password' }))
    await user.click(quick.getByRole('button', { name: 'Check my answer' }))
    const feedback = quick.getByRole('status')
    expect(feedback).toHaveTextContent(/Not quite/)
    expect(feedback).toHaveTextContent(/group memberships/)
    expect(feedback).toHaveTextContent(/share layer/)
    expect(feedback).toHaveTextContent(/permissions/)
    await user.click(quick.getByRole('radio', { name: /group memberships and the share's permissions/ }))
    await user.click(quick.getByRole('button', { name: 'Check my answer' }))
    expect(quick.getByRole('status')).toHaveTextContent(/^Right\./)
  })

  it('offers a fresh variation that runs as a replay and never counts twice', async () => {
    const user = userEvent.setup(); render(<App />)
    await solveWithTerminal(user)
    await finish(user)
    await user.click(screen.getByRole('button', { name: 'Try this case again, new details' }))
    const replay = getStore().campaign.active!
    expect(replay.replay).toBe(true)
    expect(replay.seed).not.toBe(1)
    expect(getStore().screen).toBe('Read')
    await user.click(screen.getByRole('button', { name: 'Start in PowerShell' }))
    expect(screen.getByRole('button', { name: 'Show hint 1 of 3' })).toBeVisible()
    await solveWithTerminal(user)
    const debrief = await finish(user)
    expect(debrief).toHaveTextContent('replay, not counted')
    expect(getStore().campaign.completed).toEqual(['case01'])
    expect(getStore().campaign.history).toHaveLength(1)
  })
})

function activeOrClosedAccount() {
  const attempt = getStore().debrief!.attempt
  return getTicket(attempt.id)!.build(attempt.seed).request.who.account
}
