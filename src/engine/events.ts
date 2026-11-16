import { deriveDn } from '../domain/dn'
import type { AuditEvent, DirObject, DomainState, Guid } from '../domain/types'
import type { GroupScope } from './groups'

/** An event before the pipeline stamps its sequence number, lab time, and source. */
export type EventDraft = Omit<AuditEvent, 'seq' | 'time' | 'source'>

export const EVENT_ID = {
  userCreated: 4720,
  userEnabled: 4722,
  passwordReset: 4724,
  userDisabled: 4725,
  userChanged: 4738,
  userUnlocked: 4767,
} as const

export const MEMBER_ADDED: Record<GroupScope, number> = { Global: 4728, DomainLocal: 4732, Universal: 4756 }
export const MEMBER_REMOVED: Record<GroupScope, number> = { Global: 4729, DomainLocal: 4733, Universal: 4757 }

/** The domain controller that records directory changes in its Security log. */
export function recordingHost(state: DomainState): string {
  for (const object of Object.values(state.objects)) {
    if (object.attrs.isDomainController === true && typeof object.attrs.dNSHostName === 'string') return object.attrs.dNSHostName
  }
  return 'unknown-host'
}

function label(state: DomainState, guid: Guid): string {
  const object: DirObject | undefined = state.objects[guid]
  if (!object) return ''
  const sam = object.attrs.sAMAccountName
  return typeof sam === 'string' ? sam : object.rdn
}

/** A Windows Security log event on the recording domain controller. */
export function windowsEvent(state: DomainState, eventId: number, actor: Guid, target: Guid, data: Record<string, string> = {}): EventDraft {
  return {
    origin: 'windows',
    host: recordingHost(state),
    log: 'Security',
    eventId,
    actor,
    target,
    data: { actorName: label(state, actor), targetName: label(state, target), targetDn: deriveDn(state, target), ...data },
  }
}

/** Simulator activity. It is kept visibly apart from Windows events and has no event ID. */
export function simulatorEvent(state: DomainState, kind: string, actor: Guid, target: Guid | undefined, data: Record<string, string> = {}): EventDraft {
  return {
    origin: 'simulator',
    actor,
    ...(target ? { target } : {}),
    data: { kind, actorName: label(state, actor), ...(target ? { targetName: label(state, target), targetDn: deriveDn(state, target) } : {}), ...data },
  }
}
