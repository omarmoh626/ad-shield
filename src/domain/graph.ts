import { deriveDn, dnKey } from './dn'
import { buildIndexes } from './indexes'
import { allocateGuid, allocateSid } from './ids'
import type { DirObject, DomainState, Guid, ObjectClass } from './types'

export interface CreateObjectInput {
  objectClass: ObjectClass
  rdn: string
  parent: Guid | null
  attrs?: DirObject['attrs']
  securityPrincipal?: boolean
}

export function createDomainState(seed = 1, now = 0): DomainState {
  const normalizedSeed = seed >>> 0
  const state: DomainState = { revision: 0, now, ids: { guidCounter: 0, nextRid: 1000, rngState: normalizedSeed || 0x6d2b79f5 }, objects: {}, memberships: [], resources: {}, aces: [], sessions: [], events: [], indexes: emptyIndexes() }
  state.indexes = buildIndexes(state)
  return state
}

export function createObject(state: DomainState, input: CreateObjectInput): { state: DomainState; object: DirObject } {
  if (input.parent !== null && !state.objects[input.parent]) throw new Error('Parent object not found')
  if (!input.rdn.trim()) throw new Error('Relative distinguished name cannot be empty')
  assertUniqueSiblingRdn(state, input.rdn, input.parent)
  const sam = input.attrs?.sAMAccountName
  if (typeof sam === 'string' && Object.values(state.objects).some((object) => typeof object.attrs.sAMAccountName === 'string' && object.attrs.sAMAccountName.toLocaleLowerCase('en-US') === sam.toLocaleLowerCase('en-US'))) {
    throw new Error('sAMAccountName already exists')
  }
  let next = state
  const allocatedGuid = allocateGuid(next)
  next = allocatedGuid.state
  let sid: DirObject['sid']
  if (input.securityPrincipal) {
    const allocatedSid = allocateSid(next)
    next = allocatedSid.state
    sid = allocatedSid.id
  }
  const object: DirObject = { guid: allocatedGuid.id, ...(sid ? { sid } : {}), objectClass: input.objectClass, rdn: input.rdn, parent: input.parent, attrs: { ...(input.attrs ?? {}) }, rev: state.revision + 1 }
  const objects = { ...next.objects, [object.guid]: object }
  next = { ...next, objects, indexes: buildIndexes({ ...next, objects }) }
  return { state: next, object }
}

export function getObject(state: DomainState, guid: Guid): DirObject | undefined {
  return state.objects[guid]
}

export function moveObject(state: DomainState, guid: Guid, parent: Guid | null): DomainState {
  const object = state.objects[guid]
  if (!object) throw new Error('Object not found')
  if (parent !== null && !state.objects[parent]) throw new Error('Parent object not found')
  if (parent === guid || (parent !== null && isDescendant(state, parent, guid))) throw new Error('Move would create a containment cycle')
  assertUniqueSiblingRdn(state, object.rdn, parent, guid)
  const moved = { ...object, parent, rev: state.revision + 1 }
  const objects = { ...state.objects, [guid]: moved }
  const next = { ...state, objects }
  return { ...next, indexes: buildIndexes(next) }
}

export function renameObject(state: DomainState, guid: Guid, rdn: string): DomainState {
  const object = state.objects[guid]
  if (!object) throw new Error('Object not found')
  if (!rdn.trim()) throw new Error('Relative distinguished name cannot be empty')
  assertUniqueSiblingRdn(state, rdn, object.parent, guid)
  const renamed = { ...object, rdn, rev: state.revision + 1 }
  const objects = { ...state.objects, [guid]: renamed }
  const next = { ...state, objects }
  return { ...next, indexes: buildIndexes(next) }
}

export function getObjectByDn(state: DomainState, dn: string): DirObject | undefined {
  const guid = state.indexes.byDn[dnKey(dn)]
  return guid ? state.objects[guid] : undefined
}

export function getChildren(state: DomainState, parent: Guid): DirObject[] {
  return (state.indexes.childrenByParent[String(parent)] ?? []).map((guid) => state.objects[guid])
}

export function getDn(state: DomainState, guid: Guid): string { return deriveDn(state, guid) }

function isDescendant(state: DomainState, candidate: Guid, ancestor: Guid): boolean {
  let current: Guid | null = candidate
  while (current !== null) {
    if (current === ancestor) return true
    current = state.objects[current]?.parent ?? null
  }
  return false
}

function assertUniqueSiblingRdn(state: DomainState, rdn: string, parent: Guid | null, except?: Guid): void {
  const key = rdn.toLocaleLowerCase('en-US')
  const duplicate = Object.values(state.objects).some((object) => object.guid !== except && object.parent === parent && object.rdn.toLocaleLowerCase('en-US') === key)
  if (duplicate) throw new Error('A sibling object already has this relative distinguished name')
}

function emptyIndexes() { return { byGuid: {}, bySid: {}, bySamAccountName: {}, byDn: {}, childrenByParent: {}, membersByGroup: {}, groupsByMember: {}, eventsByTime: [] } }
