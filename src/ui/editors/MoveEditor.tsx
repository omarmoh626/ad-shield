import { useEffect, useRef } from 'react'
import type { DirObject, DomainState, Guid } from '../../domain/types'
import { deriveDn } from '../../domain/dn'
import { ancestorsOf, isContainer } from '../directory/tree'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

/** Containers the object may move to: not its current parent, not itself or anything inside it. */
export function moveTargets(state: DomainState, object: DirObject): DirObject[] {
  return Object.values(state.objects)
    .filter((candidate) => isContainer(candidate) && candidate.guid !== object.parent && candidate.guid !== object.guid && !ancestorsOf(state, candidate.guid).includes(object.guid))
    .sort((a, b) => deriveDn(state, a.guid).localeCompare(deriveDn(state, b.guid)))
}

/** Move to another OU or container. */
export default function MoveEditor({ state, object, request }: { state: DomainState; object: DirObject; request?: EditorRequest }) {
  const form = useGuiForm<{ to: Guid | '' }>('move', object.guid, () => ({ to: '' }))
  const select = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (request?.editor === 'move') select.current?.focus() }, [request?.nonce, request?.editor])
  const targets = moveTargets(state, object)
  return <form className="editor" aria-label="Move" onSubmit={(event) => { event.preventDefault(); if (form.draft.to) form.apply([{ type: 'object.move', target: object.guid, newParent: form.draft.to }]) }}>
    <p className="label">Move</p>
    <p className="muted hint-line">Now in <span className="mono">{object.parent ? deriveDn(state, object.parent) : '(top)'}</span></p>
    <label className="field">
      <span>Move to</span>
      <select ref={select} id="editor-move" value={form.draft.to} onChange={(event) => form.setDraft({ to: event.target.value as Guid | '' })}>
        <option value="">Choose a container…</option>
        {targets.map((target) => <option key={target.guid} value={target.guid}>{deriveDn(state, target.guid)}</option>)}
      </select>
    </label>
    <div className="actions-row"><button type="submit" className="primary" disabled={!form.draft.to}>Apply</button></div>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
