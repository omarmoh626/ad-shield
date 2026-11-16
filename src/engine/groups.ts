import type { DirObject, DomainState, Guid } from '../domain/types'

export type GroupScope = 'Global' | 'Universal' | 'DomainLocal'
export type GroupCategory = 'Security' | 'Distribution'
export type MemberKind = 'user' | 'computer' | GroupScope

/**
 * Allowed member kinds per group scope inside one domain.
 * Rows are the containing group. A kind that is not listed is rejected.
 */
export const NESTING: Record<GroupScope, readonly MemberKind[]> = {
  Global: ['user', 'computer', 'Global'],
  Universal: ['user', 'computer', 'Global', 'Universal'],
  DomainLocal: ['user', 'computer', 'Global', 'Universal', 'DomainLocal'],
}

export function groupScope(group: DirObject): GroupScope | undefined {
  const scope = group.attrs.groupScope
  return scope === 'Global' || scope === 'Universal' || scope === 'DomainLocal' ? scope : undefined
}

export function groupCategory(group: DirObject): GroupCategory {
  return group.attrs.groupCategory === 'Distribution' ? 'Distribution' : 'Security'
}

/** Only security groups can carry permissions. Distribution groups never do. */
export function isPermissionBearing(group: DirObject): boolean {
  return group.objectClass === 'group' && groupCategory(group) === 'Security'
}

export function memberKind(member: DirObject): MemberKind | undefined {
  if (member.objectClass === 'user' || member.objectClass === 'serviceAccount') return 'user'
  if (member.objectClass === 'computer') return 'computer'
  if (member.objectClass === 'group') return groupScope(member)
  return undefined
}

export function canNest(scope: GroupScope, kind: MemberKind): boolean {
  return NESTING[scope].includes(kind)
}

/** The relative identifier, the last part of a SID. */
export function ridOf(object: DirObject): number | undefined {
  if (!object.sid) return undefined
  const rid = Number(object.sid.slice(object.sid.lastIndexOf('-') + 1))
  return Number.isSafeInteger(rid) ? rid : undefined
}

/** True when `group` is the member's primary group. That link is an attribute, not a membership row. */
export function isPrimaryGroupOf(group: DirObject, member: DirObject): boolean {
  const rid = ridOf(group)
  return rid !== undefined && member.attrs.primaryGroupID === rid
}

/** True when `candidate` already contains `group`, directly or through nesting. */
export function containsGroup(state: DomainState, candidate: Guid, group: Guid): boolean {
  const seen = new Set<Guid>([candidate])
  const queue: Guid[] = [candidate]
  for (let index = 0; index < queue.length; index += 1) {
    for (const member of state.indexes.membersByGroup[String(queue[index])] ?? []) {
      if (member === group) return true
      if (!seen.has(member)) {
        seen.add(member)
        queue.push(member)
      }
    }
  }
  return false
}
