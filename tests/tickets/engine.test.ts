import { describe, expect, it } from 'vitest'
import { buildBaseDomain, OPERATOR_ID } from '../../src/fixtures/baseDomain'
import { createCampaign, introduceTicket, applyAction, resetAttempt, closeTicket, startReplay, applyAttemptAction, runScriptRoute, runGuiRoute } from '../../src/tickets/engine'
import { attrEquals } from '../../src/tickets/predicates'
import type { CaseFixture, TicketDef } from '../../src/tickets/types'
import { createDefaultRegistry, createRuntime, run } from '../../src/ps/runtime'

const base = buildBaseDomain()
function fixture(): CaseFixture {
  const target = base.ids['user.pnair']
  return { ticketId: 'tiny', ids: { operator: base.ids[OPERATOR_ID] }, introduce: (state) => state,
    request: { sender: 'Helpdesk', priority: 'High', impact: 'Shift delayed', sla: '1h', title: 'Tiny', story: 'Test.', goal: 'Keep the account enabled.', who: { person: 'Priya Nair', account: 'pnair' }, alreadyChecked: 'Identity verified', clue: { text: 'Account enabled' }, glossary: [], needs: 'Sign in', evidence: [] },
    responsibility: { account: 'pnair', outcome: 'enabled' }, predicates: [attrEquals('enabled', 'Account enabled', target, 'enabled', true)], hints: [{ level: 1, content: 'One' }, { level: 2, content: 'Two' }, { level: 3, content: 'Three' }], routes: { script: [{ code: 'Get-ADUser -Identity pnair', explain: 'Inspect account.' }], gui: [{ path: ['Directory', 'Priya'], action: { type: 'user.setEnabled', target, enabled: true } }] }, wrongFixes: [], debrief: () => ({ change: '', access: '', verification: '', reusableCommand: '' }), transfer: { question: 'Why?', answer: 'Because.', feedback: 'Inspect state.' } }
}
function ticket(f: CaseFixture): TicketDef { return { id: f.ticketId, tier: 1, seeds: [1, 2], build: () => f } }
const campaignFor = (f: CaseFixture) => introduceTicket(createCampaign(base.state, [f.ticketId]), ticket(f), 1)

describe('ticket campaign engine', () => {
  it('checkpoints introduction, refuses unmet closure with observed and required, and resets without erasing completions', () => {
    const f = fixture(), start = campaignFor(f), active = start.active!
    expect(active.checkpoint).toEqual(active.state)
    const completedEarlier = { ...start, completed: ['prior'] }
    const changed = applyAction(completedEarlier, f, { type: 'user.setEnabled', target: base.ids['user.pnair'], enabled: false }, f.ids.operator!).campaign
    const refused = closeTicket(changed, f)
    expect(refused.closed).toBe(false)
    expect(refused.refusal?.[0]).toContain('observed false; required true')
    const reset = resetAttempt(changed, f)
    expect(reset.active?.state.now).toBe(reset.active?.checkpoint.now)
    expect(reset.active?.state).toEqual(reset.active?.checkpoint)
    expect(reset.completed).toEqual(['prior'])
  })

  it('does not allow a second case while one remains open and keeps queue serializable', () => {
    const f = fixture(), campaign = campaignFor(f)
    expect(() => introduceTicket(campaign, ticket(f), 2)).toThrow('A case is already active')
    expect(campaign.queue).toEqual(['tiny'])
    expect(JSON.stringify(campaign)).not.toContain('build')
  })

  it('WhatIf cmdlet changes no predicate and awards no completion', () => {
    const f = fixture(), campaign = campaignFor(f), initial = campaign
    const runtime = createRuntime({ registry: createDefaultRegistry(), actor: f.ids.operator!, tickets: { getCampaign: () => campaign, setCampaign: () => { throw new Error('WhatIf must not persist campaign') }, getFixture: () => f } })
    const result = run('Close-SimTicket -WhatIf', runtime, campaign.active!.state)
    expect(result.errors).toEqual([])
    expect(campaign).toBe(initial)
    expect(campaign.active?.predicates).toEqual(initial.active?.predicates)
    expect(campaign.completed).toEqual([])
    expect(result.output).toContain('WhatIf: no completion awarded')
  })

  it('ticket cmdlets read the active ticket and reset its state and clock', () => {
    const f = fixture(), original = campaignFor(f), campaignWithPrior = { ...original, completed: ['prior'] }
    let campaign = applyAction(campaignWithPrior, f, { type: 'clock.advance', milliseconds: 60_000 }, f.ids.operator!).campaign
    const changedState = campaign.active!.state
    const runtime = createRuntime({ registry: createDefaultRegistry(), actor: f.ids.operator!, tickets: { getCampaign: () => campaign, setCampaign: (next) => { campaign = next }, getFixture: () => f } })
    expect(run('Get-SimTicket', runtime, changedState).output).toContain('Active (simulated)')
    const result = run('Reset-SimAttempt', runtime, changedState)
    expect(result.errors).toEqual([])
    expect(result.state.now).toBe(original.active!.checkpoint.now)
    expect(campaign.completed).toEqual(['prior'])
    expect(result.output).toContain('simulated attempt was reset')
  })

  it('counts first completion once and isolates replay from campaign state', () => {
    const f = fixture(), campaign = campaignFor(f), completed = closeTicket(campaign, f)
    expect(completed.closed).toBe(true)
    expect(completed.campaign.completed).toEqual(['tiny'])
    const snapshot = structuredClone(completed.campaign)
    const replay = startReplay(completed.campaign, ticket(f), 2)
    expect(replay.id).toBe('tiny')
    const changed = applyAttemptAction(replay, f, { type: 'user.setEnabled', target: base.ids['user.pnair'], enabled: false }, f.ids.operator!).attempt
    const closedReplay = closeTicket(completed.campaign, f, changed)
    expect(closedReplay.closed).toBe(false)
    expect(completed.campaign).toEqual(snapshot)
    const successReplay = closeTicket(completed.campaign, f, replay)
    expect(successReplay.closed).toBe(true)
    expect(successReplay.campaign).toEqual(snapshot)
  })

  it('runs script and GUI routes through their real execution paths and returns closure results', () => {
    const f = fixture()
    expect(runScriptRoute(f).closed).toBe(true)
    expect(runGuiRoute(f).closed).toBe(true)
    expect(() => runScriptRoute(f, [{ code: 'No-SuchCommand', explain: 'Must fail.' }])).toThrow(/step 1.*No-SuchCommand/)
  })
})
