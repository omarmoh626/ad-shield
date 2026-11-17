import { deriveDn } from '../../domain/dn'
import type { AttrValue, DomainState, Guid } from '../../domain/types'
import { displayName } from '../directory/labels'

export interface DiffRow {
  /** Object the change belongs to, or '' for the lab clock and shares. */
  subject: string
  what: string
  before: string
  after: string
}

const show = (value: AttrValue | undefined): string => {
  if (value === undefined) return '(not set)'
  if (value === null || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return Array.isArray(value) ? value.join(', ') : String(value)
}

interface AclRow { resourceId: string; layer: string; trustee: Guid; right: string; effect: string }
const aclRows = (state: DomainState): AclRow[] => (state.aces as unknown as Partial<AclRow>[])
  .filter((ace): ace is AclRow => typeof ace.resourceId === 'string' && (ace.layer === 'share' || ace.layer === 'file') && typeof ace.trustee === 'string')
const aclKey = (ace: AclRow) => `${ace.resourceId}|${ace.layer}|${ace.trustee}|${ace.right}|${ace.effect}`

/**
 * Before and after for the current attempt: checkpoint versus now. Pure; compares objects,
 * containers, memberships, share entries, and the lab clock. Values only, never secrets.
 */
export function attemptDiff(before: DomainState, after: DomainState): DiffRow[] {
  const rows: DiffRow[] = []
  const name = (state: DomainState, guid: Guid) => { const object = state.objects[guid]; return object ? displayName(object) : guid }
  for (const guid of Object.keys(after.objects) as Guid[]) {
    const now = after.objects[guid]!
    const was = before.objects[guid]
    if (!was) { rows.push({ subject: displayName(now), what: 'Created', before: '(did not exist)', after: deriveDn(after, guid) }); continue }
    if (was.parent !== now.parent || was.rdn !== now.rdn) rows.push({ subject: displayName(now), what: 'Location', before: deriveDn(before, guid), after: deriveDn(after, guid) })
    for (const key of [...new Set([...Object.keys(was.attrs), ...Object.keys(now.attrs)])].sort()) {
      if (JSON.stringify(was.attrs[key]) !== JSON.stringify(now.attrs[key])) rows.push({ subject: displayName(now), what: key, before: show(was.attrs[key]), after: show(now.attrs[key]) })
    }
  }
  for (const guid of Object.keys(before.objects) as Guid[]) if (!after.objects[guid]) rows.push({ subject: name(before, guid), what: 'Deleted', before: deriveDn(before, guid), after: '(gone)' })
  const memberKey = (m: { group: Guid; member: Guid }) => `${m.group}|${m.member}`
  const was = new Set(before.memberships.map(memberKey))
  const is = new Set(after.memberships.map(memberKey))
  for (const m of after.memberships) if (!was.has(memberKey(m))) rows.push({ subject: name(after, m.member), what: `Member of ${name(after, m.group)}`, before: 'No', after: 'Yes' })
  for (const m of before.memberships) if (!is.has(memberKey(m))) rows.push({ subject: name(before, m.member), what: `Member of ${name(before, m.group)}`, before: 'Yes', after: 'No' })
  const aclWas = new Set(aclRows(before).map(aclKey))
  const aclIs = new Set(aclRows(after).map(aclKey))
  const shareName = (state: DomainState, id: string) => String(state.resources[id]?.name ?? id)
  for (const ace of aclRows(after)) if (!aclWas.has(aclKey(ace))) rows.push({ subject: shareName(after, ace.resourceId), what: `${ace.layer === 'share' ? 'Share' : 'File'} entry: ${ace.effect} ${ace.right} for ${name(after, ace.trustee)}`, before: 'Absent', after: 'Present' })
  for (const ace of aclRows(before)) if (!aclIs.has(aclKey(ace))) rows.push({ subject: shareName(before, ace.resourceId), what: `${ace.layer === 'share' ? 'Share' : 'File'} entry: ${ace.effect} ${ace.right} for ${name(before, ace.trustee)}`, before: 'Present', after: 'Absent' })
  if (before.now !== after.now) rows.push({ subject: 'Lab clock', what: 'Lab time', before: `${Math.round((after.now - before.now) / 60_000)} min earlier`, after: 'now' })
  return rows
}
