import type { Attempt } from '../../tickets/types'
import { attemptDiff } from './diff'

/** Before and after for the current attempt (Evidence tab): what is different from the checkpoint. */
export default function AttemptDiff({ attempt }: { attempt: Attempt }) {
  const rows = attemptDiff(attempt.checkpoint, attempt.state)
  return <section className="attempt-diff" aria-labelledby="attempt-diff-title">
    <h2 id="attempt-diff-title" className="section-title">Before and after <span className="muted">· this attempt</span></h2>
    {rows.length
      ? <table className="diff-table">
        <thead><tr><th scope="col">Object</th><th scope="col">What</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}><td>{row.subject}</td><td className="mono">{row.what}</td><td className="mono">{row.before}</td><td className="mono">{row.after}</td></tr>)}</tbody>
      </table>
      : <p className="muted">Nothing has changed since the case started.</p>}
  </section>
}
