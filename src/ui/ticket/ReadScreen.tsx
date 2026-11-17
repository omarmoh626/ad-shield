import type { CaseFixture } from '../../tickets/types'
import { actions } from '../store'
import Feed, { feedFor } from '../feed/Feed'
import { Glossed, GlossaryList } from '../glossary/Glossed'
import { markFirstUses, termsFor } from '../glossary/terms'

export interface ReadScreenProps {
  fixture: CaseFixture
  /** An inbox preview: shows the ticket and changes nothing. */
  readOnly?: boolean
}

/** DESIGN s6 Read (mockup A). Every word comes from the case fixture. */
export default function ReadScreen({ fixture, readOnly = false }: ReadScreenProps) {
  const request = fixture.request
  const terms = termsFor(request.glossary)
  const messages = feedFor(request)
  // First use is counted in reading order, so each term is defined once, where the learner first meets it.
  const texts = [request.story, request.goal, request.alreadyChecked, request.clue.text, request.careful ?? '', fixture.responsibility.outcome, ...messages.map((message) => message.text)]
  const [story, goal, checked, clue, careful, outcome, ...feedSegments] = markFirstUses(texts, terms)
  return <article className="read" aria-labelledby="ticket-title">
    {readOnly && <p className="notice" role="note">Preview · read-only. Opening a preview changes nothing in the simulated domain.</p>}
    <p className="meta">
      <span className="case-chip">{fixture.ticketId}</span>
      <span>New ticket from the {request.sender}</span>
      <span className="pill">Priority: {request.priority}</span>
      <span>SLA {request.sla}</span>
    </p>
    <h1 id="ticket-title">{request.title}</h1>
    <p className="story"><Glossed segments={story!} /></p>
    <div className="goal"><strong>Your goal</strong><p><Glossed segments={goal!} /></p></div>
    <div className="cards">
      <section className="card"><h2 className="label">Who</h2><p>{request.who.person}</p><p>Sign-in name: <code>{request.who.account}</code></p></section>
      <section className="card"><h2 className="label">Already checked</h2><p><Glossed segments={checked!} /></p></section>
      <section className="card"><h2 className="label">Clue</h2><p><Glossed segments={clue!} /></p>{request.clue.eventId !== undefined && <p><span className="case-chip">Event {request.clue.eventId}</span></p>}</section>
    </div>
    {request.careful && <section className="warning"><h2 className="label">Careful</h2><p><Glossed segments={careful!} /></p></section>}
    <section className="card own"><h2 className="label">What you own</h2><p>Account <code>{fixture.responsibility.account}</code>: <Glossed segments={outcome!} /></p></section>
    <GlossaryList terms={terms} />
    <Feed messages={messages} segments={feedSegments} />
    {readOnly
      ? <button type="button" onClick={() => actions.setScreen('Inbox')}>Back to inbox</button>
      : <div className="start"><button type="button" className="primary" onClick={() => actions.startInvestigating()}>Start investigating</button><p className="muted">Stuck? Hints open one level at a time, whenever you want.</p></div>}
  </article>
}
