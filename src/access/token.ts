import type { DirObject, DomainState, Guid } from '../domain/types'
import { groupCategory, groupScope, isPrimaryGroupOf } from '../engine/groups'
import type { MembershipPath, SecurityContext } from './types'

export function buildContext(state: DomainState, user: Guid): SecurityContext {
  const principal = state.objects[user]
  if (!principal?.sid) throw new Error(`Security principal ${user} has no SID`)

  const paths: MembershipPath[] = []
  const visited = new Set<Guid>([user])
  const queue: Array<{ object: DirObject; path: Guid[] }> = [{ object: principal, path: [user] }]

  while (queue.length) {
    const current = queue.shift()!
    for (const group of Object.values(state.objects)) {
      if (group.objectClass !== 'group' || !group.sid || groupCategory(group) !== 'Security') continue
      const primary = current.object.guid === user && isPrimaryGroupOf(group, principal)
      const direct = state.indexes.membersByGroup[String(group.guid)]?.includes(current.object.guid) ?? false
      if (!primary && !direct) continue
      if (visited.has(group.guid) || !validNesting(current.object, group)) continue
      visited.add(group.guid)
      const path = [...current.path, group.guid]
      paths.push({ trustee: group.guid, sid: group.sid, path })
      queue.push({ object: group, path })
    }
  }

  return { user, userSid: principal.sid, groupSids: paths.map(({ sid }) => sid), paths }
}

function validNesting(member: DirObject, group: DirObject): boolean {
  const scope = groupScope(group)
  if (!scope) return false
  if (member.objectClass !== 'group') return member.objectClass === 'user' || member.objectClass === 'computer' || member.objectClass === 'serviceAccount'
  const memberScope = groupScope(member)
  if (!memberScope) return false
  if (scope === 'Global') return memberScope === 'Global'
  if (scope === 'Universal') return memberScope === 'Global' || memberScope === 'Universal'
  return true
}
