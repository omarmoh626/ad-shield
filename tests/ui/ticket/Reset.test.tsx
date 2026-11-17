// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { getTicket } from '../../../src/tickets/cases'
import { activeFixture, rail, solveWithTerminal, statusOf, type } from './helpers'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(cleanup)

async function reset(user: ReturnType<typeof userEvent.setup>) {
  await user.click(rail().getByRole('button', { name: 'Reset this attempt' }))
  const confirm = within(rail().getByRole('group', { name: 'Confirm reset' }))
  expect(confirm.getByText(/cheat sheet stay/)).toBeInTheDocument()
  await user.click(confirm.getByRole('button', { name: 'Yes, reset' }))
}

describe('Reset this attempt', () => {
  it('asks first, then restores case 01 to its checkpoint', async () => {
    const user = userEvent.setup(); render(<App />)
    const checkpoint = getStore().campaign.active!.checkpoint
    await type(user, activeFixture().routes.script[2]!.code)
    expect(statusOf('unlocked')).toBe('met')
    await user.click(rail().getByRole('button', { name: 'Reset this attempt' }))
    await user.click(rail().getByRole('button', { name: 'Cancel' }))
    expect(statusOf('unlocked')).toBe('met')
    await reset(user)
    const active = getStore().campaign.active!
    expect(active.id).toBe('case01')
    expect(active.history).toEqual([])
    expect(active.state).toEqual(checkpoint)
    expect(statusOf('unlocked')).toBe('unmet')
  })

  it('keeps the cheat sheet and earlier completions', async () => {
    const user = userEvent.setup(); render(<App />)
    await solveWithTerminal(user)
    await user.click(rail().getByRole('button', { name: 'Finish case' }))
    const command = activeFixtureCommand()
    await user.click(screen.getByRole('button', { name: 'Try this case again, new details' }))
    act(() => actions.startInvestigating())
    await type(user, activeFixture().routes.script[2]!.code)
    await reset(user)
    expect(getStore().campaign.completed).toEqual(['case01'])
    expect(statusOf('unlocked')).toBe('unmet')
    act(() => actions.setScreen('Inbox'))
    expect(screen.getByRole('region', { name: 'Your cheat sheet' })).toHaveTextContent(command)
  })
})

/** The reusable command the closed attempt's own debrief saved. */
function activeFixtureCommand() {
  const closed = getStore().campaign.history.at(-1)!
  return getTicket(closed.id)!.build(closed.seed).debrief(closed).reusableCommand
}
