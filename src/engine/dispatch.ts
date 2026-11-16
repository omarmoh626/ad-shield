import { buildIndexes } from '../domain/indexes'
import type { AuditEvent, DomainState } from '../domain/types'
import { isAuthorized } from './authz'
import { handlers, type Failure, type Plan } from './handlers'
import type { Action, ActionCtx, ActionError, ActionResult } from './types'

type AnyHandler = (state: DomainState, action: Action, ctx: ActionCtx) => Plan | Failure

/**
 * The one pipeline for console commands, GUI saves, and system events.
 * It is pure: it reads the state and returns a result. When nothing is
 * committed, the returned state is the input reference.
 */
export function dispatch(state: DomainState, action: Action, ctx: ActionCtx): ActionResult {
  const reject = (error: ActionError, message: string): ActionResult => ({ ok: false, state, events: [], diff: [], warnings: [], error, message })

  // The actor must be an enabled user account. A group, a computer, or a disabled account can never act.
  const actor = state.objects[ctx.actor]
  if (!actor || actor.objectClass !== 'user' || actor.attrs.enabled !== true) return reject('denied', 'The acting account is not an enabled user account.')
  const handler = handlers[action.type] as AnyHandler | undefined
  if (!handler) return reject('unsupported', `The action ${action.type} is not available yet.`)

  let plan: Plan | Failure
  try {
    plan = handler(state, action, ctx)
  } catch (error) {
    return reject('invalid', error instanceof Error ? error.message : 'The action could not be read.')
  }
  if ('error' in plan) return reject(plan.error, plan.message)

  // Authorization runs for every source. No source may skip it.
  if (!plan.needs.every((need) => isAuthorized(state, ctx.actor, need))) return reject('denied', 'The operator account has no delegated rights over this object.')

  const baseRevision = ctx.baseRevision
  if (ctx.source === 'gui' && baseRevision !== undefined && plan.touches.some((guid) => (state.objects[guid]?.rev ?? 0) > baseRevision)) {
    return reject('stale', 'This object changed after the form was opened. Review the current values before saving.')
  }

  let applied: ReturnType<Plan['apply']>
  try {
    applied = plan.apply()
  } catch (error) {
    return reject('invalid', error instanceof Error ? error.message : 'The action could not be applied.')
  }
  if ('error' in applied) return reject(applied.error, applied.message)

  // A preview and a no-op both leave the input state in place and append nothing.
  if (ctx.whatIf || applied.changes.length === 0) return { ok: true, state, events: [], diff: applied.changes, warnings: applied.warnings }

  const events: AuditEvent[] = applied.events.map((draft, index) => ({ ...draft, seq: state.events.length + 1 + index, time: applied.state.now, source: ctx.source }))
  const next = { ...applied.state, revision: state.revision + 1, events: [...state.events, ...events] }
  return { ok: true, state: { ...next, indexes: buildIndexes(next) }, events, diff: applied.changes, warnings: applied.warnings }
}
