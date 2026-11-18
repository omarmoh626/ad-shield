import { buildIndexes } from '../domain/indexes'
import { buildBaseDomain, LAB_START } from './baseDomain'
import type { AuditEvent, DirObject, DomainState, Guid } from '../domain/types'

/** Deterministic scale fixture used only by the separate performance build. */
export function buildLargeDomain(seed = 1): DomainState {
  const base = buildBaseDomain(seed).state
  const objects = { ...base.objects }
  const existing = Object.keys(objects).length
  const target = 2_000
  const parent = Object.values(objects).find((object) => object.objectClass === 'organizationalUnit')!.guid
  for (let index = 0; index < target - existing; index += 1) {
    const number = String(index + 1).padStart(4, '0')
    const guid = `10000000-0000-4000-8000-${number}00000000` as Guid
    const object: DirObject = {
      guid, objectClass: 'user', rdn: `Perf User ${number}`, parent,
      attrs: { displayName: `Perf User ${number}`, sAMAccountName: `perf${number}`, enabled: true }, rev: 0,
    }
    objects[guid] = object
  }
  const events: AuditEvent[] = Array.from({ length: 10_000 }, (_, index) => {
    const number = String(index + 1).padStart(5, '0')
    const guid = `10000000-0000-4000-8000-${String((index % (target - existing)) + 1).padStart(4, '0')}00000000` as Guid
    return {
      seq: index + 1, time: LAB_START + index * 1_000,
      origin: index % 3 === 0 ? 'windows' : index % 3 === 1 ? 'entra' : 'simulator',
      host: `PERF-DC${index % 4 + 1}`, log: 'Security', eventId: index % 2 ? 4720 : 4738,
      actor: base.indexes.byGuid[Object.keys(base.objects)[0]!]!, target: guid, source: 'system',
      data: { kind: 'perf.event', targetName: `Perf User ${String((index % (target - existing)) + 1).padStart(4, '0')}`, marker: `event-${number}` },
    }
  })
  const state: DomainState = { ...base, objects, events, indexes: base.indexes }
  return { ...state, indexes: buildIndexes(state) }
}
