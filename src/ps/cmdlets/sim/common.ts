import type { Right } from '../../../access/types'
import type { DirObject, DomainState, Guid } from '../../../domain/types'
import { isShareResource } from '../../../engine/handlers/acl'
import type { Resource } from '../../../access/types'
import { PsError, getProperty, isObject, toText, type PsValue } from '../../values'

export const SIM_MODULE = 'ADShield.Sim'

/** Display names of rights, as the console accepts and prints them. */
export const RIGHT_NAMES: Record<Right, string> = { read: 'Read', write: 'Write', modify: 'Modify', full: 'FullControl' }
export const RIGHT_VALUES = Object.values(RIGHT_NAMES)

export function parseRight(value: PsValue | undefined, fallback: Right = 'read'): Right {
  if (value === undefined || value === null) return fallback
  const wanted = toText(value).toLowerCase()
  const found = (Object.keys(RIGHT_NAMES) as Right[]).find((right) => RIGHT_NAMES[right].toLowerCase() === wanted)
  if (!found) throw new PsError(`The right '${toText(value)}' is not one of ${RIGHT_VALUES.join(', ')}.`)
  return found
}

/** sAMAccountName or RDN of an object, for display. */
export function labelOf(state: DomainState, guid: Guid): string {
  const object = state.objects[guid]
  if (!object) return String(guid)
  return typeof object.attrs.sAMAccountName === 'string' ? object.attrs.sAMAccountName : object.rdn
}

/** Finds a computer by name (PHARM-WS01), sAMAccountName (PHARM-WS01$), or DNS name. Matching ignores case. */
export function resolveComputer(state: DomainState, value: PsValue | undefined): DirObject {
  const text = toText(value ?? '').trim()
  const wanted = text.toLowerCase()
  const found = Object.values(state.objects).find((object) => object.objectClass === 'computer' && [object.rdn, object.attrs.sAMAccountName, object.attrs.dNSHostName].some((name) => typeof name === 'string' && name.toLowerCase() === wanted))
  if (!found) {
    const names = Object.values(state.objects).filter((object) => object.objectClass === 'computer').map((object) => object.rdn).sort()
    throw new PsError(`Cannot find a simulated computer named '${text}'. Lab computers: ${names.join(', ')}.`, { identity: text })
  }
  return found
}

/** Every simulated share, by name. */
export function shares(state: DomainState): Resource[] {
  return Object.values(state.resources).filter(isShareResource).sort((a, b) => a.name.localeCompare(b.name))
}

/** Finds a simulated share by name (Pharmacy), ID (share.pharmacy), or UNC path. Matching ignores case. */
export function resolveShare(state: DomainState, value: PsValue | undefined): Resource {
  const text = toText(value ?? '').trim()
  const wanted = text.toLowerCase()
  const found = shares(state).find((share) => [share.id, share.name, share.path].some((name) => typeof name === 'string' && name.toLowerCase() === wanted))
  if (!found) throw new PsError(`Cannot find a simulated share named '${text}'. Lab shares: ${shares(state).map((share) => share.name).join(', ')}.`, { identity: text, help: 'Get-Help Test-SimResourceAccess -Examples' })
  return found
}

/** A session ID from a string or from an object with a SessionId property, such as Test-SimSignIn output. */
export function sessionIdOf(value: PsValue | undefined): string {
  if (isObject(value)) {
    const id = getProperty(value, 'SessionId')
    if (typeof id === 'string' && id) return id
  }
  return toText(value ?? '').trim()
}
