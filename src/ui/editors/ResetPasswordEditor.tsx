import { useEffect, useRef } from 'react'
import type { DirObject } from '../../domain/types'
import { passwordVerdict } from '../terminal/Terminal'
import OutcomeView from './Outcome'
import { useGuiForm } from './useGuiForm'
import type { EditorRequest } from './requests'

/**
 * Reset password (simulated). The field is uncontrolled: its characters never enter React state,
 * the store, the draft, or an action. Apply computes the lab policy verdict, clears the field,
 * and sends only the verdict (CONTRACTS s7).
 */
export default function ResetPasswordEditor({ object, request }: { object: DirObject; request?: EditorRequest }) {
  const form = useGuiForm<null>('password', object.guid, () => null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (request?.editor === 'password') field.current?.focus()
  }, [request?.nonce, request?.editor])

  const submit = () => {
    const input = field.current
    if (!input || !input.value) return
    const policy = passwordVerdict(input.value)
    input.value = ''
    form.apply([{ type: 'user.resetPassword', target: object.guid, credential: { policy } }])
  }
  return <form className="editor" aria-label="Reset password" autoComplete="off" onSubmit={(event) => { event.preventDefault(); submit() }}>
    <p className="label">Reset password · simulated</p>
    <label className="field">
      <span>New password (simulated)</span>
      <input ref={field} id="editor-password" type="password" autoComplete="new-password" />
    </label>
    <p className="muted hint-line">Lab rule: at least 12 characters with an upper-case letter, a lower-case letter, and a digit. The lab keeps only whether it passed, never the characters.</p>
    <div className="actions-row"><button type="submit" className="primary">Reset password</button></div>
    <OutcomeView outcome={form.outcome} onReview={form.review} onDiscard={form.discard} />
  </form>
}
