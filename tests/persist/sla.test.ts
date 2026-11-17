import { describe, expect, it } from 'vitest'
import { decodeCampaign, encodeCampaign, fullSlaMs, memoryStorage, PersistSession, SAVE_KEY, validatePayload, type SavePayload } from '../../src/persist'
import { getTicket } from '../../src/tickets/cases'
import { case01 } from '../../src/tickets/cases/case01'
import { applyAction, introduceTicket, startReplay } from '../../src/tickets/engine'

const session = (storage = memoryStorage()) => new PersistSession({ storage, lookup: getTicket, tab: 'tab-a', queue: ['case01'] })

function started() {
  const campaign = introduceTicket(session().newCampaign(), case01, 1)
  const fixture = case01.build(1)
  return applyAction(campaign, fixture, { type: 'clock.advance', milliseconds: 120_000 }, fixture.ids.operator, 'gui').campaign
}

describe('D4 SLA countdown in saves', () => {
  it('round-trips the remaining SLA', () => {
    const payload = encodeCampaign({ ...started(), slaRemainingMs: 754_000 }, 1, { revision: 1, tab: 'tab-a' })
    expect(payload.campaign.slaRemainingMs).toBe(754_000)
    expect(decodeCampaign(payload, getTicket).slaRemainingMs).toBe(754_000)
  })

  it('loads a save from before the field existed, with the case’s full SLA', () => {
    const legacy = encodeCampaign(started(), 1, { revision: 1, tab: 'tab-a' })
    delete (legacy.campaign as Partial<SavePayload['campaign']>).slaRemainingMs
    expect('slaRemainingMs' in legacy.campaign).toBe(false)
    const storage = memoryStorage({ [SAVE_KEY]: JSON.stringify(legacy) })
    const loaded = session(storage).load()
    expect(loaded.resumed).toBe(true)
    expect(loaded.notices).toEqual([])
    expect(loaded.campaign.active?.history).toHaveLength(1)
    expect(loaded.campaign.slaRemainingMs).toBe(30 * 60_000)
    expect(fullSlaMs(loaded.campaign.active, getTicket)).toBe(30 * 60_000)
  })

  it('rejects a negative or non-number SLA as an invalid save', () => {
    const payload = encodeCampaign(started(), 1, { revision: 1, tab: 'tab-a' })
    expect(validatePayload({ ...payload, campaign: { ...payload.campaign, slaRemainingMs: -1 } })).toMatch(/SLA/)
    expect(validatePayload({ ...payload, campaign: { ...payload.campaign, slaRemainingMs: '5' } })).toMatch(/SLA/)
  })
})

describe('D8 replay flag in saves', () => {
  it('keeps a fresh-variation replay a replay after load, so it cannot award a second completion', () => {
    const fixture = case01.build(1)
    const solved = applyAction(started(), fixture, { type: 'user.unlock', target: fixture.ids.target }, fixture.ids.operator, 'console').campaign
    // A campaign where case01 is already complete: the replay must stay a replay through save and load.
    const completed = { ...solved, active: undefined, completed: ['case01'], history: [{ ...solved.active!, completed: true }] }
    const replay = { ...completed, active: startReplay(completed, case01, 2) }
    const decoded = decodeCampaign(encodeCampaign(replay, 1, { revision: 2, tab: 'tab-a' }), getTicket)
    expect(decoded.active?.replay).toBe(true)
    expect(decoded.completed).toEqual(['case01'])
  })
})
