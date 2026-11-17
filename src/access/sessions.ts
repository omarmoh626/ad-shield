import type { DirObject, DomainState, Guid, Session as DomainSession } from '../domain/types'
import type { SecurityContext } from './types'

/** Failed sign-ins in a row that lock an account. The lab models no automatic unlock. */
export const LOCKOUT_THRESHOLD = 5
/** A session lasts ten hours, the default Kerberos ticket lifetime. */
export const SESSION_LIFETIME_MS = 10 * 60 * 60 * 1000

/**
 * An issued sign-in session. It keeps the security context built at sign-in.
 * Access checks for this session use that snapshot, never current memberships,
 * until the session ends or expires. Nothing refreshes it.
 */
export interface SimSession extends DomainSession {
  id: string
  user: Guid
  /** The computer the user signed in at. */
  host: Guid
  /** The domain controller that authenticated the sign-in. */
  issuer: string
  issuedAt: number
  expiresAt: number
  endedAt?: number
  context: SecurityContext
}

export type SessionStatus = 'active' | 'expired' | 'ended'

export function isSimSession(value: unknown): value is SimSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SimSession>
  return typeof candidate.id === 'string' && typeof candidate.user === 'string' && typeof candidate.issuedAt === 'number' && typeof candidate.expiresAt === 'number' && typeof candidate.context === 'object' && candidate.context !== null
}

export function listSessions(state: DomainState): SimSession[] {
  return state.sessions.filter(isSimSession)
}

export function findSession(state: DomainState, id: string): SimSession | undefined {
  const wanted = id.toLowerCase()
  return listSessions(state).find((session) => session.id.toLowerCase() === wanted)
}

export function sessionStatus(session: SimSession, now: number): SessionStatus {
  if (session.endedAt !== undefined) return 'ended'
  return now >= session.expiresAt ? 'expired' : 'active'
}

/** The next session ID. Sessions are never removed, so the count only grows. */
export function nextSessionId(state: DomainState): string {
  return `sess-${state.sessions.length + 1}`
}

/** Why a sign-in fails, with the status codes Windows writes into event 4625. */
export interface SignInFailure {
  ok: false
  status: string
  subStatus: string
  reason: string
  /** A mistyped password adds to `badPwdCount`. Other failures do not. */
  countsTowardLockout: boolean
}

export type SignInCheck = { ok: true } | SignInFailure

const failure = (status: string, subStatus: string, reason: string, countsTowardLockout = false): SignInFailure => ({ ok: false, status, subStatus, reason, countsTowardLockout })

/**
 * Checks whether a fresh domain sign-in would succeed. Pure: it reads the account
 * and changes nothing. Order: disabled, locked out, credential, then must-change.
 */
export function checkSignIn(user: DirObject, badPassword = false): SignInCheck {
  if (user.objectClass !== 'user') return failure('0xC000006D', '0xC0000064', 'The account is not a user account.')
  if (user.attrs.enabled !== true) return failure('0xC000006E', '0xC0000072', 'The account is disabled.')
  if (user.attrs.lockedOut === true) return failure('0xC0000234', '0x0', 'The account is locked out.')
  const version = typeof user.attrs.credentialVersion === 'number' ? user.attrs.credentialVersion : 0
  if (version <= 0) return failure('0xC000006D', '0xC000006A', 'The account has no simulated credential. Reset the password first.')
  if (badPassword) return failure('0xC000006D', '0xC000006A', 'The simulated password was wrong.', true)
  if (user.attrs.changePasswordAtLogon === true || user.attrs.pwdLastSet === 0) return failure('0xC000006D', '0xC0000224', 'The user must change the password at next logon.')
  return { ok: true }
}
