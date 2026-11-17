import type { DirObject, DomainState, Guid } from '../../domain/types'

/** Object type in plain words (DESIGN s6). Status is never color alone. */
export function typeLabel(object: DirObject): string {
  switch (object.objectClass) {
    // The base domain models service accounts as user objects flagged isServiceAccount.
    case 'user': return object.attrs.isServiceAccount === true ? 'Service account' : 'Person'
    case 'computer': return 'Computer'
    case 'group': return 'Group'
    case 'serviceAccount': return 'Service account'
    case 'organizationalUnit': return 'OU'
    case 'container': return 'Container'
    case 'domain': return 'Domain'
  }
}

const ACCOUNT_CLASSES = new Set(['user', 'computer', 'serviceAccount'])

/** Account status in text: "Disabled", "Locked out", or "Enabled". Empty for objects without an account. */
export function statusLabel(object: DirObject): string {
  if (!ACCOUNT_CLASSES.has(object.objectClass)) return ''
  const parts: string[] = []
  parts.push(object.attrs.enabled === false ? 'Disabled' : 'Enabled')
  if (object.attrs.lockedOut === true) parts.push('Locked out')
  return parts.join(' · ')
}

/** Display name first, then the object's own name. */
export function displayName(object: DirObject): string {
  return typeof object.attrs.displayName === 'string' && object.attrs.displayName ? object.attrs.displayName : object.rdn
}

/** Sign-in name for accounts and groups, if any. */
export function signInName(object: DirObject): string | undefined {
  return typeof object.attrs.sAMAccountName === 'string' ? object.attrs.sAMAccountName : undefined
}

/** Name for a GUID that may no longer exist. */
export function nameFor(state: DomainState, guid: Guid | undefined): string {
  if (!guid) return ''
  const object = state.objects[guid]
  return object ? displayName(object) : ''
}

/** Group kind in text, for example "Security · Global". Empty for non-groups. */
export function groupKind(object: DirObject): string {
  if (object.objectClass !== 'group') return ''
  return [object.attrs.groupCategory, object.attrs.groupScope].filter((part): part is string => typeof part === 'string').join(' · ')
}
