import { describe, expect, it } from 'vitest'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { buildContext } from '../../src/access/token'
import { evaluateAccess } from '../../src/access/trace'
import type { Ace } from '../../src/access/types'

describe('access trace', () => {
  it('reports direct, role, and combined paths', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    const role: Ace = { resourceId: 'r', layer: 'share', trustee: ids['group.pharmacyShareRead'], right: 'read', effect: 'allow' }
    const direct: Ace = { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'allow' }
    state.aces = [role, { ...direct, layer: 'file' }] as Ace[]
    const context = buildContext(state, ids['user.mali'])
    expect(evaluateAccess(state, context, 'r', 'read').via).toBe('both')
    state.aces = [role, { ...role, layer: 'file' }] as Ace[]
    expect(evaluateAccess(state, context, 'r', 'read').via).toBe('role')
    state.aces = state.aces.filter((ace) => ace.trustee !== ids['group.pharmacyShareRead'])
    expect(evaluateAccess(state, context, 'r', 'read').via).toBe('none')
    expect(evaluateAccess(state, context, 'r', 'read').layers[0].reason).toBe('no applicable ACE')
  })

  it('reports direct access without group paths', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    const ace: Ace = { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'allow' }
    state.aces = [ace, { ...ace, layer: 'file' }] as Ace[]
    expect(evaluateAccess(state, buildContext(state, ids['user.mali']), 'r', 'read').via).toBe('direct')
  })

  it('keeps snapshot paths after current membership is removed', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    const ace: Ace = { resourceId: 'r', layer: 'share', trustee: ids['group.pharmacyShareRead'], right: 'read', effect: 'allow' }
    state.aces = [ace, { ...ace, layer: 'file' }] as Ace[]
    const context = buildContext(state, ids['user.mali'])
    state.memberships = state.memberships.filter((membership) => !(membership.group === ids['group.pharmacyStaff'] && membership.member === ids['user.mali']))
    state.indexes.membersByGroup[String(ids['group.pharmacyStaff'])] = state.indexes.membersByGroup[String(ids['group.pharmacyStaff'])].filter((member) => member !== ids['user.mali'])
    const trace = evaluateAccess(state, context, 'r', 'read')
    expect(trace.allowed).toBe(true)
    expect(trace.paths).toEqual(context.paths)
    expect(trace.via).toBe('role')
  })

  it('reports no granting path when a direct deny is the only applicable entry', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    const deny: Ace = { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'deny' }
    const allow: Ace = { ...deny, effect: 'allow', trustee: ids['group.pharmacyShareRead'] }
    state.aces = [deny, { ...deny, layer: 'file' }, allow, { ...allow, layer: 'file' }] as Ace[]
    const trace = evaluateAccess(state, buildContext(state, ids['user.mali']), 'r', 'read')
    expect(trace.allowed).toBe(false)
    expect(trace.via).toBe('none')
  })
})
