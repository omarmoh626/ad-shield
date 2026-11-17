import { useEffect, useRef, useState } from 'react'
import type { Attempt, CaseFixture, PredicateStatus } from '../../tickets/types'
import { actions, useStore } from '../store'

const STATUS_TEXT = { met: 'Done', unmet: 'Not yet', waiting: 'Waiting' } as const

/** Text icon per status. Status is never color alone (DESIGN s1.5). */
function StatusIcon({ status }: { status: PredicateStatus['status'] }) {
  if (status === 'met') return <svg aria-hidden="true" className="icon done" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m5 12 5 5 9-10" /></svg>
  if (status === 'waiting') return <svg aria-hidden="true" className="icon waiting" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  return <svg aria-hidden="true" className="icon notyet" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
}

/**
 * A row action for checks the learner confirms by doing something, such as a simulated fresh sign-in
 * (SPEC "A complete first ticket"). It stays available after the check is met, so the learner can verify. Runs only on click.
 */
function rowAction(predicate: PredicateStatus, fixture: CaseFixture, attempt: Attempt): { label: string; command: string } | undefined {
  if (predicate.id !== 'signin') return undefined
  const workstation = fixture.ids.workstation ? attempt.state.objects[fixture.ids.workstation]?.rdn : undefined
  if (!workstation) return undefined
  const first = fixture.request.who.person.split(/[ ,]/)[0]
  return { label: `Test ${first}'s sign-in · simulated`, command: `Test-SimSignIn -Identity ${fixture.request.who.account} -ComputerName ${workstation}` }
}

export function progressText(predicates: PredicateStatus[]) {
  return `${predicates.filter((p) => p.status === 'met').length} of ${predicates.length} done`
}

/** DESIGN s6 Work: "What done looks like" plus the Finish case button. Grades come only from the engine's predicates. */
export default function Checklist({ attempt, fixture }: { attempt: Attempt; fixture: CaseFixture }) {
  const predicates = attempt.predicates
  const previous = useRef(new Map(predicates.map((p) => [p.id, p.status])))
  const [justDone, setJustDone] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const refusal = useStore((ui) => ui.closeRefusal)
  useEffect(() => {
    const fresh = predicates.filter((p) => p.status === 'met' && previous.current.get(p.id) !== 'met').map((p) => p.id)
    previous.current = new Map(predicates.map((p) => [p.id, p.status]))
    setJustDone(new Set(fresh))
  }, [predicates])
  const unmet = predicates.filter((p) => p.status !== 'met')
  const toggle = (id: string) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  return <section className="card checklist" aria-labelledby="done-title">
    <h2 id="done-title" className="label">What done looks like</h2>
    <p className="muted" aria-live="polite">{progressText(predicates)}</p>
    <ul className="checks">
      {predicates.map((predicate) => {
        const action = rowAction(predicate, fixture, attempt)
        const status = predicate.status === 'met' && justDone.has(predicate.id) ? 'Done just now' : STATUS_TEXT[predicate.status]
        return <li key={predicate.id} className={`check ${predicate.status}`}>
          <button type="button" className="check-row" aria-expanded={open.has(predicate.id)} onClick={() => toggle(predicate.id)}>
            <StatusIcon status={predicate.status} />
            <span className="check-label">{predicate.label}</span>
            <span className="check-status">{status}</span>
          </button>
          {open.has(predicate.id) && <p className="observed">Now: {predicate.observed}. Needed: {predicate.required}.</p>}
          {action && <button type="button" onClick={() => actions.terminal.runLine(action.command)}>{action.label}</button>}
        </li>
      })}
    </ul>
    <button type="button" className="primary" disabled={unmet.length > 0} aria-describedby="finish-why"
      onClick={() => { actions.closeCase() }}>
      {unmet.length > 0 ? `Finish case · ${unmet.length} to go` : 'Finish case'}
    </button>
    <div id="finish-why" className="muted">
      {unmet.length > 0 && <>Still to do: {unmet.map((p) => p.label).join('; ')}.</>}
      {refusal && <ul>{refusal.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>
  </section>
}
