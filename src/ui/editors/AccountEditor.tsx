import { useEffect, useRef } from 'react'
import type { DirObject } from '../../domain/types'
import type { Action } from '../../engine/types'
import { canonicalAttrs } from '../equivalent/toConsoleEquivalent'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

interface AccountDraft { unlock: boolean; enabled: boolean; mustChange: boolean }

const mustChangeOf = (object: DirObject) => object.attrs.changePasswordAtLogon === true

/**
 * Account options editor (ADUC Account tab): unlock, turn on or off, must change password at
 * next sign-in. Changes wait in a draft until Apply. The draft keeps only these three choices.
 */
export default function AccountEditor({ object, request }: { object: DirObject; request?: EditorRequest }) {
  const locked = object.attrs.lockedOut === true
  const enabled = object.attrs.enabled !== false
  const initial = (): AccountDraft => ({ unlock: false, enabled, mustChange: mustChangeOf(object) })
  const form = useGuiForm<AccountDraft>('account', object.guid, initial)
  const { draft } = form
  const applyButton = useRef<HTMLButtonElement>(null)
  const unlockBox = useRef<HTMLInputElement>(null)

  // A menu item or quick action presets the draft and moves focus here; Apply stays explicit.
  useEffect(() => {
    if (!request || request.editor !== 'account') return
    const next = { ...form.draft }
    if (request.item === 'unlock') next.unlock = true
    if (request.item === 'enable') next.enabled = true
    if (request.item === 'disable') next.enabled = false
    if (request.item === 'mustChange') next.mustChange = true
    form.setDraft(next)
    ;(request.item === 'unlock' ? unlockBox.current : applyButton.current)?.focus()
    // Only a new request presets the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce])

  const list: Action[] = []
  if (draft.unlock && locked) list.push({ type: 'user.unlock', target: object.guid })
  if (draft.enabled !== enabled) list.push({ type: 'user.setEnabled', target: object.guid, enabled: draft.enabled })
  if (draft.mustChange !== mustChangeOf(object)) list.push({ type: 'user.setAttrs', target: object.guid, attrs: canonicalAttrs('Set-ADUser', { changePasswordAtLogon: draft.mustChange }) })

  return <form className="editor" aria-label="Account options" onSubmit={(event) => { event.preventDefault(); form.apply(list) }}>
    <p className="label">Change account options</p>
    <label className="choice">
      <input ref={unlockBox} id="editor-unlock" type="checkbox" checked={draft.unlock && locked} disabled={!locked} onChange={(event) => form.setDraft({ ...draft, unlock: event.target.checked })} />
      <span>Unlock account</span>
    </label>
    <p className="muted hint-line">{locked ? 'This account is locked out (LockedOut True).' : 'This account is not locked out.'}</p>
    <label className="choice">
      <input type="checkbox" checked={draft.enabled} onChange={(event) => form.setDraft({ ...draft, enabled: event.target.checked })} />
      <span>Account turned on (Enabled)</span>
    </label>
    <label className="choice">
      <input type="checkbox" checked={draft.mustChange} onChange={(event) => form.setDraft({ ...draft, mustChange: event.target.checked })} />
      <span>User must change password at next sign-in</span>
    </label>
    <div className="actions-row">
      <button ref={applyButton} type="submit" className="primary" disabled={list.length === 0}>Apply</button>
      {list.length > 0 && <button type="button" className="quiet" onClick={form.discard}>Cancel</button>}
    </div>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
