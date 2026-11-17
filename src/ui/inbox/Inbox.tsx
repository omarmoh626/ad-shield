import type { CampaignState } from '../../tickets/types'
import { getTicket } from '../../tickets/cases'
import { actions } from '../store'
import CheatSheet, { cheatSheetFor } from '../debrief/CheatSheet'

export interface InboxRow { id: string; title: string; sender: string; priority: string; status: 'Active' | 'Queued' | 'Done'; seed: number }

/** Inbox rows from campaign state only. Building a fixture to read its request never changes state. */
export function inboxRows(campaign: CampaignState): InboxRow[] {
  return campaign.queue.flatMap((id) => {
    const ticket = getTicket(id)
    if (!ticket) return []
    const active = campaign.active?.id === id ? campaign.active : undefined
    const seed = active?.seed ?? ticket.seeds[0]!
    const request = ticket.build(seed).request
    const status = active ? 'Active' : campaign.completed.includes(id) ? 'Done' : 'Queued'
    return [{ id, title: request.title, sender: request.sender, priority: request.priority, status, seed }]
  })
}

/** DESIGN s4 Inbox. Queued cases open as read-only previews. */
export default function Inbox({ campaign }: { campaign: CampaignState }) {
  const rows = inboxRows(campaign)
  return <article className="inbox" aria-labelledby="inbox-title">
    <p className="meta"><span className="case-chip">corp.contoso.local · simulated</span></p>
    <h1 id="inbox-title">Inbox</h1>
    <ul className="inbox-list">
      {rows.map((row) => <li key={row.id} className="inbox-row">
        <span className="case-chip">{row.id}</span>
        <span className="inbox-title">{row.title}<span className="muted"> · {row.sender} · Priority: {row.priority}</span></span>
        <span className="pill">{row.status}</span>
        {row.status === 'Active' && <button type="button" onClick={actions.openActive}>Open</button>}
        {row.status === 'Queued' && <button type="button" onClick={() => actions.openPreview(row.id)}>Preview <span className="visually-hidden">{row.id}</span> · read-only</button>}
        {row.status === 'Done' && !campaign.active && <button type="button" onClick={() => actions.startVariation(row.id, row.seed)}>Try again, new details</button>}
      </li>)}
    </ul>
    {!rows.some((row) => row.status !== 'Done') && <p className="muted">No open tickets. More arrive as the shift progresses.</p>}
    <CheatSheet entries={cheatSheetFor(campaign)} />
  </article>
}
