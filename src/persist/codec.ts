import { buildBaseDomain } from '../fixtures/baseDomain'
import { applyAttemptAction, createCampaign, introduceTicket } from '../tickets/engine'
import type { Attempt, CampaignState, TicketDef } from '../tickets/types'
import { SCHEMA_VERSION, type SavedAttempt, type SavePayload } from './schema'

export type TicketLookup = (id: string) => TicketDef | undefined

function saveAttempt(attempt: Attempt): SavedAttempt {
  return { ticketId: attempt.id, seed: attempt.seed, clock: attempt.state.now, log: attempt.history.map(({ action, source }) => ({ action, source })) }
}

/** Turns a campaign into a payload: seeds and action logs only, never domain state. */
export function encodeCampaign(campaign: CampaignState, baseSeed: number, writer: SavePayload['writer']): SavePayload {
  return {
    schema: SCHEMA_VERSION,
    writer,
    baseSeed,
    campaign: { queue: [...campaign.queue], completed: [...campaign.completed], history: campaign.history.map(saveAttempt) },
    active: campaign.active ? saveAttempt(campaign.active) : null,
  }
}

/** Rebuilds one attempt from its seed and replays its log. Throws when the replay diverges. */
function replayAttempt(base: CampaignState['base'], saved: SavedAttempt, lookup: TicketLookup): Attempt {
  const ticket = lookup(saved.ticketId)
  if (!ticket) throw new Error(`The save names an unknown ticket ${saved.ticketId}.`)
  let attempt = introduceTicket(createCampaign(base, [ticket.id]), ticket, saved.seed).active!
  const fixture = ticket.build(saved.seed)
  const actor = fixture.ids.operator
  for (const [index, entry] of saved.log.entries()) {
    const step = applyAttemptAction(attempt, fixture, entry.action, actor, entry.source)
    if (!step.result.ok || step.attempt === attempt) throw new Error(`Replay of ${saved.ticketId} stopped at action ${index + 1} (${entry.action.type}).`)
    attempt = step.attempt
  }
  if (attempt.state.now !== saved.clock) throw new Error(`Replay of ${saved.ticketId} reached lab time ${attempt.state.now}, but the save says ${saved.clock}.`)
  return attempt
}

/** Rebuilds the base domain and every attempt from seeds and logs. */
export function decodeCampaign(payload: SavePayload, lookup: TicketLookup): CampaignState {
  const base = buildBaseDomain(payload.baseSeed).state
  for (const id of payload.campaign.queue) if (!lookup(id)) throw new Error(`The save queues an unknown ticket ${id}.`)
  const history = payload.campaign.history.map((saved) => ({ ...replayAttempt(base, saved, lookup), completed: true }))
  const campaign: CampaignState = { ...createCampaign(base, payload.campaign.queue), completed: [...payload.campaign.completed], history }
  return payload.active ? { ...campaign, active: replayAttempt(base, payload.active, lookup) } : campaign
}
