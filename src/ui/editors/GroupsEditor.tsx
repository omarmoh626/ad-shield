import { useEffect, useRef } from 'react'
import type { DirObject, DomainState, Guid } from '../../domain/types'
import type { Action } from '../../engine/types'
import { displayName, groupKind } from '../directory/labels'
import { directGroupsOf } from '../properties/ObjectProperties'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

interface GroupsDraft { add: Guid | ''; remove: Guid[] }

/** Add to a group and remove from direct groups. Nothing changes until Apply. */
export default function GroupsEditor({ state, object, request }: { state: DomainState; object: DirObject; request?: EditorRequest }) {
  const form = useGuiForm<GroupsDraft>('groups', object.guid, () => ({ add: '', remove: [] }))
  const select = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (request?.editor === 'groups') select.current?.focus() }, [request?.nonce, request?.editor])
  const direct = directGroupsOf(state, object.guid)
  const directIds = new Set(direct.map((group) => group.guid))
  const candidates = Object.values(state.objects)
    .filter((group) => group.objectClass === 'group' && group.guid !== object.guid && !directIds.has(group.guid))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
  const { draft } = form
  const list: Action[] = [
    ...draft.remove.filter((group) => directIds.has(group)).map((group): Action => ({ type: 'group.removeMember', group, member: object.guid })),
    ...(draft.add ? [{ type: 'group.addMember', group: draft.add, member: object.guid } as Action] : []),
  ]
  const toggle = (group: Guid, on: boolean) => form.setDraft({ ...draft, remove: on ? [...draft.remove, group] : draft.remove.filter((id) => id !== group) })

  return <form className="editor" aria-label="Group membership" onSubmit={(event) => { event.preventDefault(); form.apply(list) }}>
    <p className="label">Change group membership</p>
    <label className="field">
      <span>Add to group</span>
      <select ref={select} id="editor-groups" value={draft.add} onChange={(event) => form.setDraft({ ...draft, add: event.target.value as Guid | '' })}>
        <option value="">Choose a group…</option>
        {candidates.map((group) => <option key={group.guid} value={group.guid}>{displayName(group)} · {groupKind(group)}</option>)}
      </select>
    </label>
    {direct.length > 0 && <fieldset>
      <legend>Remove from group</legend>
      {direct.map((group) => <label key={group.guid} className="choice">
        <input type="checkbox" checked={draft.remove.includes(group.guid)} onChange={(event) => toggle(group.guid, event.target.checked)} />
        <span>Remove from {displayName(group)}</span>
      </label>)}
    </fieldset>}
    <div className="actions-row">
      <button type="submit" className="primary" disabled={list.length === 0}>Apply</button>
      {list.length > 0 && <button type="button" className="quiet" onClick={form.discard}>Cancel</button>}
    </div>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
