import type { AccessLayerName, Ace as ResourceAce, Resource, Right } from '../../access/types'
import type { Ace, DirObject, DomainState, Guid } from '../../domain/types'
import { principalsOf } from '../authz'
import { simulatorEvent } from '../events'
import { groupCategory } from '../groups'
import type { Handler } from '../handlers'
import type { AclLayer, Change } from '../types'
import { fail, nameOf, type Failure } from './common'

export const RIGHTS: readonly Right[] = ['read', 'write', 'modify', 'full']

/**
 * The right to change the permissions of one simulated share (DECISIONS D4).
 * Stored in `state.aces` next to delegation grants and resource entries.
 */
export interface ResourceAdminAce extends Ace {
  kind: 'resourceAdmin'
  trustee: Guid
  resourceId: string
}

export function isResourceAdminAce(ace: Ace): ace is ResourceAdminAce {
  return ace.kind === 'resourceAdmin' && typeof ace.trustee === 'string' && typeof ace.resourceId === 'string'
}

export function isShareResource(value: unknown): value is Resource {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Resource>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && candidate.shareLayer === 'share' && candidate.fileLayer === 'file'
}

/** True when the actor, or a security group it belongs to, holds a resourceAdmin grant on the share. */
export function canManageResource(state: DomainState, actor: Guid, resourceId: string): boolean {
  const principals = principalsOf(state, actor)
  return state.aces.some((ace) => isResourceAdminAce(ace) && ace.resourceId === resourceId && principals.has(ace.trustee))
}

const layersOf = (layer: AclLayer | undefined): AccessLayerName[] => layer === 'share' ? ['share'] : layer === 'file' ? ['file'] : ['share', 'file']

/** An explicit allow entry written by these actions. Inherited entries are never added or removed here. */
const isExplicitAllow = (ace: Ace, resourceId: string, trustee: Guid, right: Right, layer: AccessLayerName): boolean =>
  ace.resourceId === resourceId && ace.trustee === trustee && ace.right === right && ace.layer === layer && ace.effect === 'allow' && ace.inherited !== true

interface Checked { resource: Resource; trustee: DirObject; layers: AccessLayerName[] }

/** Shared checks for both actions: the share exists, the actor may manage it, the trustee can hold a permission. */
function check(state: DomainState, actor: Guid, resourceId: string, trusteeGuid: Guid, right: Right, layer: AclLayer | undefined): Checked | Failure {
  const resource = state.resources[resourceId]
  if (!isShareResource(resource)) return fail('notFound', `The simulated share ${resourceId} was not found.`)
  // Authorization runs before any other check, for every source, including previews.
  if (!canManageResource(state, actor, resource.id)) return fail('denied', `The operator account has no right to change permissions on the simulated share ${resource.name}.`)
  if (!RIGHTS.includes(right)) return fail('invalid', `The right ${String(right)} is not one of ${RIGHTS.join(', ')}.`)
  if (layer !== undefined && layer !== 'share' && layer !== 'file' && layer !== 'both') return fail('invalid', 'The layer must be share, file, or both.')
  const trustee: DirObject | undefined = state.objects[trusteeGuid]
  if (!trustee) return fail('notFound', 'The trustee was not found.')
  if (!trustee.sid || !['user', 'computer', 'group', 'serviceAccount'].includes(trustee.objectClass)) return fail('invalid', 'Only users, computers, and security groups can hold a permission.')
  if (trustee.objectClass === 'group' && groupCategory(trustee) === 'Distribution') return fail('invalid', 'A distribution group cannot hold a permission. Use a security group.')
  return { resource, trustee, layers: layersOf(layer) }
}

const isFailure = (value: object): value is Failure => 'error' in value

export const aclAddEntry: Handler<'acl.addEntry'> = (state, action, ctx) => {
  const checked = check(state, ctx.actor, action.resource, action.trustee, action.right, action.layer)
  if (isFailure(checked)) return checked
  const { resource, trustee, layers } = checked
  return {
    needs: [],
    touches: [trustee.guid],
    apply: () => {
      const missing = layers.filter((layer) => !state.aces.some((ace) => isExplicitAllow(ace, resource.id, trustee.guid, action.right, layer)))
      if (missing.length === 0) return { state, changes: [], events: [], warnings: [{ code: 'noChange', message: 'This permission entry already exists.' }] }
      const added: ResourceAce[] = missing.map((layer) => ({ resourceId: resource.id, layer, trustee: trustee.guid, right: action.right, effect: 'allow' }))
      const next = { ...state, aces: [...state.aces, ...added] }
      const changes: Change[] = added.map((ace) => ({ kind: 'acl', target: trustee.guid, key: `${resource.name}:${ace.layer}`, before: undefined, after: `allow ${ace.right}` }))
      return {
        state: next,
        changes,
        events: [simulatorEvent(next, 'acl.addEntry', ctx.actor, trustee.guid, { resource: resource.name, layers: missing.join(','), right: action.right, trusteeName: nameOf(trustee) })],
        warnings: [],
      }
    },
  }
}

export const aclRemoveEntry: Handler<'acl.removeEntry'> = (state, action, ctx) => {
  const checked = check(state, ctx.actor, action.resource, action.trustee, action.right, action.layer)
  if (isFailure(checked)) return checked
  const { resource, trustee, layers } = checked
  return {
    needs: [],
    touches: [trustee.guid],
    apply: () => {
      const removed = state.aces.filter((ace) => layers.some((layer) => isExplicitAllow(ace, resource.id, trustee.guid, action.right, layer)))
      if (removed.length === 0) return fail('notFound', `No explicit allow ${action.right} entry for ${nameOf(trustee)} exists on the simulated share ${resource.name}.`)
      const next = { ...state, aces: state.aces.filter((ace) => !removed.includes(ace)) }
      const changes: Change[] = removed.map((ace) => ({ kind: 'acl', target: trustee.guid, key: `${resource.name}:${String(ace.layer)}`, before: `allow ${action.right}`, after: undefined }))
      return {
        state: next,
        changes,
        events: [simulatorEvent(next, 'acl.removeEntry', ctx.actor, trustee.guid, { resource: resource.name, layers: removed.map((ace) => String(ace.layer)).join(','), right: action.right, trusteeName: nameOf(trustee) })],
        warnings: [],
      }
    },
  }
}
