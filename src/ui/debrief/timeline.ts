import type { AuditEvent, DomainState } from '../../domain/types'
import type { Attempt } from '../../tickets/types'

export interface TimelineItem { time: string; text: string; eventId?: number; host?: string }

const MINUTE = 60_000
/** Lab clock as HH:MM. */
export function labTime(time: number): string {
  const minutes = Math.floor(time / MINUTE) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

const ADDED = new Set([4728, 4732, 4756])
const REMOVED = new Set([4729, 4733, 4757])

/** Plain name first, technical name second: "Maya Ali (mali)". Falls back to the event's own label. */
export function nameOf(state: DomainState | undefined, event: AuditEvent): string {
  const object = event.target ? state?.objects[event.target] : undefined
  const display = typeof object?.attrs.displayName === 'string' ? object.attrs.displayName : undefined
  const label = event.data.targetName
  if (display && label && display !== label) return `${display} (${label})`
  return display ?? label ?? 'an object'
}

/** One plain sentence per audit event. Unknown events fall back to their own data, never to invented text. */
export function describeEvent(event: AuditEvent, state?: DomainState): string {
  const d = event.data
  const target = nameOf(state, event)
  const where = event.host ? ` on ${event.host}` : ''
  switch (event.eventId) {
    case 4767: return `You unlocked ${target}.`
    case 4624: return `${target} signed in (simulated)${where}.`
    case 4625: return `${target} could not sign in (simulated)${where}.`
    case 4740: return `${target} was locked out.`
    case 4720: return `You created the account ${target}.`
    case 4722: return `You turned on ${target}.`
    case 4725: return `You turned off ${target}.`
    case 4724: return `You reset the password for ${target} (simulated).`
    case 4738: return `You changed ${target}${d.attributes ? `: ${d.attributes}` : ''}.`
  }
  if (event.eventId !== undefined && ADDED.has(event.eventId)) return `You added ${d.memberName ?? 'a member'} to ${target}.`
  if (event.eventId !== undefined && REMOVED.has(event.eventId)) return `You removed ${d.memberName ?? 'a member'} from ${target}.`
  if (d.kind === 'clock.advance') return `Lab time moved forward ${Math.round(Number(d.milliseconds) / MINUTE)} min (simulated).`
  if (d.kind === 'object.move') return `You moved ${target} to ${d.toDn ?? 'a new place'}.`
  if (d.kind === 'session.end') return `A simulated session for ${target} ended.`
  return `${d.kind ?? `Event ${event.eventId ?? ''}`.trim()}${d.targetName ? ` · ${d.targetName}` : ''} (simulated).`
}

/**
 * The numbered timeline for the debrief: every audit event this attempt added after its
 * checkpoint, in order. It comes from attempt history, not from canned text.
 */
export function timelineFor(attempt: Attempt): TimelineItem[] {
  const floor = Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq))
  return attempt.state.events
    .filter((event) => event.seq > floor)
    .map((event) => ({ time: labTime(event.time), text: describeEvent(event, attempt.state), ...(event.eventId === undefined ? {} : { eventId: event.eventId }), ...(event.host ? { host: event.host } : {}) }))
}
