import { describe, expect, it } from 'vitest'
import { rankFor, scoreCampaign } from '../../src/tickets/scoring'
import type { Attempt } from '../../src/tickets/types'

describe('ticket scoring', () => {
  it('keeps rank, weighted posture, failed checks, and incident count separate', () => {
    const attempt = { predicates: [{ id: 'security', label: 'Coworker preserved', kind: 'control', status: 'unmet', observed: 'changed', required: 'unchanged', weight: 2, posture: 'security' }, { id: 'evidence', label: 'Event exists', kind: 'evidence', status: 'unmet', observed: 'missing', required: 'event', weight: 1 }, { id: 'availability', label: 'User enabled', kind: 'outcome', status: 'met', observed: 'yes', required: 'yes', weight: 1, posture: 'availability' }] } as Attempt
    const result = scoreCampaign([], [], [attempt], 3)
    expect(result).toEqual({ rank: 'Helpdesk', posture: 33, failedChecks: ['Coworker preserved'], activeIncidentCount: 3 })
    const unavailable = { ...attempt, predicates: attempt.predicates.map((p) => ({ ...p, status: 'unmet' as const })) }
    expect(scoreCampaign([], [], [unavailable], 1).posture).toBeLessThan(result.posture)
  })
  it('promotes only after all tickets in the prior tier are complete', () => {
    const catalog = [{ id: 'a', tier: 1 as const, seeds: [1, 2], build: () => { throw new Error() } }, { id: 'b', tier: 1 as const, seeds: [1, 2], build: () => { throw new Error() } }, { id: 'c', tier: 2 as const, seeds: [1, 2], build: () => { throw new Error() } }]
    expect(rankFor([catalog[0]!, catalog[2]!], catalog)).toBe('Helpdesk')
    expect(rankFor(catalog.slice(0, 2), catalog)).toBe('IAM Analyst')
  })
})
