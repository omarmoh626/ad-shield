import { evaluateAccess } from '../access/trace'
import { buildContext } from '../access/token'
import type { DomainState, Guid } from '../domain/types'
import type { Right } from '../access/types'
import { checkSignIn } from '../access/sessions'
import type { Attempt, Predicate, PredicateResult } from './types'

export const attrEquals = (id: string, label: string, target: Guid, attr: string, expected: unknown, kind: Predicate['kind'] = 'outcome'): Predicate => ({ id, label, kind, evaluate: (state) => result(Object.is(state.objects[target]?.attrs[attr], expected), state.objects[target]?.attrs[attr], expected) })
export const memberOf = (id: string, label: string, member: Guid, group: Guid): Predicate => ({ id, label, kind: 'outcome', evaluate: (state) => result(state.memberships.some((m) => m.member === member && m.group === group), state.memberships.some((m) => m.member === member && m.group === group), true) })
export const notMemberOf = (id: string, label: string, member: Guid, group: Guid): Predicate => ({ id, label, kind: 'control', evaluate: (state) => result(!state.memberships.some((m) => m.member === member && m.group === group), state.memberships.some((m) => m.member === member && m.group === group), false) })
export const effectiveAccess = (id: string, label: string, user: Guid, resource: string, right: Right, required: boolean): Predicate => ({ id, label, kind: 'outcome', evaluate: (state) => { const trace = evaluateAccess(state, buildContext(state, user), resource, right); return result(trace.allowed === required, trace.allowed ? 'allowed' : 'denied', required ? 'allowed' : 'denied') } })
export const effectiveAccessVia = (id: string, label: string, user: Guid, resource: string, right: Right, required: boolean, via: 'none' | 'direct' | 'role' | 'both'): Predicate => ({ id, label, kind: 'outcome', evaluate: (state) => { const trace = evaluateAccess(state, buildContext(state, user), resource, right); const ok = trace.allowed === required && trace.via === via; return result(ok, `${trace.allowed ? 'allowed' : 'denied'} via ${trace.via}`, `${required ? 'allowed' : 'denied'} via ${via}`) } })
export const sessionAccessVia = (id: string, label: string, sessionId: string, resource: string, right: Right, required: boolean, via: 'none' | 'direct' | 'role' | 'both'): Predicate => ({ id, label, kind: 'outcome', evaluate: (state) => { const session = state.sessions.find((item) => (item as { id?: string }).id === sessionId) as { context?: import('../access/types').SecurityContext } | undefined; const trace = session?.context ? evaluateAccess(state, session.context, resource, right) : undefined; const ok = trace?.allowed === required && trace.via === via; return result(ok, trace ? `${trace.allowed ? 'allowed' : 'denied'} via ${trace.via}` : 'session not found', `${required ? 'allowed' : 'denied'} via ${via}`) } })
/** D4, D8: fails while any applying entry on the resource names the user directly. With 'any' (D8) it checks every right, so a direct write or full grant fails too. */
export const directUserEntries = (state: DomainState, user: Guid, resource: string, right: Right | 'any' = 'any') => {
  const context = buildContext(state, user)
  const rights: Right[] = right === 'any' ? ['read', 'write', 'modify', 'full'] : [right]
  const seen = new Set<string>()
  return rights.flatMap((item) => evaluateAccess(state, context, resource, item).layers.flatMap((layer) => layer.entries)).filter((entry) => entry.applies && entry.trustee === user).filter((entry) => { const key = `${entry.layer}|${entry.effect}|${entry.right}`; if (seen.has(key)) return false; seen.add(key); return true })
}
export const noDirectAccessEntry = (id: string, label: string, user: Guid, resource: string, right: Right | 'any' = 'any'): Predicate => ({ id, label, kind: 'control', evaluate: (state) => { const entries = directUserEntries(state, user, resource, right); return result(entries.length === 0, entries.length ? `direct user entry present: ${entries.map((entry) => `${entry.layer} layer (${entry.effect} ${entry.right})`).join(', ')}` : 'no applying direct user entry', 'no applying direct user entry') } })
export const freshSignInResult = (id: string, label: string, user: Guid, expected: boolean): Predicate => ({ id, label, kind: 'outcome', evaluate: (state) => { const account = state.objects[user]; const check = account ? checkSignIn(account) : undefined; const allowed = check?.ok === true; const observed = allowed ? 'sign-in permitted' : check && !check.ok ? `sign-in denied (${check.status}; ${check.reason})` : 'account not found'; return result(allowed === expected, observed, expected ? 'sign-in permitted' : 'sign-in denied') } })
export const credentialVersionUnchanged = (id: string, label: string, target: Guid): Predicate => ({ id, label, kind: 'control', evaluate: (_state, attempt) => { const before = attempt.checkpoint.objects[target]?.attrs.credentialVersion; const now = attempt.state.objects[target]?.attrs.credentialVersion; return result(Object.is(before, now), now, before) } })
export const objectUnchangedSinceBaseline = (id: string, label: string, target: Guid): Predicate => ({ id, label, kind: 'control', evaluate: (_state, attempt) => { const before = attempt.checkpoint.objects[target]; const now = attempt.state.objects[target]; const unchanged = JSON.stringify(before) === JSON.stringify(now); return result(unchanged, unchanged ? 'unchanged' : 'changed', 'unchanged') } })
export const eventExists = (id: string, label: string, eventId: number, target?: Guid, includeBaseline = false): Predicate => ({ id, label, kind: 'evidence', evaluate: (state, attempt) => { const floor = includeBaseline ? 0 : Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq)); const event = state.events.find((event) => event.seq > floor && event.eventId === eventId && (target === undefined || event.target === target)); return result(Boolean(event), event ? `event ${eventId} observed at sequence ${event.seq}` : `event ${eventId} not observed after sequence ${floor}`, `event ${eventId}`) } })
export const eventsInOrder = (id: string, label: string, eventIds: number[], includeBaseline = false): Predicate => ({ id, label, kind: 'order', evaluate: (state, attempt) => { const floor = includeBaseline ? 0 : Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq)); let after = floor; const found: number[] = []; for (const eventId of eventIds) { const event = state.events.find((item) => item.seq > after && item.eventId === eventId); if (!event) break; found.push(event.eventId!); after = event.seq } const ok = found.length === eventIds.length; return result(ok, found.length ? found.join(' → ') : `no required events after sequence ${floor}`, eventIds.join(' → ')) } })
export function waitingForTime(id: string, label: string, requiredTime: number): Predicate { return { id, label, kind: 'evidence', evaluate: (state) => state.now < requiredTime ? { status: 'waiting', observed: `lab time ${state.now}`, required: `lab time ${requiredTime}` } : result(true, `lab time ${state.now}`, `lab time ${requiredTime}`) } }
export function evaluatePredicates(state: DomainState, attempt: Attempt, predicates: Predicate[]) { return predicates.map((predicate) => ({ id: predicate.id, label: predicate.label, kind: predicate.kind, weight: predicate.weight ?? 1, posture: predicate.posture, ...predicate.evaluate(state, attempt) })) }
function result(ok: boolean, observed: unknown, required: unknown): PredicateResult { return { status: ok ? 'met' : 'unmet', observed: String(observed ?? 'missing'), required: String(required ?? 'missing') } }

// T08 case 03 helpers (D5, D6, D7). They find the new account by its sign-in name, because its GUID is
// only known once the learner creates it, and they never read or print credential values.
type DirObjectOf = DomainState['objects'][Guid]
const userBySam = (state: DomainState, sam: string): DirObjectOf | undefined => Object.values(state.objects).find((object) => object.objectClass === 'user' && typeof object.attrs.sAMAccountName === 'string' && object.attrs.sAMAccountName.toLowerCase() === sam.toLowerCase())
const showValue = (value: unknown) => value === undefined ? '(not set)' : typeof value === 'string' ? `'${value}'` : JSON.stringify(value)

/** D5: exactly one user object was created since the checkpoint, and it carries the approved sign-in name. */
export const exactlyOneNewAccount = (id: string, label: string, sam: string): Predicate => ({ id, label, kind: 'outcome', evaluate: (state, attempt) => {
  const created = Object.values(state.objects).filter((object) => object.objectClass === 'user' && !attempt.checkpoint.objects[object.guid])
  const names = created.map((object) => String(object.attrs.sAMAccountName))
  const ok = created.length === 1 && names[0]!.toLowerCase() === sam.toLowerCase()
  return result(ok, created.length ? `${created.length} new account${created.length === 1 ? '' : 's'}: ${names.join(', ')}` : 'no new account', `1 new account: ${sam}`)
} })

/** D6: grades one property of the account with the approved sign-in name. `check` returns [ok, observed]. */
export const accountCheck = (id: string, label: string, sam: string, required: string, check: (account: DirObjectOf, state: DomainState) => [boolean, string], kind: Predicate['kind'] = 'outcome'): Predicate => ({ id, label, kind, evaluate: (state) => {
  const account = userBySam(state, sam)
  if (!account) return result(false, `no account named ${sam}`, required)
  const [ok, observed] = check(account, state)
  return result(ok, observed, required)
} })

/** D7: the object matches its checkpoint attribute by attribute, plus name, container, and direct groups. */
export const objectMatchesBaseline = (id: string, label: string, target: Guid): Predicate => ({ id, label, kind: 'control', evaluate: (state, attempt) => {
  const before = attempt.checkpoint.objects[target], now = state.objects[target]
  if (!before) return result(false, 'not in the baseline', 'matches baseline')
  if (!now) return result(false, 'object no longer exists', 'matches baseline')
  const diffs: string[] = []
  if (before.rdn !== now.rdn) diffs.push(`name ${showValue(before.rdn)} → ${showValue(now.rdn)}`)
  if (before.parent !== now.parent) diffs.push('container changed')
  for (const key of [...new Set([...Object.keys(before.attrs), ...Object.keys(now.attrs)])].sort()) {
    if (JSON.stringify(before.attrs[key]) !== JSON.stringify(now.attrs[key])) diffs.push(`${key} ${showValue(before.attrs[key])} → ${showValue(now.attrs[key])}`)
  }
  const groups = (s: DomainState) => s.memberships.filter((m) => m.member === target).map((m) => s.objects[m.group]?.rdn ?? String(m.group)).sort().join(', ')
  if (groups(attempt.checkpoint) !== groups(state)) diffs.push(`groups ${groups(attempt.checkpoint) || 'none'} → ${groups(state) || 'none'}`)
  return result(diffs.length === 0, diffs.length ? diffs.join('; ') : 'matches baseline', 'matches baseline')
} })
