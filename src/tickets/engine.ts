import { dispatch } from '../engine/dispatch'
import type { Action } from '../engine/types'
import type { CaseFixture, CampaignState, Attempt, TicketDef, RouteResult } from './types'
import type { ActionResult } from '../engine/types'
import { evaluatePredicates } from './predicates'
import { buildBaseDomain } from '../fixtures/baseDomain'
import { createDefaultRegistry, createRuntime, run } from '../ps/runtime'

const copy = <T>(value: T): T => structuredClone(value)
export function createCampaign(base: CampaignState['base'], queue: string[]): CampaignState { return { base, queue: [...queue], completed: [], history: [] } }
export function previews(campaign: CampaignState, lookup: (id: string) => TicketDef | undefined) { return campaign.queue.flatMap((id) => { const ticket = lookup(id); return ticket && !campaign.completed.includes(id) ? [{ id, tier: ticket.tier, readOnly: true as const }] : [] }) }
export function introduceTicket(campaign: CampaignState, ticket: TicketDef, seed: number): CampaignState {
  if (campaign.active) throw new Error('A case is already active.')
  if (!campaign.queue.includes(ticket.id)) throw new Error(`Ticket ${ticket.id} is not in the campaign queue.`)
  if (campaign.completed.includes(ticket.id)) throw new Error(`Ticket ${ticket.id} is complete. Use startReplay for an isolated replay.`)
  const fixture = ticket.build(seed)
  if (fixture.ticketId !== ticket.id) throw new Error(`Fixture ticketId ${fixture.ticketId} does not match TicketDef.id ${ticket.id}.`)
  const initial = fixture.introduce(copy(campaign.base))
  const attempt: Attempt = { id: ticket.id, seed, state: initial, checkpoint: copy(initial), history: [], predicates: [], completed: false, replay: false }
  attempt.predicates = evaluatePredicates(initial, attempt, fixture.predicates)
  return { ...campaign, active: attempt }
}
export function startReplay(campaign: CampaignState, ticket: TicketDef, seed: number): Attempt {
  if (!campaign.completed.includes(ticket.id)) throw new Error(`Ticket ${ticket.id} has no completed attempt to replay.`)
  const fixture = ticket.build(seed)
  if (fixture.ticketId !== ticket.id) throw new Error(`Fixture ticketId ${fixture.ticketId} does not match TicketDef.id ${ticket.id}.`)
  const initial = fixture.introduce(copy(campaign.base))
  const attempt: Attempt = { id: ticket.id, seed, state: initial, checkpoint: copy(initial), history: [], predicates: [], completed: false, replay: true }
  attempt.predicates = evaluatePredicates(initial, attempt, fixture.predicates)
  return attempt
}
export function applyAction(campaign: CampaignState, fixture: CaseFixture, action: Action, actor: Parameters<typeof dispatch>[2]['actor'], source: 'console' | 'gui' = 'console', whatIf = false) {
  const attempt = campaign.active
  if (!attempt) throw new Error('No case is active.')
  const result = dispatch(attempt.state, action, { actor, source, whatIf })
  if (!result.ok || whatIf || result.state === attempt.state) return { campaign, result }
  return { campaign: recordCommittedAction(campaign, fixture, action, result, source), result }
}
export function resetAttempt(campaign: CampaignState, fixture: CaseFixture): CampaignState {
  if (!campaign.active) throw new Error('No case is active.')
  const active = { ...campaign.active, state: copy(campaign.active.checkpoint), history: [], completed: false }
  active.predicates = evaluatePredicates(active.state, active, fixture.predicates)
  return { ...campaign, active }
}
export function recordCommittedAction(campaign: CampaignState, fixture: CaseFixture, action: Action, result: ActionResult, source: 'console' | 'gui' = 'console'): CampaignState {
  const attempt = campaign.active
  if (!attempt || !result.ok || result.state === attempt.state) return campaign
  const next = { ...attempt, state: result.state, history: [...attempt.history, { action, source, revision: result.state.revision, whatIf: false }] }
  next.predicates = evaluatePredicates(next.state, next, fixture.predicates)
  return { ...campaign, active: next }
}
export function applyAttemptAction(attempt: Attempt, fixture: CaseFixture, action: Action, actor: Parameters<typeof dispatch>[2]['actor'], source: 'console' | 'gui' = 'console') {
  const result = dispatch(attempt.state, action, { actor, source, whatIf: false })
  if (!result.ok || result.state === attempt.state) return { attempt, result }
  const next = { ...attempt, state: result.state, history: [...attempt.history, { action, source, revision: result.state.revision, whatIf: false }] }
  next.predicates = evaluatePredicates(next.state, next, fixture.predicates)
  return { attempt: next, result }
}
export function closeTicket(campaign: CampaignState, fixture: CaseFixture, replayAttempt?: Attempt): { campaign: CampaignState; attempt?: Attempt; closed: boolean; refusal?: string[] } {
  const attempt = replayAttempt ?? campaign.active
  if (!attempt) throw new Error('No case is active.')
  const predicates = evaluatePredicates(attempt.state, attempt, fixture.predicates)
  const refusal = predicates.filter((p) => p.status !== 'met').map((p) => `${p.label}: observed ${p.observed}; required ${p.required}`)
  if (refusal.length) return { campaign, closed: false, refusal }
  if (attempt.replay) return { campaign, attempt: { ...attempt, predicates, completed: false }, closed: true }
  const done = { ...attempt, predicates, completed: !attempt.replay }
  const updated = { ...campaign, active: undefined, completed: attempt.replay || campaign.completed.includes(attempt.id) ? campaign.completed : [...campaign.completed, attempt.id], history: [...campaign.history, done] }
  return { campaign: updated, attempt: done, closed: true }
}

export function runScriptRoute(fixture: CaseFixture, steps: CaseFixture['routes']['script'] = fixture.routes.script, base: Attempt['state'] = buildBaseDomain().state, seed = 1): RouteResult {
  const ticket: TicketDef = { id: fixture.ticketId, tier: 1, seeds: [seed], build: () => fixture }
  let campaign = introduceTicket(createCampaign(base, [ticket.id]), ticket, seed)
  const actor = fixture.ids.operator
  if (!actor) throw new Error(`Ticket ${ticket.id} fixture is missing ids.operator.`)
  const runtime = createRuntime({ registry: createDefaultRegistry(), actor, tickets: {
    getCampaign: () => campaign, setCampaign: (next) => { campaign = next }, getFixture: (id) => id === fixture.ticketId ? fixture : undefined,
  } })
  let state = campaign.active!.state
  for (const [index, step] of steps.entries()) {
    const result = run(step.code, runtime, state)
    if (result.pending) throw new Error(`Script route step ${index + 1} (${step.code}) stayed pending: ${result.pending.prompt}`)
    if (result.errors.length) throw new Error(`Script route step ${index + 1} (${step.code}) failed: ${result.errors.map((error) => error.message).join('; ')}`)
    state = result.state
  }
  const closed = closeTicket(campaign, fixture)
  return { ...closed.attempt ?? campaign.active!, closed: closed.closed, refusal: closed.refusal }
}
export function runGuiRoute(fixture: CaseFixture, base: Attempt['state'] = buildBaseDomain().state, seed = 1): RouteResult {
  const ticket: TicketDef = { id: fixture.ticketId, tier: 1, seeds: [seed], build: () => fixture }
  let campaign = introduceTicket(createCampaign(base, [ticket.id]), ticket, seed)
  const actor = fixture.ids.operator
  if (!actor) throw new Error(`Ticket ${ticket.id} fixture is missing ids.operator.`)
  for (const [index, step] of fixture.routes.gui.entries()) {
    const attempt = campaign.active!
    const result = dispatch(attempt.state, step.action, { actor, source: 'gui', whatIf: false })
    if (!result.ok) throw new Error(`GUI route step ${index + 1} (${step.path.join(' → ')}) failed: ${result.message ?? result.error}`)
    campaign = recordCommittedAction(campaign, fixture, step.action, result, 'gui')
  }
  const closed = closeTicket(campaign, fixture)
  return { ...closed.attempt ?? campaign.active!, closed: closed.closed, refusal: closed.refusal }
}
