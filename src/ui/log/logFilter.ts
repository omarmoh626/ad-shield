import type { AuditEvent, DomainState } from '../../domain/types'
import { describeEvent } from '../debrief/timeline'
import { nameFor, signInName } from '../directory/labels'

export type OriginFilter = 'all' | AuditEvent['origin']

export interface LogFilter {
  text: string
  origin: OriginFilter
  host: string
  eventId: string
  actor: string
  target: string
}

export const EMPTY_FILTER: LogFilter = { text: '', origin: 'all', host: '', eventId: '', actor: '', target: '' }

/** Origin in text (CONTRACTS s6 and DESIGN s6): Windows, Entra, Simulator. */
export const ORIGIN_LABEL: Record<AuditEvent['origin'], string> = { windows: 'Windows', entra: 'Entra', simulator: 'Simulator' }

/** Display name and sign-in name for a GUID, so a filter matches either. */
function who(state: DomainState, guid: AuditEvent['actor']): string {
  if (!guid) return ''
  const object = state.objects[guid]
  return [nameFor(state, guid), object ? signInName(object) : undefined].filter(Boolean).join(' ')
}

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.trim().toLowerCase())

/** Pure filter over the audit log, newest first. Every field is case-insensitive; empty fields match all. */
export function filterEvents(state: DomainState, filter: LogFilter): AuditEvent[] {
  const out: AuditEvent[] = []
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index]!
    if (filter.origin !== 'all' && event.origin !== filter.origin) continue
    if (filter.eventId.trim() && String(event.eventId ?? '') !== filter.eventId.trim()) continue
    if (filter.host.trim() && !has(event.host ?? '', filter.host)) continue
    if (filter.actor.trim() && !has(`${who(state, event.actor)} ${event.data.actorName ?? ''}`, filter.actor)) continue
    if (filter.target.trim() && !has(`${who(state, event.target)} ${event.data.targetName ?? ''}`, filter.target)) continue
    if (filter.text.trim()) {
      const all = [describeEvent(event, state), ORIGIN_LABEL[event.origin], event.host, event.log, event.eventId, ...Object.values(event.data)].join(' ')
      if (!has(all, filter.text)) continue
    }
    out.push(event)
  }
  return out
}
