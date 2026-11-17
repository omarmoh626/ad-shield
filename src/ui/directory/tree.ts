import type { DirObject, DomainState, Guid } from '../../domain/types'
import { displayName } from './labels'

export interface TreeRow {
  guid: Guid
  depth: number
  hasChildren: boolean
  expanded: boolean
  parent: Guid | null
}

const CONTAINERS = new Set(['domain', 'organizationalUnit', 'container'])
export const isContainer = (object: DirObject) => CONTAINERS.has(object.objectClass)

/** Children sorted with OUs and containers first, then by name. Reads the parent-to-children index. */
export function childrenOf(state: DomainState, parent: Guid): DirObject[] {
  const ids = state.indexes.childrenByParent[parent] ?? []
  return ids.flatMap((id) => state.objects[id] ? [state.objects[id]] : [])
    .sort((a, b) => Number(isContainer(b)) - Number(isContainer(a)) || displayName(a).localeCompare(displayName(b)))
}

export function rootsOf(state: DomainState): DirObject[] {
  return Object.values(state.objects).filter((object) => object.parent === null)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

/** Flattens the expanded part of the tree into rows, depth first. */
export function visibleRows(state: DomainState, expanded: ReadonlySet<Guid>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (object: DirObject, depth: number) => {
    const children = state.indexes.childrenByParent[object.guid] ?? []
    const open = expanded.has(object.guid)
    rows.push({ guid: object.guid, depth, hasChildren: children.length > 0, expanded: open && children.length > 0, parent: object.parent })
    if (open) for (const child of childrenOf(state, object.guid)) walk(child, depth + 1)
  }
  for (const root of rootsOf(state)) walk(root, 0)
  return rows
}

/** Every ancestor of an object, nearest first. */
export function ancestorsOf(state: DomainState, guid: Guid): Guid[] {
  const out: Guid[] = []
  let parent = state.objects[guid]?.parent ?? null
  while (parent) { out.push(parent); parent = state.objects[parent]?.parent ?? null }
  return out
}
