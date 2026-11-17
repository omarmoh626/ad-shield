// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { activeFixture, rail, statusOf, type } from '../ticket/helpers'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(cleanup)

const checklist = () => within(rail().getByRole('region', { name: 'What done looks like' }))
const row = (label: string) => checklist().getByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })

describe('What done looks like', () => {
  it('updates after each command and shows observed and required text', async () => {
    const user = userEvent.setup(); render(<App />)
    const fixture = activeFixture()
    const unlocked = getStore().campaign.active!.predicates.find((p) => p.id === 'unlocked')!
    expect(row(unlocked.label)).toHaveTextContent('Not yet')
    await user.click(row(unlocked.label))
    expect(checklist().getByText(`Now: ${unlocked.observed}. Needed: ${unlocked.required}.`)).toBeInTheDocument()

    // A read-only command changes nothing.
    await type(user, fixture.routes.script[0]!.code)
    expect(statusOf('unlocked')).toBe('unmet')
    // -WhatIf never awards progress.
    await type(user, fixture.routes.script[1]!.code)
    expect(statusOf('unlocked')).toBe('unmet')
    await type(user, fixture.routes.script[2]!.code)
    expect(statusOf('unlocked')).toBe('met')
    expect(row(unlocked.label)).toHaveTextContent('Done just now')
    const after = getStore().campaign.active!.predicates.find((p) => p.id === 'unlocked')!
    expect(checklist().getByText(`Now: ${after.observed}. Needed: ${after.required}.`)).toBeInTheDocument()
    expect(row(getStore().campaign.active!.predicates.find((p) => p.id === 'unlockEvent')!.label)).toHaveTextContent(/Done/)
  })

  it('keeps Finish case disabled with unmet criteria and names them; the engine refuses a forced click', async () => {
    render(<App />)
    const unmet = getStore().campaign.active!.predicates.filter((p) => p.status !== 'met')
    const finish = checklist().getByRole('button', { name: new RegExp(`Finish case · ${unmet.length} to go`) })
    expect(finish).toBeDisabled()
    const why = document.getElementById(finish.getAttribute('aria-describedby')!)!
    for (const predicate of unmet) expect(why).toHaveTextContent(predicate.label)
    // The UI blocks the click; the store still asks the ticket engine and cannot bypass it.
    let result: ReturnType<typeof actions.closeCase> | undefined
    act(() => { result = actions.closeCase() })
    expect(result?.closed).toBe(false)
    expect(getStore().campaign.active?.id).toBe('case01')
    expect(getStore().campaign.completed).toEqual([])
    expect(getStore().screen).toBe('Work')
    expect(why).toHaveTextContent(/observed .*; required/)
  })
})
