// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import AuditLog from '../../../src/ui/log/AuditLog'
import AttemptTimeline from '../../../src/ui/timeline/AttemptTimeline'
import { EMPTY_FILTER, filterEvents } from '../../../src/ui/log/logFilter'
import { actions, getStore, resetStore } from '../../../src/ui/store'
import type { AuditEvent, DomainState, Guid } from '../../../src/domain/types'
import { activeFixture, type } from '../ticket/helpers'

beforeEach(() => resetStore())
afterEach(cleanup)

const active = () => getStore().campaign.active!
const events = () => within(screen.getByRole('list', { name: 'Audit events' })).queryAllByRole('listitem')

/** The active state plus synthetic events from each origin, so the log has all three to label. */
function withOrigins(state: DomainState, count = 0): DomainState {
  const seq = Math.max(0, ...state.events.map((event) => event.seq))
  const extra: AuditEvent[] = [
    { seq: seq + 1, time: state.now, origin: 'entra', source: 'system', data: { kind: 'entra.signIn', targetName: 'mali' } },
    { seq: seq + 2, time: state.now, origin: 'simulator', source: 'system', data: { kind: 'clock.advance', milliseconds: '60000' } },
    ...Array.from({ length: count }, (_, index): AuditEvent => ({ seq: seq + 3 + index, time: state.now, origin: 'windows', host: 'DC01', log: 'Security', eventId: 4625, source: 'system', data: { targetName: `bulk${index}` } })),
  ]
  return { ...state, events: [...state.events, ...extra] }
}

describe('audit log', () => {
  it('filters by event ID and by target, and labels origins in text', async () => {
    const user = userEvent.setup()
    const state = withOrigins(active().state)
    render(<AuditLog state={state} />)
    const text = events().map((row) => row.textContent ?? '').join(' ')
    for (const label of ['Windows', 'Entra', 'Simulator']) expect(text).toContain(label)
    expect(events().find((row) => row.textContent?.includes('Entra'))).toHaveClass('origin-entra')

    await user.type(screen.getByRole('textbox', { name: 'Event ID' }), '4740')
    expect(events().length).toBeGreaterThan(0)
    for (const row of events()) expect(row).toHaveTextContent('4740')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    const target = state.objects[activeFixture().ids.target!]!
    await user.type(screen.getByRole('textbox', { name: 'Target' }), String(target.attrs.sAMAccountName))
    expect(events().length).toBe(filterEvents(state, { ...EMPTY_FILTER, target: String(target.attrs.sAMAccountName) }).length)
    for (const row of events()) expect(row.textContent).toMatch(new RegExp(`${String(target.attrs.displayName)}|${String(target.attrs.sAMAccountName)}`))
    await user.clear(screen.getByRole('textbox', { name: 'Target' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Source' }), 'Simulator')
    expect(events()).toHaveLength(filterEvents(state, { ...EMPTY_FILTER, origin: 'simulator' }).length)
    for (const row of events()) expect(row).toHaveTextContent('Simulator')
  })

  it('filters by host, actor, and free text', () => {
    const state = withOrigins(active().state)
    const operator = state.objects[activeFixture().ids.operator!]!
    expect(filterEvents(state, { ...EMPTY_FILTER, host: 'dc01' }).every((event) => event.host?.toLowerCase().includes('dc01'))).toBe(true)
    expect(filterEvents(state, { ...EMPTY_FILTER, text: 'entra.signIn' })).toHaveLength(1)
    const byActor = filterEvents(state, { ...EMPTY_FILTER, actor: String(operator.attrs.sAMAccountName) })
    expect(byActor.every((event) => event.actor === operator.guid || event.data.actorName?.includes(String(operator.attrs.sAMAccountName)))).toBe(true)
  })

  it('renders only a window of a large log', () => {
    render(<AuditLog state={withOrigins(active().state, 5_000)} />)
    expect(screen.getByText(/of \d+ events/)).toHaveTextContent(/^\d+ of \d+ events/)
    expect(events().length).toBeLessThan(40)
  })

  it('never writes state', async () => {
    const user = userEvent.setup()
    const before = active().state
    render(<AuditLog state={before} />)
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'unlock')
    expect(active().state).toBe(before)
  })
})

describe('attempt timeline', () => {
  it('shows console and Directory changes together, oldest first', async () => {
    const user = userEvent.setup()
    render(<App />)
    const target = activeFixture().ids.target!
    await type(user, `Set-ADUser -Identity ${String(active().state.objects[target]!.attrs.sAMAccountName)} -Title 'Lead Pharmacist'`)
    act(() => { actions.dispatchGui({ type: 'user.unlock', target }, active().state.revision) })
    cleanup()
    render(<AttemptTimeline attempt={active()} />)
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('PowerShell')
    expect(rows[1]).toContain('Directory')
    expect(rows[1]).toContain('4767')
    expect(active().history.map((entry) => entry.source)).toEqual(['console', 'gui'])
  })

  it('says so when the attempt has no changes yet', () => {
    render(<AttemptTimeline attempt={active()} />)
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument()
  })
})

describe('store dispatchGui', () => {
  it('returns a stale result unswallowed and keeps state', () => {
    const target = activeFixture().ids.target!
    const base = active().state.revision
    actions.dispatchGui({ type: 'user.setAttrs', target, attrs: { title: 'Changed elsewhere' } }, base)
    const before = active().state
    const result = actions.dispatchGui({ type: 'user.unlock', target }, base)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('stale')
    expect(active().state).toBe(before)
  })

  it('refuses without an open case and dispatches nothing', () => {
    actions.setCampaign({ ...getStore().campaign, active: undefined })
    const result = actions.dispatchGui({ type: 'user.unlock', target: 'x' as Guid }, 0)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/No case is open/)
  })
})
