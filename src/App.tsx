import { useCallback, useEffect, useMemo } from 'react'
import Terminal, { type TerminalHandle } from './ui/terminal/Terminal'
import Workspace, { type WorkTab } from './ui/layout/Workspace'
import Topbar from './ui/topbar/Topbar'
import ToastRegion from './ui/toast/ToastRegion'
import { actions, useStore } from './ui/store'
import { scoreCampaign } from './tickets/scoring'
import { TICKETS, getTicket } from './tickets/cases'

const NARROW_TABS = ['Ticket', 'PowerShell', 'Directory', 'Evidence'] as const

export default function App() {
  const ui = useStore((value) => value)
  const active = ui.campaign.active
  const fixture = useMemo(() => active ? getTicket(active.id)?.build(active.seed) : undefined, [active?.id, active?.seed])
  const request = fixture?.request

  // D4: the SLA countdown is a real timer in src/ui. It never dispatches.
  useEffect(() => {
    if (ui.paused) return
    const timer = window.setInterval(() => actions.tickSla(1_000), 1_000)
    return () => window.clearInterval(timer)
  }, [ui.paused])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => actions.handleStorageEvent(event.key, event.newValue)
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const terminalRef = useCallback((instance: TerminalHandle | null) => { actions.terminal.register(instance ?? undefined) }, [])

  const score = scoreCampaign(TICKETS.filter((ticket) => ui.campaign.completed.includes(ticket.id)), [...TICKETS], [...ui.campaign.history, ...(active ? [active] : [])], 0)
  const selectNarrow = (tab: typeof NARROW_TABS[number]) => {
    if (tab === 'Ticket') actions.setScreen('Read')
    else { actions.setScreen('Work'); actions.setTab(tab) }
  }
  const narrowSelected = (tab: typeof NARROW_TABS[number]) => tab === 'Ticket' ? ui.screen === 'Read' : ui.screen === 'Work' && ui.tab === tab

  const top = <>
    <Topbar
      caseId={active?.id ?? 'corp.contoso.local · simulated'}
      title={request?.title ?? ''}
      screen={ui.screen}
      remaining={ui.sla.remainingMs}
      paused={ui.paused}
      rank={score.rank}
      posture={score.posture}
      failedChecks={score.failedChecks}
      activeIncidentCount={score.activeIncidentCount}
      saveStatus={ui.saveStatus}
      onPause={actions.togglePaused}
      onAdvance={() => actions.advanceTime(60_000)}
    />
    <nav className="mobile-tabs" aria-label="Workspace tabs">
      {NARROW_TABS.map((tab) => <button key={tab} aria-pressed={narrowSelected(tab)} onClick={() => selectNarrow(tab)}>{tab}</button>)}
    </nav>
  </>

  // P2 fills the left rail (goal, checklist, hints) and the Inbox, Read, and Debrief screens.
  const left = <>
    <div className="goal"><strong>Your goal</strong><p>{request?.goal ?? 'Open the next simulated case.'}</p></div>
    <button onClick={() => actions.setScreen('Read')}>Re-read the ticket</button>
  </>
  const placeholder = (name: string) => <article className="work-card placeholder"><h1>{name}</h1><p>This screen is built in T06 Part 2.</p><button onClick={() => actions.setScreen('Work')}>Back to work</button></article>
  const view = ui.screen === 'Work' ? undefined : placeholder(ui.screen)

  return <>
    <Workspace
      slots={{ top, left, upper: <div className="work-card placeholder">Directory view is built in T07.</div>, lower: <Terminal ref={terminalRef} /> }}
      tab={ui.tab}
      onTab={(tab: WorkTab) => actions.setTab(tab)}
      evidenceCount={active?.state.events.length ?? 0}
      view={view}
    />
    <ToastRegion message={[...ui.notices, ui.toast].filter(Boolean).join(' ')} />
  </>
}
