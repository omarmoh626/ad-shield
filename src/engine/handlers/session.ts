import { LOCKOUT_THRESHOLD, SESSION_LIFETIME_MS, checkSignIn, findSession, nextSessionId, type SimSession } from '../../access/sessions'
import { buildContext } from '../../access/token'
import type { AttrValue, DirObject } from '../../domain/types'
import { recordingHost, simulatorEvent, windowsEvent, type EventDraft } from '../events'
import type { Handler } from '../handlers'
import type { Change } from '../types'
import { attrChanges, fail, hostNameOf, nameOf, patch } from './common'

export const LOGON_SUCCESS = 4624
export const LOGON_FAILURE = 4625
export const ACCOUNT_LOCKED_OUT = 4740

/** Interactive logon at a workstation or server console. */
const LOGON_TYPE_INTERACTIVE = '2'

/**
 * A simulated domain sign-in. The domain controller authenticates the account.
 * 4624 or 4625 is recorded on the computer where the user signed in.
 * 4740 is recorded on the domain controller when the account locks.
 *
 * It needs no delegated right: it models what the user does, not an
 * administrator change. A failed sign-in is still committed, because it
 * records 4625 and can add to `badPwdCount`. The result then carries a
 * `signInFailed` warning.
 */
export const sessionSignIn: Handler<'session.signIn'> = (state, action) => {
  const user: DirObject | undefined = state.objects[action.user]
  const host: DirObject | undefined = state.objects[action.host]
  if (!user) return fail('notFound', 'The user account was not found.')
  if (user.objectClass !== 'user') return fail('invalid', 'Only a user account can sign in.')
  if (!host) return fail('notFound', 'The computer was not found.')
  if (host.objectClass !== 'computer') return fail('invalid', 'A sign-in needs a computer to sign in at.')
  if (host.attrs.enabled === false) return fail('invalid', 'The computer account is disabled. It cannot process a sign-in.')
  return {
    needs: [],
    touches: [user.guid],
    apply: () => {
      const hostName = hostNameOf(host)
      const issuer = recordingHost(state)
      const logonData = { targetUserName: nameOf(user), targetSid: user.sid ?? '', workstationName: host.rdn, logonType: LOGON_TYPE_INTERACTIVE, authenticatingDc: issuer }
      const check = checkSignIn(user, action.badPassword === true)

      if (!check.ok) {
        const attrs: Record<string, AttrValue> = {}
        let locked = false
        if (check.countsTowardLockout) {
          const count = (typeof user.attrs.badPwdCount === 'number' ? user.attrs.badPwdCount : 0) + 1
          attrs.badPwdCount = count
          attrs.badPasswordTime = state.now
          if (count >= LOCKOUT_THRESHOLD) {
            attrs.lockedOut = true
            locked = true
          }
        }
        const next = Object.keys(attrs).length ? patch(state, user.guid, attrs) : state
        const events: EventDraft[] = [{
          ...windowsEvent(next, LOGON_FAILURE, user.guid, user.guid, { ...logonData, status: check.status, subStatus: check.subStatus, failureReason: check.reason }),
          host: hostName,
        }]
        if (locked) events.push(windowsEvent(next, ACCOUNT_LOCKED_OUT, user.guid, user.guid, { targetUserName: nameOf(user), callerComputerName: host.rdn }))
        const changes: Change[] = [
          ...attrChanges(user, attrs),
          { kind: 'session', target: user.guid, key: 'signIn', before: undefined, after: `failed at ${host.rdn}: ${check.reason}` },
        ]
        const reason = locked ? `${check.reason} The account is now locked out after ${LOCKOUT_THRESHOLD} failed sign-ins.` : check.reason
        return { state: next, changes, events, warnings: [{ code: 'signInFailed', message: reason }] }
      }

      const session: SimSession = {
        id: nextSessionId(state),
        user: user.guid,
        host: host.guid,
        issuer,
        issuedAt: state.now,
        expiresAt: state.now + SESSION_LIFETIME_MS,
        context: buildContext(state, user.guid),
      }
      const attrs: Record<string, AttrValue> = { badPwdCount: 0, lastLogon: state.now, lastLogonTimestamp: state.now }
      const next = { ...patch(state, user.guid, attrs), sessions: [...state.sessions, session] }
      return {
        state: next,
        changes: [...attrChanges(user, attrs), { kind: 'session', target: user.guid, key: 'signIn', before: undefined, after: session.id }],
        events: [{ ...windowsEvent(next, LOGON_SUCCESS, user.guid, user.guid, { ...logonData, logonId: session.id }), host: hostName }],
        warnings: [],
      }
    },
  }
}

/**
 * Ends one issued session. Only an operator with delegated rights over the
 * user may end it. The snapshot stays in state for the record.
 */
export const sessionEnd: Handler<'session.end'> = (state, action, ctx) => {
  const session = findSession(state, action.session)
  if (!session) return fail('notFound', `The session ${action.session} was not found.`)
  const user: DirObject | undefined = state.objects[session.user]
  return {
    // A session whose user no longer exists has no container, so no delegation can cover it.
    needs: [{ within: user?.parent ?? null, objectClass: 'user', target: session.user }],
    touches: [session.user],
    apply: () => {
      if (session.endedAt !== undefined) return { state, changes: [], events: [], warnings: [{ code: 'noChange', message: 'The session has already ended.' }] }
      const sessions = state.sessions.map((item) => item === session ? { ...session, endedAt: state.now } : item)
      const next = { ...state, sessions }
      return {
        state: next,
        changes: [{ kind: 'session', target: session.user, key: session.id, before: 'active', after: 'ended' }],
        events: [simulatorEvent(next, 'session.end', ctx.actor, session.user, { session: session.id })],
        warnings: [],
      }
    },
  }
}
