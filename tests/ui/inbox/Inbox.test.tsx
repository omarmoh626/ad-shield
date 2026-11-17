// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'
import { createCampaign } from '../../../src/tickets/engine'
import { case01 } from '../../../src/tickets/cases/case01'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(cleanup)

describe('inbox', () => {
  it('previews of queued cases are read-only and cannot change state', async () => {
    // case01 queued but not opened yet.
    act(() => actions.setCampaign(createCampaign(buildBaseDomain().state, ['case01'])))
    act(() => actions.setScreen('Inbox'))
    const user = userEvent.setup(); render(<App />)
    const campaign = getStore().campaign
    const saved = localStorage.getItem('adshield.v1')
    const inbox = within(screen.getByRole('article', { name: 'Inbox' }))
    expect(inbox.getByText('Queued')).toBeInTheDocument()
    await user.click(inbox.getByRole('button', { name: /Preview case01 · read-only/ }))
    const preview = screen.getByRole('article', { name: case01.build(1).request.title })
    expect(within(preview).getByRole('note')).toHaveTextContent(/read-only/)
    expect(within(preview).queryByRole('button', { name: 'Start investigating' })).toBeNull()
    // Opening terms and reading changes nothing.
    for (const term of within(preview).queryAllByRole('button', { expanded: false })) await user.click(term)
    await user.click(within(preview).getByRole('button', { name: 'Back to inbox' }))
    expect(getStore().campaign).toBe(campaign)
    expect(getStore().campaign.active).toBeUndefined()
    expect(localStorage.getItem('adshield.v1')).toBe(saved)
    expect(getStore().screen).toBe('Inbox')
  })

  it('lists the active case with Open and shows the cheat sheet', async () => {
    act(() => actions.setScreen('Inbox'))
    const user = userEvent.setup(); render(<App />)
    const inbox = within(screen.getByRole('article', { name: 'Inbox' }))
    expect(inbox.getByText('Active')).toBeInTheDocument()
    expect(inbox.getByRole('region', { name: 'Your cheat sheet' })).toHaveTextContent(/Finish a case/)
    await user.click(inbox.getByRole('button', { name: 'Open' }))
    expect(getStore().screen).toBe('Read')
  })
})
