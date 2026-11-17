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
