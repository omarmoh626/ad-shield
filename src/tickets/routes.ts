import { dispatch } from '../engine/dispatch'
import { buildBaseDomain } from '../fixtures/baseDomain'
import { createDefaultRegistry, createRuntime, run, type RuntimeOptions } from '../ps/runtime'
import { closeTicket, createCampaign, introduceTicket, recordCommittedAction } from './engine'
import type { Attempt, CaseFixture, RouteResult, TicketDef } from './types'

/**
 * Route helpers for case tests. They live apart from the campaign engine so
 * the PowerShell runtime can depend on the engine without an import cycle
 * (engine <- runtime <- routes).
 */
export type RouteInput = Pick<RuntimeOptions, 'readSecure' | 'confirm'>

/** Runs each script step through the PowerShell runtime, then tries to close the ticket. */
export function runScriptRoute(fixture: CaseFixture, steps: CaseFixture['routes']['script'] = fixture.routes.script, base: Attempt['state'] = buildBaseDomain().state, seed = 1, input: RouteInput = {}): RouteResult {
  const ticket: TicketDef = { id: fixture.ticketId, tier: 1, seeds: [seed], build: () => fixture }
  let campaign = introduceTicket(createCampaign(base, [ticket.id]), ticket, seed)
  const actor = fixture.ids.operator
  if (!actor) throw new Error(`Ticket ${ticket.id} fixture is missing ids.operator.`)
  const runtime = createRuntime({ registry: createDefaultRegistry(), actor, ...input, tickets: {
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

/** Replays each GUI step through dispatch with source 'gui', then tries to close the ticket. */
export function runGuiRoute(fixture: CaseFixture, base: Attempt['state'] = buildBaseDomain().state, seed = 1): RouteResult {
  const ticket: TicketDef = { id: fixture.ticketId, tier: 1, seeds: [seed], build: () => fixture }
  let campaign = introduceTicket(createCampaign(base, [ticket.id]), ticket, seed)
  const actor = fixture.ids.operator
  if (!actor) throw new Error(`Ticket ${ticket.id} fixture is missing ids.operator.`)
  for (const [index, step] of fixture.routes.gui.entries()) {
    const attempt = campaign.active!
    const result = dispatch(attempt.state, step.action, { actor, source: 'gui', whatIf: false, baseRevision: attempt.state.revision })
    if (!result.ok) throw new Error(`GUI route step ${index + 1} (${step.path.join(' → ')}) failed: ${result.message ?? result.error}`)
    campaign = recordCommittedAction(campaign, fixture, step.action, result, 'gui')
  }
  const closed = closeTicket(campaign, fixture)
  return { ...closed.attempt ?? campaign.active!, closed: closed.closed, refusal: closed.refusal }
}
