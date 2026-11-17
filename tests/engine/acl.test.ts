import { describe, expect, it } from 'vitest'
import { buildContext } from '../../src/access/token'
import { evaluateAccess } from '../../src/access/trace'
import type { DomainState } from '../../src/domain/types'
import { dispatch, type Action, type ActionCtx } from '../../src/engine'
import { buildBaseDomain, OPERATOR_ID } from '../../src/fixtures/baseDomain'

const { state: base, ids } = buildBaseDomain()
const operator = ids[OPERATOR_ID]
const ctx = (overrides: Partial<ActionCtx> = {}): ActionCtx => ({ actor: operator, source: 'console', whatIf: false, ...overrides })
const grantMali: Action = { type: 'acl.addEntry', resource: 'share.finance', trustee: ids['user.mali'], right: 'read' }
const canRead = (state: DomainState, user: string, share = 'share.finance') => evaluateAccess(state, buildContext(state, ids[user]), share, 'read')

describe('fixture shares', () => {
  it('wires account to role group to resource group to permission on both layers', () => {
    expect(canRead(base, 'user.pnair', 'share.pharmacy')).toMatchObject({ allowed: true, via: 'role' })
    expect(evaluateAccess(base, buildContext(base, ids['user.pnair']), 'share.pharmacy', 'write').allowed).toBe(false)
    expect(evaluateAccess(base, buildContext(base, ids['user.mali']), 'share.pharmacy', 'write').allowed).toBe(true)
    expect(canRead(base, 'user.kmorita')).toMatchObject({ allowed: true, via: 'role' })
    expect(canRead(base, 'user.mali')).toMatchObject({ allowed: false, via: 'none' })
    expect(canRead(base, 'user.aokoye', 'share.pharmacy').allowed).toBe(false)
  })
})

describe('acl.addEntry and acl.removeEntry', () => {
  it('adds a direct grant on both layers and records a simulator event', () => {
    const result = dispatch(base, grantMali, ctx())
    expect(result.ok).toBe(true)
    expect(result.diff).toHaveLength(2)
    expect(result.events).toEqual([expect.objectContaining({ origin: 'simulator', target: ids['user.mali'], data: expect.objectContaining({ kind: 'acl.addEntry', resource: 'Finance' }) })])
    expect(canRead(result.state, 'user.mali')).toMatchObject({ allowed: true, via: 'direct' })
  })

  it('a one-layer grant is not enough: both layers must allow', () => {
    const result = dispatch(base, { ...grantMali, layer: 'share' }, ctx())
    expect(result.ok).toBe(true)
    expect(canRead(result.state, 'user.mali').allowed).toBe(false)
  })

  it('previews with whatIf and changes nothing', () => {
    const result = dispatch(base, grantMali, ctx({ whatIf: true }))
    expect(result.ok).toBe(true)
    expect(result.state).toBe(base)
    expect(result.events).toEqual([])
    expect(result.diff).toHaveLength(2)
  })

  it('checks authorization for every source, including previews', () => {
    for (const overrides of [{ actor: ids['user.mali'] }, { actor: ids['user.mali'], source: 'gui' as const }, { actor: ids['user.mali'], source: 'system' as const }, { actor: ids['user.mali'], whatIf: true }]) {
      const result = dispatch(base, grantMali, ctx(overrides))
      expect(result.error).toBe('denied')
      expect(result.state).toBe(base)
    }
    const remove = dispatch(base, { type: 'acl.removeEntry', resource: 'share.finance', trustee: ids['group.financeShareRead'], right: 'read' }, ctx({ actor: ids['user.kmorita'] }))
    expect(remove.error).toBe('denied')
  })

  it('rejects a distribution group, an unknown share, and an unknown right', () => {
    expect(dispatch(base, { ...grantMali, trustee: ids['group.pharmacyNews'] }, ctx()).error).toBe('invalid')
    expect(dispatch(base, { ...grantMali, resource: 'share.nope' }, ctx()).error).toBe('notFound')
    expect(dispatch(base, { ...grantMali, right: 'own' as never }, ctx()).error).toBe('invalid')
  })

  it('treats a repeated grant as no change', () => {
    const once = dispatch(base, grantMali, ctx()).state
    const twice = dispatch(once, grantMali, ctx())
    expect(twice.ok).toBe(true)
    expect(twice.state).toBe(once)
    expect(twice.warnings[0].code).toBe('noChange')
  })

  it('removes the resource-group entry and access goes away for a fresh context', () => {
    const remove: Action = { type: 'acl.removeEntry', resource: 'share.finance', trustee: ids['group.financeShareRead'], right: 'read' }
    const result = dispatch(base, remove, ctx())
    expect(result.ok).toBe(true)
    expect(result.diff).toHaveLength(2)
    expect(canRead(result.state, 'user.kmorita').allowed).toBe(false)
    expect(dispatch(result.state, remove, ctx()).error).toBe('notFound')
  })
})
