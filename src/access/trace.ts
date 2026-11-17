import type { DomainState, Guid } from '../domain/types'
import type { AccessTrace, Right, SecurityContext } from './types'
import { evaluateLayer } from './evaluate'

export function evaluateAccess(state: DomainState, context: SecurityContext, resourceId: string, right: Right): AccessTrace {
  const resource = state.resources[resourceId]
  if (!resource || !isResource(resource)) return { allowed: false, layers: [], paths: [], via: 'none' }
  const layers = [resource.shareLayer, resource.fileLayer].map((layer) => evaluateLayer(state, context, resourceId, layer, right))
  const paths = context.paths
  const decisiveTrustees = layers.filter((layer) => layer.allowed).map((layer) => layer.entries.find((entry) => entry.applies)?.trustee).filter((trustee): trustee is Guid => trustee !== undefined)
  const hasDirect = decisiveTrustees.includes(context.user)
  const hasRole = decisiveTrustees.some((trustee) => paths.some((path) => path.trustee === trustee))
  const via = layers.every((layer) => layer.allowed) ? hasDirect && hasRole ? 'both' : hasDirect ? 'direct' : hasRole ? 'role' : 'none' : 'none'
  return { allowed: layers.length === 2 && layers.every((layer) => layer.allowed), layers, paths, via }
}

function isResource(value: unknown): value is { shareLayer: 'share' | 'file'; fileLayer: 'share' | 'file' } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (candidate.shareLayer === 'share' || candidate.shareLayer === 'file') && (candidate.fileLayer === 'share' || candidate.fileLayer === 'file')
}

