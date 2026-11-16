import type { Ace, DomainState, Guid, ObjectClass } from '../domain/types'
import { isPermissionBearing } from './groups'
import type { DelegationAce } from './types'

/** A right the actor must hold: manage objects of one class inside one container. */
export interface Need {
  within: Guid | null
  objectClass: ObjectClass
  /** The existing object being changed, when there is one. */
  target?: Guid
}

export function isDelegationAce(ace: Ace): ace is DelegationAce {
  return ace.kind === 'delegation' && typeof ace.trustee === 'string' && typeof ace.scope === 'string' && Array.isArray(ace.objectClasses)
}

/**
 * The actor plus every security group it belongs to, directly or through nesting.
 * A distribution group never enters this set and never passes membership on,
 * so it can never satisfy a delegation.
 */
export function principalsOf(state: DomainState, actor: Guid): Set<Guid> {
  const seen = new Set<Guid>([actor])
  const queue: Guid[] = [actor]
  for (let index = 0; index < queue.length; index += 1) {
    for (const group of state.indexes.groupsByMember[String(queue[index])] ?? []) {
      const object = state.objects[group]
      if (!object || !isPermissionBearing(object)) continue
      if (!seen.has(group)) {
        seen.add(group)
        queue.push(group)
      }
    }
  }
  return seen
}

function isSelfOrAncestor(state: DomainState, scope: Guid, container: Guid): boolean {
  const visited = new Set<Guid>()
  let current: Guid | null = container
  while (current !== null && !visited.has(current)) {
    if (current === scope) return true
    visited.add(current)
    current = state.objects[current]?.parent ?? null
  }
  return false
}

/**
 * Authorization is the same for every source. `source: 'system'` is a label
 * for the audit trail and never widens what the actor may do.
 */
export function isAuthorized(state: DomainState, actor: Guid, need: Need): boolean {
  const within = need.within
  if (within === null) return false
  // Protected accounts and groups (adminCount 1) do not inherit delegated rights from their container.
  if (need.target !== undefined && state.objects[need.target]?.attrs.adminCount === 1) return false
  const principals = principalsOf(state, actor)
  return state.aces.some((ace) => isDelegationAce(ace)
    && principals.has(ace.trustee)
    && ace.objectClasses.includes(need.objectClass)
    && isSelfOrAncestor(state, ace.scope, within))
}
