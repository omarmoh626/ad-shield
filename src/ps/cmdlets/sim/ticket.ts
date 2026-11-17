import type { CmdletSpec } from '../../registry'
import type { Runtime } from '../../runtime'
import { PsError, type PsObject } from '../../values'
import { closeTicket, resetAttempt } from '../../../tickets/engine'
import { SIM_MODULE } from './common'

const TYPE = 'ADShield.Sim.Ticket'
function active(rt: Runtime) {
  const campaign = rt.getTicketCampaign()
  if (!campaign?.active) return undefined
  const fixture = rt.getTicketFixture(campaign.active.id)
  if (!fixture) throw new PsError(`The simulated ticket ${campaign.active.id} has no registered fixture.`)
  return { campaign, fixture }
}
function ticketValue(rt: Runtime): PsObject {
  const found = active(rt)
  const campaign = rt.getTicketCampaign()
  const attempt = found?.campaign.active
  return { typeName: TYPE, text: attempt ? `simulated ticket ${attempt.id}` : 'no active simulated ticket', properties: {
    Status: attempt ? 'Active (simulated)' : 'No active ticket (simulated)', TicketId: attempt?.id ?? '', Seed: attempt?.seed ?? 0,
    Predicates: attempt?.predicates.map((predicate) => `${predicate.label}: ${predicate.status}; observed ${predicate.observed}; required ${predicate.required}`) ?? [],
    Completed: campaign?.completed ?? [],
  } }
}
export const getSimTicket: CmdletSpec = {
  name: 'Get-SimTicket', module: SIM_MODULE, parameterSets: [{ name: 'Default', parameters: [] }], inputTypes: [], outputType: TYPE,
  defaultDisplay: ['Status', 'TicketId', 'Seed', 'Predicates', 'Completed'], supportsWhatIf: false, confirmImpact: 'none',
  help: { synopsis: 'Reads the active simulated ticket, its criteria, and completed ticket IDs.', examples: [{ code: 'Get-SimTicket', explain: 'Shows the active simulated ticket and live criteria.' }] },
  *run(_inv, rt) { yield ticketValue(rt) },
}
export const closeSimTicket: CmdletSpec = {
  name: 'Close-SimTicket', module: SIM_MODULE, parameterSets: [{ name: 'Default', parameters: [] }], inputTypes: [], supportsWhatIf: true, confirmImpact: 'none',
  help: { synopsis: 'Closes the active simulated ticket when every predicate is met. -WhatIf previews closure without awarding completion.', examples: [{ code: 'Close-SimTicket -WhatIf', explain: 'Previews whether the active simulated ticket can close.' }, { code: 'Close-SimTicket', explain: 'Closes the simulated ticket when all criteria are met.' }] },
  *run(inv, rt) {
    const found = active(rt)
    if (!found) { rt.writeHost('No active simulated ticket.'); return }
    const result = closeTicket(found.campaign, found.fixture)
    if (!result.closed) { rt.writeHost(`The simulated ticket remains open. ${result.refusal?.join(' | ') ?? ''}`); return }
    if (!inv.whatIf) rt.setTicketCampaign(result.campaign)
    rt.writeHost(inv.whatIf ? 'The simulated ticket can close. WhatIf: no completion awarded.' : 'The simulated ticket is closed.')
  },
}
export const resetSimAttempt: CmdletSpec = {
  name: 'Reset-SimAttempt', module: SIM_MODULE, parameterSets: [{ name: 'Default', parameters: [] }], inputTypes: [], supportsWhatIf: false, confirmImpact: 'none',
  help: { synopsis: 'Restores the active simulated ticket checkpoint and clock while preserving earlier completions.', examples: [{ code: 'Reset-SimAttempt', explain: 'Restores the active simulated ticket to its checkpoint.' }] },
  *run(_inv, rt) {
    const found = active(rt)
    if (!found) { rt.writeHost('No active simulated ticket to reset.'); return }
    const campaign = resetAttempt(found.campaign, found.fixture)
    rt.setTicketCampaign(campaign)
    rt.replaceState(campaign.active!.state)
    rt.writeHost('The simulated attempt was reset to its checkpoint. Earlier completions remain.')
  },
}
