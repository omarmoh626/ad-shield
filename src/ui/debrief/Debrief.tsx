import { useState } from 'react'
import type { CampaignState, CaseFixture } from '../../tickets/types'
import { TICKETS } from '../../tickets/cases'
import type { DebriefView } from '../store'
import { actions } from '../store'
import { Glossed } from '../glossary/Glossed'
import { markFirstUses, termsFor } from '../glossary/terms'
import { cheatSheetFor, CopyButton } from './CheatSheet'
import { timelineFor } from './timeline'

/** The transfer question with feedback. Feedback text is the fixture's, so it points where the case author meant. */
export function TransferQuestion({ fixture }: { fixture: CaseFixture }) {
  const transfer = fixture.transfer
  const [choice, setChoice] = useState<string | undefined>()
  const [checked, setChecked] = useState(false)
  const [feedback] = markFirstUses([transfer.feedback], termsFor(fixture.request.glossary))
  return <section className="card" aria-labelledby="quick-title">
    <h2 id="quick-title" className="label">Quick check</h2>
    <fieldset>
      <legend>{transfer.question}</legend>
      {(transfer.choices ?? []).map((option) => <label key={option} className="choice">
        <input type="radio" name="transfer" value={option} checked={choice === option} onChange={() => { setChoice(option); setChecked(false) }} /> {option}
      </label>)}
    </fieldset>
    <button type="button" disabled={transfer.choices !== undefined && choice === undefined} onClick={() => setChecked(true)}>{transfer.choices ? 'Check my answer' : 'Show the answer'}</button>
    {checked && <div className="meaning" role="status">
      <strong>{transfer.choices ? (choice === transfer.answer ? 'Right.' : `Not quite. The answer is: ${transfer.answer}.`) : `Answer: ${transfer.answer}.`}</strong>
      <p><Glossed segments={feedback!} /></p>
    </div>}
  </section>
}

/** DESIGN s6 Debrief (mockup D). Built from the closed attempt's history and the fixture. */
export default function Debrief({ view, fixture, campaign }: { view: DebriefView; fixture: CaseFixture; campaign: CampaignState }) {
  const { attempt, firstTime } = view
  const debrief = fixture.debrief(attempt)
  const timeline = timelineFor(attempt)
  const tier = TICKETS.filter((ticket) => ticket.tier === (TICKETS.find((t) => t.id === attempt.id)?.tier ?? 1))
  const position = tier.findIndex((ticket) => ticket.id === attempt.id) + 1
  const leftAlone = attempt.predicates.filter((p) => p.kind === 'control' && p.status === 'met')
  const sheet = cheatSheetFor(campaign)
  return <article className="debrief" aria-labelledby="debrief-title">
    <p className="meta">Case {position} of {tier.length} in Tier {tier[0]?.tier ?? 1} · {attempt.replay || !firstTime ? 'replay, not counted' : 'first time solved'}</p>
    <h1 id="debrief-title">{debrief.summary ?? fixture.request.title}</h1>
    <section className="card" aria-labelledby="did-title">
      <h2 id="did-title" className="label">What you did</h2>
      {timeline.length === 0
        ? <p className="muted">No changes were recorded in this attempt.</p>
        : <ol className="timeline">{timeline.map((item, index) => <li key={index}>
          <span className="mono">{item.time}</span> {item.text} {item.eventId !== undefined && <span className="case-chip">Event {item.eventId}</span>}
        </li>)}</ol>}
    </section>
    <section className="card" aria-labelledby="change-title">
      <h2 id="change-title" className="label">The change</h2>
      <p>{debrief.change}</p>
      <h2 className="label">Who gained or lost access</h2>
      <p>{debrief.access}</p>
      <h2 className="label">How it was verified</h2>
      <p>{debrief.verification}</p>
    </section>
    <div className="cards">
      <section className="card" aria-labelledby="alone-title">
        <h2 id="alone-title" className="label">What you left alone</h2>
        {leftAlone.length ? <ul>{leftAlone.map((p) => <li key={p.id}>{p.label}</li>)}</ul> : <p className="muted">No control checks in this case.</p>}
      </section>
      <section className="card" aria-labelledby="saved-title">
        <h2 id="saved-title" className="label">Saved to your cheat sheet</h2>
        <p><code>{debrief.reusableCommand}</code> <CopyButton text={debrief.reusableCommand} /></p>
        {sheet.length > 1 && <p className="muted">Your cheat sheet now has {sheet.length} commands.</p>}
      </section>
    </div>
    <TransferQuestion fixture={fixture} />
    <div className="actions-row">
      <button type="button" className="primary" onClick={actions.nextCase}>Next ticket</button>
      <button type="button" onClick={() => actions.startVariation(attempt.id, attempt.seed)}>Try this case again, new details</button>
    </div>
  </article>
}
