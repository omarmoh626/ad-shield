import { describe, expect, it } from 'vitest'
import { LOCKOUT_THRESHOLD, findSession, listSessions, sessionStatus } from '../../src/access/sessions'
import { buildContext } from '../../src/access/token'
import { evaluateAccess } from '../../src/access/trace'
import type { DomainState, Guid } from '../../src/domain/types'
import { dispatch, type Action, type ActionResult } from '../../src/engine'
import { buildBaseDomain, OPERATOR_ID } from '../../src/fixtures/baseDomain'

const { state: base, ids } = buildBaseDomain()
const operator = ids[OPERATOR_ID]
const WS = 'PHARM-WS01.corp.contoso.local'
const DC = 'DC01.corp.contoso.local'

const run = (state: DomainState, action: Action): ActionResult => {
  const result = dispatch(state, action, { actor: operator, source: 'console', whatIf: false })
  expect(result.ok, result.message).toBe(true)
  return result
}
const signIn = (state: DomainState, user: string, badPassword = false) => run(state, { type: 'session.signIn', user: ids[user], host: ids['computer.pharmWs01'], badPassword })
const newSession = (result: ActionResult) => listSessions(result.state).at(-1)!
const added = (before: DomainState, after: DomainState) => after.events.slice(before.events.length)

describe('sessions keep their security context snapshot', () => {
  it('add to a role group: the existing session is still denied, a fresh sign-in is allowed', () => {
    const signed = signIn(base, 'user.bcastillo')
    const session = newSession(signed)
    expect(evaluateAccess(signed.state, session.context, 'share.pharmacy', 'read').allowed).toBe(false)

    const changed = run(signed.state, { type: 'group.addMember', group: ids['group.pharmacyStaff'], member: ids['user.bcastillo'] })
    const kept = findSession(changed.state, session.id)!
    expect(kept.context).toEqual(session.context)
    expect(evaluateAccess(changed.state, kept.context, 'share.pharmacy', 'read').allowed).toBe(false)

    const fresh = newSession(signIn(changed.state, 'user.bcastillo'))
    const trace = evaluateAccess(changed.state, fresh.context, 'share.pharmacy', 'read')
    expect(trace.allowed).toBe(true)
    expect(trace.via).toBe('role')
  })

  it('remove from a role group: the existing session still reads, a fresh sign-in is denied', () => {
    const signed = signIn(base, 'user.pnair')
    const session = newSession(signed)
    const changed = run(signed.state, { type: 'group.removeMember', group: ids['group.pharmacyStaff'], member: ids['user.pnair'] })
    const kept = findSession(changed.state, session.id)!
    const old = evaluateAccess(changed.state, kept.context, 'share.pharmacy', 'read')
    expect(old.allowed).toBe(true)
    expect(old.paths.map((path) => path.trustee)).toContain(ids['group.pharmacyShareRead'])
    expect(evaluateAccess(changed.state, buildContext(changed.state, ids['user.pnair']), 'share.pharmacy', 'read').allowed).toBe(false)
  })

  it('records 4624 on the workstation and issues a session with issuer, times, and expiry', () => {
    const signed = signIn(base, 'user.pnair')
    const session = newSession(signed)
    expect(session).toMatchObject({ id: 'sess-1', user: ids['user.pnair'], host: ids['computer.pharmWs01'], issuer: DC, issuedAt: base.now })
    expect(session.expiresAt).toBeGreaterThan(session.issuedAt)
    expect(sessionStatus(session, base.now)).toBe('active')
    expect(sessionStatus(session, session.expiresAt)).toBe('expired')
    expect(added(base, signed.state)).toEqual([expect.objectContaining({ origin: 'windows', eventId: 4624, host: WS, log: 'Security', target: ids['user.pnair'] })])
  })

  it('denies a disabled account: 4625 on the workstation, no new session', () => {
    const disabled = run(base, { type: 'user.setEnabled', target: ids['user.pnair'], enabled: false }).state
    const result = signIn(disabled, 'user.pnair')
    expect(result.warnings.map((warning) => warning.code)).toEqual(['signInFailed'])
    expect(listSessions(result.state)).toHaveLength(0)
    expect(added(disabled, result.state)).toEqual([expect.objectContaining({ eventId: 4625, host: WS, data: expect.objectContaining({ subStatus: '0xC0000072' }) })])
  })

  it('locks the account after five failed sign-ins and records 4740 on the domain controller', () => {
    let state = base
    for (let attempt = 1; attempt < LOCKOUT_THRESHOLD; attempt += 1) state = signIn(state, 'user.pnair', true).state
    expect(state.objects[ids['user.pnair']].attrs).toMatchObject({ badPwdCount: 4, lockedOut: false })
    expect(state.events.filter((event) => event.eventId === 4740)).toHaveLength(0)
    const fifth = signIn(state, 'user.pnair', true)
    expect(fifth.state.objects[ids['user.pnair']].attrs).toMatchObject({ badPwdCount: 5, lockedOut: true })
    const events = added(state, fifth.state)
    expect(events.map((event) => [event.eventId, event.host])).toEqual([[4625, WS], [4740, DC]])
    expect(events[1]).toMatchObject({ origin: 'windows', log: 'Security', target: ids['user.pnair'], data: expect.objectContaining({ callerComputerName: 'PHARM-WS01' }) })
  })

  it('denies a locked account even with the right password until it is unlocked', () => {
    const locked = run(base, { type: 'user.setEnabled', target: ids['user.pnair'], enabled: true }).state
    let state = locked
    for (let attempt = 0; attempt < LOCKOUT_THRESHOLD; attempt += 1) state = signIn(state, 'user.pnair', true).state
    const denied = signIn(state, 'user.pnair')
    expect(listSessions(denied.state)).toHaveLength(0)
    expect(added(state, denied.state)[0]).toMatchObject({ eventId: 4625, data: expect.objectContaining({ status: '0xC0000234' }) })
    const unlocked = run(denied.state, { type: 'user.unlock', target: ids['user.pnair'] }).state
    const allowed = signIn(unlocked, 'user.pnair')
    expect(listSessions(allowed.state)).toHaveLength(1)
    expect(allowed.state.objects[ids['user.pnair']].attrs.badPwdCount).toBe(0)
  })

  it('a password reset does not end existing sessions', () => {
    const signed = signIn(base, 'user.pnair')
    const reset = run(signed.state, { type: 'user.resetPassword', target: ids['user.pnair'], credential: { policy: 'pass' } })
    const session = findSession(reset.state, 'sess-1')!
    expect(sessionStatus(session, reset.state.now)).toBe('active')
    expect(evaluateAccess(reset.state, session.context, 'share.pharmacy', 'read').allowed).toBe(true)
  })

  it('honors changePasswordAtLogon set by Set-ADUser or New-ADUser', () => {
    const flagged = run(base, { type: 'user.setAttrs', target: ids['user.pnair'], attrs: { changePasswordAtLogon: true } }).state
    const result = signIn(flagged, 'user.pnair')
    expect(listSessions(result.state)).toHaveLength(0)
    expect(added(flagged, result.state)[0]).toMatchObject({ eventId: 4625, data: expect.objectContaining({ subStatus: '0xC0000224' }) })
    // Must-change does not count toward lockout.
    expect(result.state.objects[ids['user.pnair']].attrs.badPwdCount).toBe(0)
  })

  it('denies an account that never received a credential', () => {
    const created = run(base, { type: 'user.create', name: 'New Hire', samAccountName: 'nhire', parent: ids['ou.pharmacy'] })
    const guid = Object.keys(created.state.objects).find((key) => created.state.objects[key as Guid].attrs.sAMAccountName === 'nhire') as Guid
    const enabled = { ...created.state, objects: { ...created.state.objects, [guid]: { ...created.state.objects[guid], attrs: { ...created.state.objects[guid].attrs, enabled: true } } } }
    const result = run(enabled, { type: 'session.signIn', user: guid, host: ids['computer.pharmWs01'] })
    expect(result.warnings[0].code).toBe('signInFailed')
    expect(listSessions(result.state)).toHaveLength(0)
  })

  it('ends a session only through session.end, which keeps the snapshot and records a simulator event', () => {
    const signed = signIn(base, 'user.pnair')
    const ended = run(signed.state, { type: 'session.end', session: 'sess-1' })
    const session = findSession(ended.state, 'sess-1')!
    expect(sessionStatus(session, ended.state.now)).toBe('ended')
    expect(session.context).toEqual(findSession(signed.state, 'sess-1')!.context)
    expect(ended.events).toEqual([expect.objectContaining({ origin: 'simulator', data: expect.objectContaining({ kind: 'session.end' }) })])
  })

  it('rejects ending a session of a user outside the operator delegation', () => {
    const signed = dispatch(base, { type: 'session.signIn', user: ids['user.ehartmann'], host: ids['computer.pharmWs01'] }, { actor: operator, source: 'console', whatIf: false })
    const result = dispatch(signed.state, { type: 'session.end', session: 'sess-1' }, { actor: operator, source: 'console', whatIf: false })
    expect(result.error).toBe('denied')
  })
})
