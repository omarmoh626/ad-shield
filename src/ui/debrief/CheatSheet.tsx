import { useState } from 'react'
import type { CampaignState } from '../../tickets/types'
import { getTicket } from '../../tickets/cases'

export interface CheatSheetEntry { ticketId: string; command: string }

/**
 * The cheat sheet: one reusable command per completed case, taken from each case's debrief
 * of the attempt in campaign history. History survives Reset this attempt, so the sheet does too.
 */
export function cheatSheetFor(campaign: CampaignState): CheatSheetEntry[] {
  const seen = new Set<string>()
  return campaign.history.flatMap((attempt) => {
    const fixture = getTicket(attempt.id)?.build(attempt.seed)
    const command = fixture?.debrief(attempt).reusableCommand
    if (!command || seen.has(command)) return []
    seen.add(command)
    return [{ ticketId: attempt.id, command }]
  })
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false)) }}>
    {copied ? 'Copied' : label}
  </button>
}

export default function CheatSheet({ entries }: { entries: CheatSheetEntry[] }) {
  return <section className="card" aria-labelledby="cheat-title">
    <h2 id="cheat-title" className="label">Your cheat sheet</h2>
    {entries.length === 0
      ? <p className="muted">Finish a case to save its key command here.</p>
      : <ul className="cheat">{entries.map((entry) => <li key={entry.command}><span className="case-chip">{entry.ticketId}</span> <code>{entry.command}</code> <CopyButton text={entry.command} /></li>)}</ul>}
  </section>
}
