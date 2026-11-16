export type Guid = string & { readonly __brand: 'Guid' }
export type Sid = string & { readonly __brand: 'Sid' }
export type ObjectClass = 'user' | 'computer' | 'group' | 'organizationalUnit' | 'container' | 'domain' | 'serviceAccount'
export type AttrValue = string | number | boolean | null | string[]

export interface DirObject {
  guid: Guid
  sid?: Sid
  objectClass: ObjectClass
  rdn: string
  parent: Guid | null
  attrs: Record<string, AttrValue>
  rev: number
}

export interface Membership {
  group: Guid
  member: Guid
}

export interface Resource { id: string; [key: string]: unknown }
export interface Ace { [key: string]: unknown }
export interface Session { [key: string]: unknown }
export interface AuditEvent {
  seq: number
  time: number
  origin: 'windows' | 'entra' | 'simulator'
  host?: string
  log?: string
  eventId?: number
  actor?: Guid
  target?: Guid
  source: 'console' | 'gui' | 'system'
  data: Record<string, string>
}

export interface DomainIndexes {
  byGuid: Record<string, Guid>
  bySid: Record<string, Guid>
  bySamAccountName: Record<string, Guid>
  byDn: Record<string, Guid>
  childrenByParent: Record<string, Guid[]>
  membersByGroup: Record<string, Guid[]>
  groupsByMember: Record<string, Guid[]>
  eventsByTime: number[]
}

export interface DomainState {
  revision: number
  now: number
  ids: { guidCounter: number; nextRid: number; rngState: number }
  objects: Record<Guid, DirObject>
  memberships: Membership[]
  resources: Record<string, Resource>
  aces: Ace[]
  sessions: Session[]
  events: AuditEvent[]
  indexes: DomainIndexes
}
