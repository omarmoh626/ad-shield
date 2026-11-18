import { describe, expect, it } from 'vitest'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { attrEquals, memberOf, notMemberOf, effectiveAccess, freshSignInResult, credentialVersionUnchanged, objectUnchangedSinceBaseline, eventExists, eventsInOrder, waitingForTime } from '../../src/tickets/predicates'
import type { Attempt } from '../../src/tickets/types'
import type { AuditEvent, DomainState } from '../../src/domain/types'

const base = buildBaseDomain(), user = base.ids['user.pnair']
function attempt(state: DomainState): Attempt { return { id: 'test', seed: 1, checkpoint: state, state, history: [], predicates: [], completed: false, replay: false } }
const event = (seq: number, eventId: number): AuditEvent => ({ seq, time: base.state.now, origin: 'windows', eventId, actor: user, target: user, source: 'system', data: {} })

describe('ticket predicates', () => {
  it('evaluates account, membership, access, sign-in, and control helpers', () => {
    const a = attempt(base.state)
    expect(attrEquals('enabled', 'Enabled', user, 'enabled', true).evaluate(base.state, a).status).toBe('met')
    expect(memberOf('member', 'Has role', user, base.ids['group.pharmacyStaff']).evaluate(base.state, a).status).toBe('met')
    expect(notMemberOf('not-member', 'No modify role', user, base.ids['group.pharmacyShareModify']).evaluate(base.state, a).status).toBe('met')
    expect(effectiveAccess('access', 'Pharmacy readable', user, 'share.pharmacy', 'read', true).evaluate(base.state, a).status).toBe('met')
    expect(freshSignInResult('signin', 'Can sign in', user, true).evaluate(base.state, a).status).toBe('met')
    const noCredential = { ...base.state, objects: { ...base.state.objects, [user]: { ...base.state.objects[user]!, attrs: { ...base.state.objects[user]!.attrs, credentialVersion: 0 } } } }
    expect(freshSignInResult('signin', 'Can sign in', user, true).evaluate(noCredential, attempt(noCredential))).toMatchObject({ status: 'unmet', observed: expect.stringContaining('credential') })
    expect(credentialVersionUnchanged('credential', 'Credential unchanged', user).evaluate(base.state, a).status).toBe('met')
    const changedCredential = { ...base.state, objects: { ...base.state.objects, [user]: { ...base.state.objects[user]!, attrs: { ...base.state.objects[user]!.attrs, credentialVersion: Number(base.state.objects[user]!.attrs.credentialVersion) + 1 } } } }
    expect(credentialVersionUnchanged('credential', 'Credential unchanged', user).evaluate(changedCredential, { ...a, state: changedCredential }).status).toBe('unmet')
    const changed = { ...base.state, objects: { ...base.state.objects, [user]: { ...base.state.objects[user]!, attrs: { ...base.state.objects[user]!.attrs, enabled: false } } } }
    expect(objectUnchangedSinceBaseline('control', 'Account unchanged', user).evaluate(changed, { ...a, state: changed }).status).toBe('unmet')
  })

  it('ignores evidence at or before checkpoint unless includeBaseline is enabled', () => {
    const checkpoint = { ...base.state, events: [event(1, 4740)] }, later = { ...checkpoint, events: [...checkpoint.events, event(2, 4767), event(3, 4624)] }
    const a = { ...attempt(checkpoint), checkpoint, state: later }
    expect(eventExists('baseline', 'New lockout', 4740).evaluate(later, a).status).toBe('unmet')
    expect(eventExists('baseline-ok', 'Known lockout', 4740, undefined, true).evaluate(later, a).status).toBe('met')
    expect(eventsInOrder('order', 'Unlock then sign in', [4767, 4624]).evaluate(later, a).status).toBe('met')
    expect(eventsInOrder('wrong-order', 'Sign in then unlock', [4624, 4767]).evaluate(later, a).status).toBe('unmet')
  })

  it('reports waiting until lab time reaches the required value', () => {
    const state = base.state, a = attempt(state), predicate = waitingForTime('propagation', 'Replication complete', state.now + 5000)
    expect(predicate.evaluate(state, a).status).toBe('waiting')
    expect(predicate.evaluate({ ...state, now: state.now + 5000 }, a).status).toBe('met')
  })
})

import { effectiveAccessVia, noDirectAccessEntry, sessionAccessVia } from '../../src/tickets/predicates'
import { buildContext } from '../../src/access/token'

describe('case 02 access predicates', () => {
  it('grades the access trace via field and rejects a direct user grant', () => {
    const state = base.state
    const a = attempt(state)
    expect(effectiveAccessVia('role', 'Role path', user, 'share.pharmacy', 'read', true, 'role').evaluate(state, a)).toMatchObject({ status: 'met', observed: 'allowed via role' })
    const control = base.ids['user.aokoye']
    const directState: DomainState = { ...state, aces: [...state.aces, ...(['share', 'file'] as const).map((layer) => ({ resourceId: 'share.pharmacy', trustee: control, right: 'read', effect: 'allow' as const, inherited: false, layer }))] }
    expect(effectiveAccessVia('role', 'Role path only', control, 'share.pharmacy', 'read', true, 'role').evaluate(directState, attempt(directState))).toMatchObject({ status: 'unmet', observed: 'allowed via direct' })
  })

  it('detects every applying direct user ACE when a role ACE also grants access', () => {
    const control = base.ids['user.aokoye']
    const state = base.state
    const roleState: DomainState = { ...state, memberships: [...state.memberships, { group: base.ids['group.pharmacyStaff'], member: control }] }
    const withDirectRead = { ...roleState, aces: [...roleState.aces, ...(['share', 'file'] as const).map((layer) => ({ resourceId: 'share.pharmacy', trustee: control, right: 'read', effect: 'allow' as const, inherited: false, layer }))] }
    const predicate = noDirectAccessEntry('no-direct', 'No direct entry', control, 'share.pharmacy', 'read')
    expect(predicate.evaluate(roleState, attempt(roleState)).status).toBe('met')
    expect(predicate.evaluate(withDirectRead, attempt(withDirectRead))).toMatchObject({ status: 'unmet', observed: expect.stringContaining('share layer (allow read)') })
  })

  it('D8: with any right, a direct write entry fails even when the user is denied read', () => {
    const control = base.ids['user.aokoye']
    const state = base.state
    const withDirectWrite = { ...state, aces: [...state.aces, { resourceId: 'share.pharmacy', trustee: control, right: 'write', effect: 'allow' as const, inherited: false, layer: 'share' as const }] }
    const any = noDirectAccessEntry('no-direct', 'No direct entry', control, 'share.pharmacy', 'any')
    expect(any.evaluate(state, attempt(state)).status).toBe('met')
    expect(any.evaluate(withDirectWrite, attempt(withDirectWrite))).toMatchObject({ status: 'unmet', observed: expect.stringContaining('share layer (allow write)') })
    expect(noDirectAccessEntry('no-direct', 'No direct entry', control, 'share.pharmacy').evaluate(withDirectWrite, attempt(withDirectWrite)).status).toBe('unmet')
  })

  it('grades an already-issued session from its captured context', () => {
    const state = base.state
    const control = base.ids['user.aokoye']
    const context = buildContext(state, control)
    const withSession = { ...state, sessions: [{ id: 'sess-case-test', context }] }
    expect(sessionAccessVia('old', 'Old session denied', 'sess-case-test', 'share.pharmacy', 'read', false, 'none').evaluate(withSession, attempt(withSession))).toMatchObject({ status: 'met', observed: 'denied via none' })
    expect(sessionAccessVia('missing', 'Missing', 'missing', 'share.pharmacy', 'read', false, 'none').evaluate(state, attempt(state)).status).toBe('unmet')
  })
})

import { accountCheck, exactlyOneNewAccount, objectMatchesBaseline } from '../../src/tickets/predicates'
import { dispatch } from '../../src/engine/dispatch'
import type { Action } from '../../src/engine/types'

describe('case 03 account predicates', () => {
  const operator = base.ids['user.operator']!
  const create = (state: DomainState, sam: string): DomainState => {
    const action: Action = { type: 'user.create', name: `Test ${sam}`, samAccountName: sam, parent: base.ids['ou.nursing'], enabled: true, credential: { policy: 'pass' } }
    const out = dispatch(state, action, { actor: operator, source: 'console', whatIf: false })
    if (!out.ok) throw new Error(out.message ?? String(out.error))
    return out.state
  }

  it('exactlyOneNewAccount counts user objects created since the checkpoint', () => {
    const one = create(base.state, 'tnew')
    const predicate = exactlyOneNewAccount('one', 'One account', 'TNEW')
    expect(predicate.evaluate(base.state, attempt(base.state))).toMatchObject({ status: 'unmet', observed: 'no new account' })
    expect(predicate.evaluate(one, { ...attempt(base.state), state: one })).toMatchObject({ status: 'met', observed: '1 new account: tnew' })
    const two = create(one, 'tnew2')
    expect(predicate.evaluate(two, { ...attempt(base.state), state: two })).toMatchObject({ status: 'unmet', observed: '2 new accounts: tnew, tnew2' })
    expect(exactlyOneNewAccount('one', 'One account', 'other').evaluate(one, attempt(base.state)).status).toBe('unmet')
  })

  it('accountCheck finds the account by sign-in name and reports a missing account', () => {
    const one = create(base.state, 'tnew')
    const enabled = accountCheck('enabled', 'Enabled', 'tnew', 'enabled', (account) => [account.attrs.enabled === true, String(account.attrs.enabled)])
    expect(enabled.evaluate(one, attempt(one))).toMatchObject({ status: 'met', observed: 'true', required: 'enabled' })
    expect(enabled.evaluate(base.state, attempt(base.state))).toMatchObject({ status: 'unmet', observed: 'no account named tnew' })
    expect(accountCheck('c', 'C', 'tnew', 'x', () => [true, 'ok'], 'control').kind).toBe('control')
  })

  it('objectMatchesBaseline lists each changed attribute, name, container, and group', () => {
    const predicate = objectMatchesBaseline('namesake', 'Namesake unchanged', user)
    expect(predicate.evaluate(base.state, attempt(base.state))).toMatchObject({ status: 'met', observed: 'matches baseline' })
    const edited = dispatch(base.state, { type: 'user.setAttrs', target: user, attrs: { displayName: 'Priya Nair (old)', title: 'Lead' } }, { actor: operator, source: 'console', whatIf: false }).state
    const out = predicate.evaluate(edited, { ...attempt(base.state), state: edited })
    expect(out.status).toBe('unmet')
    expect(out.observed).toContain("displayName 'Priya Nair' → 'Priya Nair (old)'")
    expect(out.observed).toContain('title')
    const grouped = dispatch(base.state, { type: 'group.addMember', group: base.ids['group.financeStaff']!, member: user }, { actor: operator, source: 'console', whatIf: false }).state
    expect(predicate.evaluate(grouped, { ...attempt(base.state), state: grouped }).observed).toContain('groups')
  })
})
