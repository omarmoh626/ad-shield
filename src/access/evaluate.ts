import type { DomainState } from '../domain/types'
import type { AccessLayerName, AccessLayerTrace, Ace, Right, SecurityContext } from './types'

export function evaluateLayer(state: DomainState, context: SecurityContext, resourceId: string, layer: AccessLayerName, right: Right): AccessLayerTrace {
  const candidates = state.aces.filter((candidate): candidate is Ace => isResourceAce(candidate)).filter((ace) => ace.resourceId === resourceId && ace.layer === layer)
  candidates.sort((a, b) => order(a) - order(b))
  const principals = new Set([context.user, ...Object.entries(state.objects).filter(([, object]) => object.sid && context.groupSids.includes(object.sid)).map(([guid]) => guid)])
  const entries = candidates.map((ace) => ({ ...ace, applies: principals.has(ace.trustee) && appliesToRequest(ace, right) }))
  const deciding = entries.find((entry) => entry.applies)
  return {
    layer,
    allowed: deciding?.effect === 'allow',
    reason: deciding ? `${deciding.effect} by ${deciding.trustee}` : 'no applicable ACE',
    entries,
  }
}

export function aceOrder(ace: Ace): number {
  return (ace.inherited ? 2 : 0) + (ace.effect === 'allow' ? 1 : 0)
}

function order(ace: Ace): number { return aceOrder(ace) }
function isResourceAce(ace: unknown): ace is Ace {
  if (!ace || typeof ace !== 'object') return false
  const candidate = ace as Partial<Ace>
  return typeof candidate.resourceId === 'string' && (candidate.layer === 'share' || candidate.layer === 'file') && typeof candidate.trustee === 'string' && (candidate.effect === 'allow' || candidate.effect === 'deny')
}
function permits(granted: Right, requested: Right): boolean {
  return granted === 'full' || granted === requested || (granted === 'modify' && (requested === 'read' || requested === 'write'))
}

function appliesToRequest(ace: Ace, requested: Right): boolean {
  if (ace.effect === 'allow') return permits(ace.right, requested)
  return rightAtoms(ace.right).some((atom) => rightAtoms(requested).includes(atom))
}

function rightAtoms(right: Right): Right[] {
  if (right === 'full') return ['read', 'write', 'modify']
  if (right === 'modify') return ['read', 'write']
  return [right]
}
