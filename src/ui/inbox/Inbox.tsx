import type { CampaignState } from '../../tickets/types'
import { TICKETS, getTicket } from '../../tickets/cases'
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

/**
 * DECISIONS D12: once every built case is complete, say plainly which tiers are not built yet.
 * Derived from the catalog, so it never appears while a built ticket is unfinished (P2 audit F1).
 */
export function endOfSliceNotice(campaign: CampaignState, catalog: readonly { id: string; tier: 1 | 2 | 3 }[] = TICKETS): string | undefined {
  if (!catalog.length || !catalog.every((ticket) => campaign.completed.includes(ticket.id))) return undefined
  const missing = ([1, 2, 3] as const).filter((tier) => !catalog.some((ticket) => ticket.tier === tier))
  if (!missing.length) return undefined
  const names = missing.map((tier) => `Tier ${tier}`).join(' and ')
  return `You have completed every case built so far. ${names} ${missing.length > 1 ? 'are' : 'is'} not built yet in this version. You can replay any case with new details.`
}

/** DESIGN s4 Inbox. Queued cases open as read-only previews. */
export default function Inbox({ campaign }: { campaign: CampaignState }) {
  const rows = inboxRows(campaign)
  const notice = endOfSliceNotice(campaign)
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
    {notice ? <p className="slot" role="status">{notice}</p> : !rows.some((row) => row.status !== 'Done') && <p className="muted">No open tickets. More arrive as the shift progresses.</p>}
    <CheatSheet entries={cheatSheetFor(campaign)} />
  </article>
}
