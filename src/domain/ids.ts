import type { DomainState, Guid, Sid } from './types'

export function allocateGuid(state: DomainState): { state: DomainState; id: Guid } {
  const counter = state.ids.guidCounter + 1
  const id = `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}` as Guid
  return { state: { ...state, ids: { ...state.ids, guidCounter: counter } }, id }
}

export function allocateSid(state: DomainState): { state: DomainState; id: Sid } {
  const rid = state.ids.nextRid
  const id = `S-1-5-21-1000000000-1000000001-1000000002-${rid}` as Sid
  return { state: { ...state, ids: { ...state.ids, nextRid: rid + 1 } }, id }
}
