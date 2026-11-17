import type { AttrValue, DirObject, DomainState, Guid } from '../../domain/types'
import type { ActionError, Change } from '../types'

/** Small helpers for the T04 handlers. They mirror the private helpers in `../handlers.ts`. */
export interface Failure {
  error: ActionError
  message: string
}

export const fail = (error: ActionError, message: string): Failure => ({ error, message })

const same = (left: AttrValue | undefined, right: AttrValue | undefined): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

/** Returns a state where one object has new attribute values and the revision of this attempt. */
export function patch(state: DomainState, guid: Guid, attrs: Record<string, AttrValue>): DomainState {
  const object = state.objects[guid]
  const next: DirObject = { ...object, attrs: { ...object.attrs, ...attrs }, rev: state.revision + 1 }
  return { ...state, objects: { ...state.objects, [guid]: next } }
}

export function attrChanges(object: DirObject, attrs: Record<string, AttrValue>): Change[] {
  return Object.keys(attrs)
    .filter((key) => !same(object.attrs[key], attrs[key]))
    .map((key) => ({ kind: 'attr' as const, target: object.guid, key, before: object.attrs[key], after: attrs[key] }))
}

/** The sAMAccountName of an object, or its RDN when it has none. */
export function nameOf(object: DirObject): string {
  return typeof object.attrs.sAMAccountName === 'string' ? object.attrs.sAMAccountName : object.rdn
}

/** The DNS name of a computer, or its RDN when it has none. */
export function hostNameOf(object: DirObject): string {
  return typeof object.attrs.dNSHostName === 'string' ? object.attrs.dNSHostName : object.rdn
}
