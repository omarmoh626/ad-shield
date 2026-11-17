import { describe, expect, it } from 'vitest'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { buildContext } from '../../src/access/token'
import { evaluateLayer } from '../../src/access/evaluate'
import { evaluateAccess } from '../../src/access/trace'
import type { Ace } from '../../src/access/types'

describe('access evaluation', () => {
  it('allows read and denies write through role groups', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.pharmacy = { id: 'pharmacy', name: 'Pharmacy', shareLayer: 'share', fileLayer: 'file' }
    state.aces = [
      { resourceId: 'pharmacy', layer: 'share', trustee: ids['group.pharmacyShareRead'], right: 'read', effect: 'allow' },
      { resourceId: 'pharmacy', layer: 'file', trustee: ids['group.pharmacyShareRead'], right: 'read', effect: 'allow' },
    ] as Ace[]
    const context = buildContext(state, ids['user.pnair'])
    expect(evaluateAccess(state, context, 'pharmacy', 'read').allowed).toBe(true)
    expect(evaluateAccess(state, context, 'pharmacy', 'write').allowed).toBe(false)
  })

  it('evaluates explicit deny before allow', () => {
    const { state, ids } = buildBaseDomain()
    state.aces = [
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'allow' },
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'deny' },
    ] as Ace[]
    const result = evaluateLayer(state, buildContext(state, ids['user.mali']), 'r', 'share', 'read')
    expect(result.allowed).toBe(false)
    expect(result.entries[0].effect).toBe('deny')
  })

  it('applies overlapping deny rights while requiring an allow to cover the request', () => {
    const { state, ids } = buildBaseDomain()
    state.aces = [
      { resourceId: 'r', layer: 'share', trustee: ids['group.pharmacyStaff'], right: 'modify', effect: 'allow' },
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'deny' },
    ] as Ace[]
    const result = evaluateLayer(state, buildContext(state, ids['user.mali']), 'r', 'share', 'modify')
    expect(result.allowed).toBe(false)
    expect(result.entries.find((entry) => entry.trustee === ids['user.mali'])?.applies).toBe(true)
  })

  it('puts explicit allow before inherited deny', () => {
    const { state, ids } = buildBaseDomain()
    state.aces = [
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'deny', inherited: true },
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'allow' },
    ] as Ace[]
    const result = evaluateLayer(state, buildContext(state, ids['user.mali']), 'r', 'share', 'read')
    expect(result.allowed).toBe(true)
    expect(result.entries.map((entry) => entry.effect)).toEqual(['allow', 'deny'])
  })

  it('requires both share and file layers to allow', () => {
    const { state, ids } = buildBaseDomain()
    state.resources.r = { id: 'r', name: 'R', shareLayer: 'share', fileLayer: 'file' }
    state.aces = [
      { resourceId: 'r', layer: 'share', trustee: ids['user.mali'], right: 'read', effect: 'allow' },
      { resourceId: 'r', layer: 'file', trustee: ids['user.mali'], right: 'read', effect: 'deny' },
    ] as Ace[]
    const ctx = buildContext(state, ids['user.mali'])
    expect(evaluateAccess(state, ctx, 'r', 'read').allowed).toBe(false)
    state.aces[1] = { ...state.aces[1], layer: 'share', effect: 'deny' } as Ace
    state.aces[2] = { resourceId: 'r', layer: 'file', trustee: ids['user.mali'], right: 'read', effect: 'allow' } as Ace
    expect(evaluateAccess(state, ctx, 'r', 'read').allowed).toBe(false)
  })
})
