import { useEffect, useRef } from 'react'
import type { DirObject, DomainState } from '../../domain/types'
import { deriveDn } from '../../domain/dn'
import type { Action } from '../../engine/types'
import { canonicalAttrs } from '../equivalent/toConsoleEquivalent'
import { passwordVerdict } from '../terminal/Terminal'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

interface NewUserDraft { name: string; sam: string; given: string; surname: string; enabled: boolean }

/**
 * New user in the selected OU or container. The password field is uncontrolled and simulated:
 * only its policy verdict leaves it, and Apply clears it. The draft never holds it.
 */
export default function NewUserEditor({ state, container, request }: { state: DomainState; container: DirObject; request?: EditorRequest }) {
  const form = useGuiForm<NewUserDraft>('newUser', container.guid, () => ({ name: '', sam: '', given: '', surname: '', enabled: true }))
  const nameField = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  useEffect(() => { if (request?.editor === 'newUser') nameField.current?.focus() }, [request?.nonce, request?.editor])
  const { draft } = form
  const text = (key: keyof Omit<NewUserDraft, 'enabled'>, label: string, mono = false) => <label className="field">
    <span>{label}</span>
    <input ref={key === 'name' ? nameField : undefined} id={key === 'name' ? 'editor-newUser' : undefined} className={mono ? 'mono' : undefined} value={draft[key]} onChange={(event) => form.setDraft({ ...draft, [key]: event.target.value })} />
  </label>

  const submit = () => {
    const name = draft.name.trim()
    const sam = draft.sam.trim()
    if (!name || !sam) return
    const typed = password.current?.value ?? ''
    const policy = typed ? passwordVerdict(typed) : undefined
    if (password.current) password.current.value = ''
    const attrs = canonicalAttrs('New-ADUser', { ...(draft.given.trim() ? { givenName: draft.given.trim() } : {}), ...(draft.surname.trim() ? { sn: draft.surname.trim() } : {}) })
    const action: Action = { type: 'user.create', name, samAccountName: sam, parent: container.guid, attrs, enabled: draft.enabled, ...(policy ? { credential: { policy } } : {}) }
    form.apply([action])
  }

  return <form className="editor" aria-label="New user" autoComplete="off" onSubmit={(event) => { event.preventDefault(); submit() }}>
    <p className="label">New user · simulated</p>
    <p className="muted hint-line">In <span className="mono">{deriveDn(state, container.guid)}</span></p>
    {text('name', 'Full name')}
    {text('sam', 'Sign-in name (sAMAccountName)', true)}
    {text('given', 'First name')}
    {text('surname', 'Last name')}
    <label className="field">
      <span>Initial password (simulated, optional)</span>
      <input ref={password} type="password" autoComplete="new-password" />
    </label>
    <label className="choice">
      <input type="checkbox" checked={draft.enabled} onChange={(event) => form.setDraft({ ...draft, enabled: event.target.checked })} />
      <span>Turn on the account (needs a valid simulated password)</span>
    </label>
    <div className="actions-row"><button type="submit" className="primary" disabled={!draft.name.trim() || !draft.sam.trim()}>Create</button></div>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
