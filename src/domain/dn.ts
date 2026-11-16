import type { DirObject, DomainState, Guid } from './types'

const escapeMap: Record<string, string> = { ',': '\\,', '+': '\\+', '"': '\\"', '\\': '\\\\', '<': '\\<', '>': '\\>', ';': '\\;' }

export function escapeRdn(value: string): string {
  return value.replace(/[,+"\\<>;]/g, (char) => escapeMap[char] ?? char)
}

export function unescapeRdn(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '\\' && index + 1 < value.length) index += 1
    result += value[index]
  }
  return result
}

export function parseDn(dn: string): string[] {
  const parts: string[] = []
  let current = ''
  let escaped = false
  for (const char of dn) {
    if (escaped) { current += char; escaped = false }
    else if (char === '\\') { current += char; escaped = true }
    else if (char === ',') { parts.push(current.trim()); current = '' }
    else current += char
  }
  if (escaped) throw new Error('Distinguished name ends with an incomplete escape')
  if (current.length > 0) parts.push(current.trim())
  return parts
}

export function deriveDn(state: DomainState, objectOrGuid: DirObject | Guid): string {
  const object = typeof objectOrGuid === 'string' ? state.objects[objectOrGuid] : objectOrGuid
  if (!object) throw new Error('Object not found')
  const parts = rdnParts(object)
  const visited = new Set<Guid>([object.guid])
  let parent = object.parent
  while (parent !== null) {
    if (visited.has(parent)) throw new Error('Containment cycle detected')
    visited.add(parent)
    const ancestor = state.objects[parent]
    if (!ancestor) throw new Error('Parent object not found')
    parts.push(...rdnParts(ancestor))
    parent = ancestor.parent
  }
  return parts.join(',')
}

function rdnParts(object: DirObject): string[] {
  return object.objectClass === 'domain'
    ? object.rdn.split('.').map((label) => `DC=${escapeRdn(label)}`)
    : [`${prefixFor(object.objectClass)}=${escapeRdn(object.rdn)}`]
}

export function dnKey(dn: string): string {
  return parseDn(dn).map((part) => part.toLocaleLowerCase('en-US')).join(',')
}

function prefixFor(objectClass: DirObject['objectClass']): string {
  if (objectClass === 'organizationalUnit') return 'OU'
  if (objectClass === 'domain') return 'DC'
  return 'CN'
}
