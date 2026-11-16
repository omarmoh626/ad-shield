import { deriveDn, dnKey } from './dn'
import type { DomainIndexes, DomainState, Guid } from './types'

export function buildIndexes(state: Pick<DomainState, 'objects' | 'memberships' | 'events'>): DomainIndexes {
  const indexes: DomainIndexes = { byGuid: {}, bySid: {}, bySamAccountName: {}, byDn: {}, childrenByParent: {}, membersByGroup: {}, groupsByMember: {}, eventsByTime: [] }
  for (const object of Object.values(state.objects)) {
    indexes.byGuid[object.guid] = object.guid
    if (object.sid) indexes.bySid[object.sid.toLocaleLowerCase('en-US')] = object.guid
    const sam = object.attrs.sAMAccountName
    if (typeof sam === 'string') indexes.bySamAccountName[sam.toLocaleLowerCase('en-US')] = object.guid;
    indexes.byDn[dnKey(deriveDn(state as DomainState, object))] = object.guid
    if (object.parent !== null) (indexes.childrenByParent[String(object.parent)] ??= []).push(object.guid)
  }
  for (const membership of state.memberships) {
    (indexes.membersByGroup[String(membership.group)] ??= []).push(membership.member);
    (indexes.groupsByMember[String(membership.member)] ??= []).push(membership.group);
  }
  indexes.eventsByTime = state.events.map((event) => event.time).sort((left, right) => left - right)
  return indexes
}

export function findBySamAccountName(state: DomainState, name: string): Guid | undefined {
  return state.indexes.bySamAccountName[name.toLocaleLowerCase('en-US')]
}

export function findByDn(state: DomainState, dn: string): Guid | undefined {
  return state.indexes.byDn[dnKey(dn)]
}
