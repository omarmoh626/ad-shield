import React, { useCallback, useEffect, useMemo } from 'react'
import Terminal, { type TerminalHandle } from './ui/terminal/Terminal'
import Workspace, { type WorkTab } from './ui/layout/Workspace'
import Topbar from './ui/topbar/Topbar'
import ToastRegion from './ui/toast/ToastRegion'
import { actions, useStore } from './ui/store'
import { scoreCampaign } from './tickets/scoring'
import { TICKETS, getTicket } from './tickets/cases'
import ReadScreen from './ui/ticket/ReadScreen'
import ResetAttempt from './ui/ticket/ResetAttempt'
import Hints from './ui/hints/Hints'
import Checklist, { progressText } from './ui/criteria/Checklist'
import Debrief from './ui/debrief/Debrief'
import Inbox from './ui/inbox/Inbox'
import DirectoryPanel from './ui/directory/DirectoryPanel'
import EvidencePanel from './ui/log/EvidencePanel'

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
  // Focus the console once it is visible (Start investigating).
  useEffect(() => { if (ui.focusRequest > 0) actions.terminal.focus() }, [ui.focusRequest])
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
    {active && <button type="button" className="narrow-progress" aria-expanded={ui.railOpen} onClick={actions.toggleRail}>{ui.screen === 'Read' ? 'Read' : 'Work'} · {progressText(active.predicates)}</button>}
    <nav className="mobile-tabs" aria-label="Workspace tabs">
      {NARROW_TABS.map((tab) => <button key={tab} aria-pressed={narrowSelected(tab)} onClick={() => selectNarrow(tab)}>{tab}</button>)}
    </nav>
  </>

  // P2 (D6): the left rail and the Inbox, Read, and Debrief screens.
  const left = active && fixture ? <>
    {ui.railOpen && <span className="rail-open" hidden />}
    <div className="goal"><strong>Your goal</strong><p>{fixture.request.goal}</p></div>
    <Checklist attempt={active} fixture={fixture} />
    {/* A new key per case and variant: hints start closed for every ticket. */}
    <Hints key={`${active.id}:${active.seed}:${active.replay ? 'replay' : 'live'}`} fixture={fixture} />
    <button type="button" className="link" onClick={actions.openActive}>Re-read the ticket</button>
    <ResetAttempt />
  </> : <p className="muted">No case is open. Pick one from the inbox.</p>
  const previewTicket = ui.preview ? getTicket(ui.preview) : undefined
  const debriefFixture = ui.debrief ? getTicket(ui.debrief.attempt.id)?.build(ui.debrief.attempt.seed) : undefined
  let view: React.ReactNode = undefined
  if (ui.screen === 'Inbox') view = <Inbox campaign={ui.campaign} />
  else if (ui.screen === 'Read' && previewTicket) view = <ReadScreen fixture={previewTicket.build(previewTicket.seeds[0]!)} readOnly />
  else if (ui.screen === 'Read') view = fixture ? <ReadScreen fixture={fixture} /> : <Inbox campaign={ui.campaign} />
  else if (ui.screen === 'Debrief') view = ui.debrief && debriefFixture ? <Debrief view={ui.debrief} fixture={debriefFixture} campaign={ui.campaign} /> : <Inbox campaign={ui.campaign} />

  return <>
    <Workspace
      slots={{ top, left, upper: <DirectoryPanel />, lower: <Terminal ref={terminalRef} />, evidence: <EvidencePanel /> }}
      tab={ui.tab}
      onTab={(tab: WorkTab) => actions.setTab(tab)}
      evidenceCount={active?.state.events.length ?? 0}
      view={view}
    />
    <ToastRegion message={[...ui.notices, ui.toast].filter(Boolean).join(' ')} />
  </>
}
