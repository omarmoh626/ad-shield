import { describe, expect, it } from 'vitest'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { buildContext } from '../../src/access/token'
import { evaluateAccess } from '../../src/access/trace'
import type { Ace } from '../../src/access/types'

describe('buildContext', () => {
  it('expands security memberships transitively and excludes distribution groups', () => {
    const { state, ids } = buildBaseDomain()
    const context = buildContext(state, ids['user.mali'])
    expect(context.groupSids).toContain(state.objects[ids['group.pharmacyStaff']].sid)
    expect(context.groupSids).toContain(state.objects[ids['group.pharmacyShareRead']].sid)
    expect(context.groupSids).not.toContain(state.objects[ids['group.pharmacyNews']].sid)
  })

  it('includes the primary group although it has no membership row', () => {
    const { state, ids } = buildBaseDomain()
    const context = buildContext(state, ids['user.mali'])
    expect(context.groupSids).toContain(state.objects[ids['group.domainUsers']].sid)
  })

  it('does not grant access through a distribution group ACE', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    const ace: Ace = { resourceId: 'r', layer: 'share', trustee: ids['group.pharmacyNews'], right: 'read', effect: 'allow' }
    state.aces = [ace, { ...ace, layer: 'file' }] as Ace[]
    const trace = evaluateAccess(state, buildContext(state, ids['user.mali']), 'r', 'read')
    expect(trace.allowed).toBe(false)
    expect(trace.via).toBe('none')
  })
})
