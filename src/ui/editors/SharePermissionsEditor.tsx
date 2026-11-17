import { useEffect, useRef } from 'react'
import type { Ace, Right } from '../../access/types'
import type { DirObject, DomainState, Guid } from '../../domain/types'
import type { Action, AclLayer } from '../../engine/types'
import { RIGHT_NAMES, shares } from '../../ps/cmdlets/sim/common'
import { displayName, typeLabel } from '../directory/labels'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

interface ShareDraft { share: string; trustee: Guid | ''; right: Right; layer: AclLayer; remove: string[] }

const PRINCIPALS = new Set(['user', 'computer', 'group', 'serviceAccount'])
const LAYER_TEXT: Record<AclLayer, string> = { both: 'Share and file', share: 'Share only', file: 'File (NTFS) only' }
const entryKey = (ace: Ace) => `${ace.layer}|${ace.trustee}|${ace.right}`

/** Allow entries on one share, both layers, in a stable order. */
export function shareEntries(state: DomainState, resourceId: string): Ace[] {
  return (state.aces as Ace[]).filter((ace) => ace.resourceId === resourceId && (ace.layer === 'share' || ace.layer === 'file') && typeof ace.trustee === 'string')
    .sort((a, b) => a.layer.localeCompare(b.layer) || displayName(state.objects[a.trustee]!).localeCompare(displayName(state.objects[b.trustee]!)))
}

/**
 * Share permissions editor (DECISIONS D4). Adds or removes Allow entries on the simulated share
 * and file layers. A direct grant to a person is allowed here so a case can grade it.
 */
export default function SharePermissionsEditor({ state, object, request }: { state: DomainState; object: DirObject; request?: EditorRequest }) {
  const all = shares(state)
  const defaultTrustee = PRINCIPALS.has(object.objectClass) ? object.guid : ''
  const form = useGuiForm<ShareDraft>('share', object.guid, () => ({ share: all[0]?.id ?? '', trustee: defaultTrustee, right: 'read', layer: 'both', remove: [] }))
  const select = useRef<HTMLSelectElement>(null)
  useEffect(() => { if (request?.editor === 'share') select.current?.focus() }, [request?.nonce, request?.editor])
  const { draft } = form
  const entries = draft.share ? shareEntries(state, draft.share) : []
  const principals = Object.values(state.objects).filter((candidate) => PRINCIPALS.has(candidate.objectClass) && candidate.attrs.groupCategory !== 'Distribution')
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
  const removing = entries.filter((ace) => draft.remove.includes(entryKey(ace)))
  const list: Action[] = removing.map((ace): Action => ({ type: 'acl.removeEntry', resource: draft.share, trustee: ace.trustee, right: ace.right, layer: ace.layer }))
  const addAction: Action | undefined = draft.trustee && draft.share ? { type: 'acl.addEntry', resource: draft.share, trustee: draft.trustee, right: draft.right, layer: draft.layer } : undefined

  return <form className="editor" aria-label="Share permissions" onSubmit={(event) => { event.preventDefault() }}>
    <p className="label">Share permissions · simulated</p>
    <label className="field">
      <span>Share</span>
      <select ref={select} id="editor-share" value={draft.share} onChange={(event) => form.setDraft({ ...draft, share: event.target.value, remove: [] })}>
        {all.map((share) => <option key={share.id} value={share.id}>{share.name}</option>)}
      </select>
    </label>
    <fieldset>
      <legend>Entries on this share (all Allow)</legend>
      {entries.length === 0 && <p className="muted">No entries.</p>}
      {entries.map((ace) => <label key={entryKey(ace)} className="choice">
        <input type="checkbox" checked={draft.remove.includes(entryKey(ace))} onChange={(event) => form.setDraft({ ...draft, remove: event.target.checked ? [...draft.remove, entryKey(ace)] : draft.remove.filter((key) => key !== entryKey(ace)) })} />
        <span>Remove {RIGHT_NAMES[ace.right]} for {displayName(state.objects[ace.trustee]!)} ({typeLabel(state.objects[ace.trustee]!)}) · {ace.layer === 'share' ? 'Share layer' : 'File layer'}</span>
      </label>)}
    </fieldset>
    <div className="actions-row"><button type="button" className="primary" disabled={list.length === 0} onClick={() => form.apply(list)}>Remove selected</button></div>
    <fieldset>
      <legend>Add an Allow entry</legend>
      <label className="field">
        <span>Who</span>
        <select value={draft.trustee} onChange={(event) => form.setDraft({ ...draft, trustee: event.target.value as Guid | '' })}>
          <option value="">Choose a person, computer, or group…</option>
          {principals.map((principal) => <option key={principal.guid} value={principal.guid}>{displayName(principal)} · {typeLabel(principal)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Right</span>
        <select value={draft.right} onChange={(event) => form.setDraft({ ...draft, right: event.target.value as Right })}>
          {(Object.keys(RIGHT_NAMES) as Right[]).map((right) => <option key={right} value={right}>{RIGHT_NAMES[right]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Layer</span>
        <select value={draft.layer} onChange={(event) => form.setDraft({ ...draft, layer: event.target.value as AclLayer })}>
          {(Object.keys(LAYER_TEXT) as AclLayer[]).map((layer) => <option key={layer} value={layer}>{LAYER_TEXT[layer]}</option>)}
        </select>
      </label>
      {draft.trustee && state.objects[draft.trustee]?.objectClass === 'user' && <p className="warning">Careful: a direct grant to one person is harder to review than a grant to a group.</p>}
      <div className="actions-row"><button type="button" className="primary" disabled={!addAction} onClick={() => addAction && form.apply([addAction])}>Add entry</button></div>
    </fieldset>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
