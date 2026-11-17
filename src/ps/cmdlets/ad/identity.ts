import { deriveDn } from '../../../domain/dn'
import { getObjectByDn } from '../../../domain/graph'
import type { DomainState, Guid, ObjectClass } from '../../../domain/types'
import { PsError } from '../../values'

export type IdentityError = { error: PsError }

/** Resolve supported AD identity forms using the domain's canonical DN parser and indexes. */
export function resolveIdentity(state: DomainState, value: unknown, classes?: ObjectClass[]): Guid | IdentityError {
  const input = typeof value === 'string' ? value : String(value ?? '')
  const key = input.toLocaleLowerCase('en-US')
  const guidKey = input.replace(/^\{(.+)\}$/, '$1').toLocaleLowerCase('en-US') as Guid
  let object: DomainState['objects'][Guid] | undefined = state.objects[guidKey]
  object ??= state.objects[state.indexes.bySid[key]]
  object ??= state.objects[state.indexes.bySamAccountName[key]]
  if (!object && /(^|,)\s*(cn|ou|dc)=/i.test(input)) object = getObjectByDn(state, input)
  if (!object) return { error: new PsError(`Cannot find an object with identity '${input}'. Use sAMAccountName, distinguished name, GUID, or SID; display names are not identities.`, { identity: input, help: 'Get-Help Get-ADUser -Examples' }) }
  if (classes && !classes.includes(object.objectClass)) return { error: new PsError(`Identity '${input}' is not a ${classes.join(' or ')}.`, { identity: input }) }
  return object.guid
}

export function identityText(state: DomainState, guid: Guid): string {
  return deriveDn(state, guid)
}
