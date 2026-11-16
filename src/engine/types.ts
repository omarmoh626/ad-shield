import type { Ace, AttrValue, AuditEvent, DomainState, Guid, ObjectClass } from '../domain/types'

export type Source = 'console' | 'gui' | 'system'

export interface ActionCtx {
  actor: Guid
  source: Source
  whatIf: boolean
  baseRevision?: number
}

/**
 * The result of checking a secret against the lab password policy.
 * The secret itself never enters an action, the state, or an event.
 */
export interface CredentialVerdict {
  policy: 'pass' | 'fail'
}

export type Action =
  | { type: 'user.create'; name: string; samAccountName: string; parent?: Guid; attrs?: Record<string, AttrValue>; enabled?: boolean; credential?: CredentialVerdict }
  | { type: 'user.setAttrs'; target: Guid; attrs: Record<string, AttrValue> }
  | { type: 'user.setEnabled'; target: Guid; enabled: boolean }
  | { type: 'user.unlock'; target: Guid }
  | { type: 'user.resetPassword'; target: Guid; credential: CredentialVerdict }
  | { type: 'object.move'; target: Guid; newParent: Guid }
  | { type: 'group.addMember'; group: Guid; member: Guid }
  | { type: 'group.removeMember'; group: Guid; member: Guid }
  | { type: 'acl.addEntry'; resource: string; trustee: Guid; right: string }
  | { type: 'acl.removeEntry'; resource: string; trustee: Guid; right: string }
  | { type: 'session.signIn'; user: Guid; host: Guid }
  | { type: 'session.end'; session: string }
  | { type: 'clock.advance'; milliseconds: number }

export type ActionType = Action['type']

export type ActionError = 'notFound' | 'denied' | 'invalid' | 'conflict' | 'stale' | 'unsupported'

export type WarningCode = 'passwordRejected' | 'notEnabled' | 'notPermissionBearing' | 'noChange'

export interface ActionWarning {
  code: WarningCode
  message: string
}

export type ChangeKind = 'object' | 'attr' | 'location' | 'membership' | 'clock'

/** One before and after pair. `undefined` means the value did not exist on that side. */
export interface Change {
  kind: ChangeKind
  target?: Guid
  key?: string
  before: AttrValue | undefined
  after: AttrValue | undefined
}

export interface ActionResult {
  ok: boolean
  state: DomainState
  events: AuditEvent[]
  diff: Change[]
  warnings: ActionWarning[]
  error?: ActionError
  message?: string
}

/** A delegated administration grant, stored in `state.aces`. */
export interface DelegationAce extends Ace {
  kind: 'delegation'
  trustee: Guid
  scope: Guid
  objectClasses: ObjectClass[]
}
