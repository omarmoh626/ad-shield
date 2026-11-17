import type { Ace as DomainAce, Guid, Resource as DomainResource, Sid } from '../domain/types'

export type Right = 'read' | 'write' | 'modify' | 'full'
export type AccessLayerName = 'share' | 'file'
export type AceEffect = 'allow' | 'deny'

export interface Resource extends DomainResource {
  id: string
  name: string
  shareLayer: AccessLayerName
  fileLayer: AccessLayerName
}

export interface Ace extends DomainAce {
  resourceId: string
  layer: AccessLayerName
  trustee: Guid
  right: Right
  effect: AceEffect
  inherited?: boolean
}

export interface SecurityContext {
  user: Guid
  userSid: Sid
  groupSids: Sid[]
  paths: MembershipPath[]
}

export interface MembershipPath {
  trustee: Guid
  sid: Sid
  path: Guid[]
}

export interface EvaluatedAce extends Ace {
  applies: boolean
}

export interface AccessLayerTrace {
  layer: AccessLayerName
  allowed: boolean
  reason: string
  entries: EvaluatedAce[]
}

export interface AccessTrace {
  allowed: boolean
  layers: AccessLayerTrace[]
  paths: MembershipPath[]
  via: 'role' | 'direct' | 'both' | 'none'
}
