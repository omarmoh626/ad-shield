import type { Attempt } from '../../tickets/types'
import { describeEvent, labTime } from '../debrief/timeline'

const SOURCE_LABEL = { console: 'PowerShell', gui: 'Directory', system: 'System' } as const

/**
 * Timeline of the current attempt (read view): every audit event added since the checkpoint,
 * oldest first, with where it came from. Console and Directory changes appear together.
 */
export default function AttemptTimeline({ attempt }: { attempt: Attempt }) {
  const floor = Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq))
  const events = attempt.state.events.filter((event) => event.seq > floor)
  return <section className="attempt-timeline" aria-labelledby="attempt-timeline-title">
    <h2 id="attempt-timeline-title" className="section-title">This attempt</h2>
    {events.length
      ? <ol className="timeline">{events.map((event) => <li key={event.seq}>
        <span className="mono muted">{labTime(event.time)}</span> <span className="pill">{SOURCE_LABEL[event.source]}</span> {describeEvent(event, attempt.state)}
        {event.eventId !== undefined && <> <span className="mono chip">{event.eventId}</span></>}
      </li>)}</ol>
      : <p className="muted">Nothing yet. Changes you make in PowerShell or the Directory tab appear here.</p>}
  </section>
}
