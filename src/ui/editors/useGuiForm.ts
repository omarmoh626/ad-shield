import { useEffect } from 'react'
import type { AttrValue, AuditEvent, DirObject, DomainState, Guid } from '../../domain/types'
import type { Action, ActionResult, ActionWarning } from '../../engine/types'
import { handlers, type Failure, type Plan } from '../../engine/handlers'
import { actions, getStore, operatorGuid, useStore } from '../store'
import { toConsoleEquivalent } from '../equivalent/toConsoleEquivalent'
import { displayName } from '../directory/labels'

export interface AttrChange { key: string; before: AttrValue | undefined; after: AttrValue | undefined }

/** One touched object that changed after the form opened. */
export interface StaleObject { guid: Guid; name: string; changes: AttrChange[]; moved: boolean; membership: boolean }

/** The part of an apply that committed before a later action failed. It stays committed, as in the console. */
export interface Saved { events: AuditEvent[]; warnings: ActionWarning[]; equivalent: string }

export type Outcome =
  | { kind: 'ok'; events: AuditEvent[]; warnings: ActionWarning[]; equivalent: string }
  | { kind: 'stale'; objects: StaleObject[]; saved?: Saved }
  | { kind: 'error'; message: string; error?: ActionResult['error']; saved?: Saved }

/** What changed on one object between two states, attribute by attribute. */
export function objectChanges(before: DirObject | undefined, after: DirObject | undefined): AttrChange[] {
  if (!before || !after) return []
  const keys = [...new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)])].sort()
  return keys.filter((key) => JSON.stringify(before.attrs[key]) !== JSON.stringify(after.attrs[key]))
    .map((key) => ({ key, before: before.attrs[key], after: after.attrs[key] }))
}

const groupsOf = (state: DomainState, guid: Guid) => [...(state.indexes.groupsByMember[guid] ?? [])].sort().join(',')
const membersOf = (state: DomainState, guid: Guid) => [...(state.indexes.membersByGroup[guid] ?? [])].sort().join(',')
const keyOf = (action: Action) => JSON.stringify(action)

/** The objects the pipeline checks for staleness: the handler's own `touches` list (CONTRACTS s5, D9). */
export function touchedBy(state: DomainState, action: Action): Guid[] {
  const handler = handlers[action.type] as ((s: DomainState, a: Action, c: { actor: Guid; source: 'gui'; whatIf: boolean }) => Plan | Failure) | undefined
  try {
    const plan = handler?.(state, action, { actor: operatorGuid, source: 'gui', whatIf: true })
    if (plan && !('error' in plan)) return plan.touches
  } catch { /* fall through to the action's own GUIDs */ }
  return Object.values(action).filter((value): value is Guid => typeof value === 'string' && value in state.objects)
}

/** Every touched object whose revision is newer than the form's base, with what changed since the form opened. */
export function staleObjects(opened: DomainState | undefined, now: DomainState, action: Action, baseRevision: number): StaleObject[] {
  return touchedBy(now, action).filter((guid) => (now.objects[guid]?.rev ?? 0) > baseRevision).map((guid) => {
    const was = opened?.objects[guid]
    const is = now.objects[guid]
    return {
      guid,
      name: is ? displayName(is) : was ? displayName(was) : guid,
      changes: objectChanges(was, is),
      moved: was?.parent !== is?.parent,
      membership: opened ? groupsOf(opened, guid) !== groupsOf(now, guid) || membersOf(opened, guid) !== membersOf(now, guid) : false,
    }
  })
}

/**
 * Shared GUI form logic (T07 contract). A form remembers the revision and state it opened against,
 * in the store, so a tab switch keeps both. Apply sends each Action through the store's
 * `dispatchGui`, never a handler. Like a console script, actions run in order: one that commits
 * stays committed when a later one fails, and the form never sends a committed action again.
 * A stale result keeps the draft and lists every touched object that changed. The draft must
 * never hold password characters.
 */
export function useGuiForm<D>(editor: string, guid: Guid | null, initial: () => D) {
  const key = `${editor}:${guid ?? 'none'}`
  const form = useStore((value) => value.forms[key])
  useEffect(() => { actions.openForm(key, guid) }, [key, guid])
  const draft = (form?.draft as D | undefined) ?? initial()
  const outcome = form?.outcome as Outcome | undefined
  const current = () => getStore().campaign.active?.state

  const setDraft = (next: D) => { actions.openForm(key, guid); actions.updateForm(key, { draft: next }) }

  /** Re-bases the form on the current state; keeps the draft and what it already committed. */
  const rebase = (state: DomainState) => ({ baseRevision: state.revision, snapshot: guid ? state.objects[guid] : undefined, groups: guid ? groupsOf(state, guid) : '', opened: state })
  /** Stale: "Review with the new values". */
  const review = () => {
    const state = current()
    if (state) actions.updateForm(key, { ...rebase(state), outcome: undefined })
  }
  /** Drops the draft and opens the form again against the current state. */
  const discard = () => { actions.closeForm(key); actions.openForm(key, guid) }

  /** Applies the actions in order. Returns true when every one committed. */
  const apply = (list: Action[]): boolean => {
    actions.openForm(key, guid)
    const opened = getStore().forms[key]
    if (!opened || !current()) return false
    const done = new Set(opened.committed ?? [])
    const pending = list.filter((action) => !done.has(keyOf(action)))
    if (pending.length === 0) return false
    let base = opened.baseRevision
    const events: AuditEvent[] = []
    const warnings: ActionWarning[] = []
    const equivalents: string[] = []
    const committed = [...done]
    for (const action of pending) {
      const at = current()!
      const result = actions.dispatchGui(action, base)
      if (!result.ok) {
        const saved: Saved | undefined = equivalents.length ? { events, warnings, equivalent: equivalents.join('\n') } : undefined
        const failed: Outcome = result.error === 'stale'
          ? { kind: 'stale', objects: staleObjects(opened.opened, current()!, action, base), ...(saved ? { saved } : {}) }
          : { kind: 'error', error: result.error, message: result.message ?? `The change was refused (${result.error ?? 'error'}).`, ...(saved ? { saved } : {}) }
        // A partial save is the learner's own change: re-base on it, keep the draft, remember what committed.
        // A stale result keeps the old base so the conflict stays visible until the learner reviews it.
        const after = current()!
        actions.updateForm(key, { outcome: failed, committed, ...(saved && result.error !== 'stale' ? rebase(after) : saved ? { baseRevision: base } : {}) })
        return false
      }
      equivalents.push(toConsoleEquivalent(action, at))
      events.push(...result.events)
      warnings.push(...result.warnings)
      committed.push(keyOf(action))
      base = result.state.revision
    }
    // The form now shows the saved values: re-base it and clear the draft.
    actions.updateForm(key, { ...rebase(current()!), draft: undefined, committed: undefined, outcome: { kind: 'ok', events, warnings, equivalent: equivalents.join('\n') } satisfies Outcome })
    return true
  }

  return { key, draft, setDraft, outcome, apply, review, discard, baseRevision: form?.baseRevision }
}
