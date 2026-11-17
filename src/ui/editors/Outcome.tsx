import type { AttrValue } from '../../domain/types'
import EquivalentBox from '../equivalent/EquivalentBox'
import { actions } from '../store'
import type { Outcome, Saved } from './useGuiForm'

const show = (value: AttrValue | undefined): string => {
  if (value === undefined || value === null || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return Array.isArray(value) ? value.join(', ') : String(value)
}

const ERROR_LEAD: Record<string, string> = {
  denied: 'Not allowed:',
  notFound: 'Not found:',
  conflict: 'Conflict:',
  invalid: 'Not changed:',
  unsupported: 'Not supported:',
}

export interface OutcomeViewProps {
  outcome: Outcome | undefined
  /** Stale only: re-base the form on the current state and keep the draft. */
  onReview(): void
  /** Stale only: drop the draft. */
  onDiscard(): void
}

function SavedPart({ saved }: { saved: Saved }) {
  const ids = saved.events.map((event) => event.eventId).filter((id): id is number => id !== undefined)
  return <div className="outcome">
    <p className="notice"><strong>Saved before the failure · simulated.</strong> These changes stay saved, as they would in the console{ids.length ? <>: event {ids.map((id, index) => <span key={index}>{index ? ', ' : ''}<span className="mono chip">{id}</span></span>)}</> : ''}. Apply again sends only what is left.</p>
    <EquivalentBox command={saved.equivalent} />
  </div>
}

/** Success banner, stale-save warning, or the pipeline's error, shown as returned (never swallowed). */
export default function OutcomeView({ outcome, onReview, onDiscard }: OutcomeViewProps) {
  if (!outcome) return null
  if (outcome.kind === 'ok') {
    const ids = outcome.events.map((event) => event.eventId).filter((id): id is number => id !== undefined)
    return <div className="outcome" role="status">
      <div className="notice">
        <strong>Saved · simulated.</strong>{' '}
        {ids.length ? <>Recorded event {ids.map((id, index) => <span key={index}>{index ? ', ' : ''}<span className="mono chip">{id}</span></span>)}.</> : 'No Windows event for this change.'}{' '}
        <button type="button" className="link" onClick={() => actions.setTab('Evidence')}>See before and after</button>
      </div>
      {outcome.warnings.map((warning) => <p key={warning.code} className="warning">Careful: {warning.message}</p>)}
      <EquivalentBox command={outcome.equivalent} />
    </div>
  }
  if (outcome.kind === 'stale') {
    return <div className="warning" role="alert">
      <strong>Not saved: an object this change touches changed after you opened the form.</strong>
      <p>Your draft is still here. Check what changed, then apply again or discard the draft.</p>
      {outcome.objects.map((object) => <div key={object.guid} className="stale-object">
        <p><strong>{object.name}</strong> changed:</p>
        <ul className="stale-list">
          {object.changes.map((change) => <li key={change.key}><code>{change.key}</code>: {show(change.before)} → {show(change.after)}</li>)}
          {object.moved && <li>It moved to another container.</li>}
          {object.membership && <li>Its group memberships changed.</li>}
          {!object.changes.length && !object.moved && !object.membership && <li>It changed in a way this form does not show.</li>}
        </ul>
      </div>)}
      {outcome.saved && <SavedPart saved={outcome.saved} />}
      <div className="actions-row">
        <button type="button" onClick={onReview}>Review with the new values</button>
        <button type="button" className="quiet" onClick={onDiscard}>Discard my draft</button>
      </div>
    </div>
  }
  return <div className="warning" role="alert">
    <strong>Error: {ERROR_LEAD[outcome.error ?? ''] ?? 'Not changed:'}</strong> {outcome.message}
    {outcome.saved && <SavedPart saved={outcome.saved} />}
  </div>
}
