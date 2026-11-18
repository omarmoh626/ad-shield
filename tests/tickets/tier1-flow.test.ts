// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actions, getStore, resetStore } from '../../src/ui/store'
import { TICKETS, getTicket } from '../../src/tickets/cases'
import { scoreCampaign } from '../../src/tickets/scoring'
import { endOfSliceNotice } from '../../src/ui/inbox/Inbox'
import type { CampaignState } from '../../src/tickets/types'

const TIER1 = ['case01', 'case02', 'case03', 'case04', 'case05']

function score(campaign: CampaignState, incidents = 0) {
  const completed = TICKETS.filter((ticket) => campaign.completed.includes(ticket.id))
  return scoreCampaign(completed, [...TICKETS], [...campaign.history, ...(campaign.active ? [campaign.active] : [])], incidents)
}

/** Plays the active attempt's GUI route through the store, the same path the Directory tab uses. */
function playActive() {
  const attempt = getStore().campaign.active!
  const fixture = getTicket(attempt.id)!.build(attempt.seed)
  for (const step of fixture.routes.gui) {
    const result = actions.dispatchGui(step.action, getStore().campaign.active!.state.revision)
    expect(result.ok, `${attempt.id}: ${step.path.join(' → ')}`).toBe(true)
  }
  return actions.closeCase()
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); resetStore() })
afterEach(() => { vi.useRealTimers() })

describe('Tier 1 flow', () => {
  it('catalog holds cases 01 to 05 in campaign order, all Tier 1', () => {
    expect(TICKETS.map((ticket) => ticket.id)).toEqual(TIER1)
    expect(TICKETS.every((ticket) => ticket.tier === 1)).toBe(true)
  })

  it('queues 01 through 05 in order, and rank moves to IAM Analyst once, after case 05', () => {
    const ranks: string[] = []
    for (const id of TIER1) {
      expect(getStore().campaign.active?.id).toBe(id)
      expect(playActive().closed).toBe(true)
      ranks.push(score(getStore().campaign).rank)
      actions.nextCase()
    }
    expect(ranks).toEqual(['Helpdesk', 'Helpdesk', 'Helpdesk', 'Helpdesk', 'IAM Analyst'])
    const campaign = getStore().campaign
    expect(campaign.queue).toEqual(TIER1)
    expect(campaign.completed).toEqual(TIER1)
    expect(campaign.active).toBeUndefined()
    expect(getStore().screen).toBe('Inbox')
    expect(endOfSliceNotice(campaign)).toMatch(/Tier 2 and Tier 3 are not built yet/)
  })

  it('replaying any completed case gives no second completion and no second rank-up', () => {
    for (const _ of TIER1) { playActive(); actions.nextCase() }
    const before = getStore().campaign
    expect(score(before).rank).toBe('IAM Analyst')
    for (const id of TIER1) {
      actions.startVariation(id, getTicket(id)!.seeds[0]!)
      expect(getStore().campaign.active?.replay).toBe(true)
      expect(playActive().closed).toBe(true)
      expect(getStore().campaign.completed).toEqual(before.completed)
      expect(getStore().campaign.history).toHaveLength(before.history.length)
      expect(score(getStore().campaign).rank).toBe('IAM Analyst')
    }
  })

  it('posture, rank, and active incidents change independently across the five cases', () => {
    const seen: { id: string; rank: string; postureMid: number; postureClosed: number }[] = []
    for (const id of TIER1) {
      // Mid-case: unmet security and availability checks lower posture; rank does not move.
      const mid = score(getStore().campaign)
      playActive()
      const closed = score(getStore().campaign)
      seen.push({ id, rank: closed.rank, postureMid: mid.posture, postureClosed: closed.posture })
      // The incident count is its own input: changing it moves neither rank nor posture.
      const withIncidents = score(getStore().campaign, 3)
      expect(withIncidents.activeIncidentCount).toBe(3)
      expect(withIncidents.rank).toBe(closed.rank)
      expect(withIncidents.posture).toBe(closed.posture)
      actions.nextCase()
    }
    expect(seen.every((row) => row.postureClosed === 100)).toBe(true)
    expect(seen.some((row) => row.postureMid < 100)).toBe(true)
    // Posture moved on cases where rank stayed Helpdesk; rank moved only on the last one.
    expect(seen.filter((row) => row.postureMid !== row.postureClosed && row.rank === 'Helpdesk').length).toBeGreaterThan(0)
    expect(seen.map((row) => row.rank).filter((rank) => rank === 'IAM Analyst')).toEqual(['IAM Analyst'])
  })

  it('end-of-slice notice appears only after every Tier 1 case and stays accurate if later tiers ship', () => {
    const campaign = getStore().campaign
    expect(endOfSliceNotice(campaign)).toBeUndefined()
    const done = { ...campaign, completed: [...TIER1] }
    expect(endOfSliceNotice(done)).toBe('You have completed every case built so far. Tier 2 and Tier 3 are not built yet in this version. You can replay any case with new details.')
    expect(endOfSliceNotice(done)).not.toMatch(/no more tickets/)
    const withTier2 = [...TICKETS, { id: 'case06', tier: 2 as const }]
    // P2 audit F1: a built Tier 2 case is still unfinished, so the notice must not appear.
    expect(endOfSliceNotice(done, withTier2)).toBeUndefined()
    expect(endOfSliceNotice({ ...done, completed: [...TIER1, 'case06'] }, withTier2)).toMatch(/^You have completed every case built so far\. Tier 3 is not built yet/)
    expect(endOfSliceNotice({ ...done, completed: [...TIER1, 'case06', 'case11'] }, [...withTier2, { id: 'case11', tier: 3 as const }])).toBeUndefined()
  })
})
