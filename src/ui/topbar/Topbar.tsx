import { useState } from 'react'

export interface TopbarProps {
  caseId: string
  title: string
  screen: string
  remaining: number
  paused: boolean
  rank: string
  posture: number
  failedChecks: string[]
  activeIncidentCount: number
  saveStatus: string
  onPause(): void
  onAdvance(): void
}

export default function Topbar(props: TopbarProps) {
  const [progressOpen, setProgressOpen] = useState(false)
  return <header className="topbar">
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5l-8-3Z" /></svg>
    <span className="brand">AD Shield</span><span className="case-chip">{props.caseId}</span><span className="placeholder">{props.title}</span>
    <nav className="steps" aria-label="Case progress">{['Read', 'Investigate', 'Fix', 'Verify'].map((step, index) => <span key={step} className="step" aria-current={(props.screen === 'Read' ? index === 0 : props.screen === 'Work' ? index === 1 : false) ? 'step' : undefined}>{step}</span>)}</nav>
    <div className="top-controls"><span className="mono" aria-label="SLA remaining">SLA {String(Math.floor(props.remaining / 3600000)).padStart(2, '0')}:{String(Math.floor(props.remaining / 60000) % 60).padStart(2, '0')}:{String(Math.floor(props.remaining / 1000) % 60).padStart(2, '0')}</span>
      <button onClick={props.onPause} aria-pressed={props.paused}>{props.paused ? 'Resume' : 'Pause'}</button><button onClick={props.onAdvance}>Advance lab time</button>
      <button aria-expanded={progressOpen} onClick={() => setProgressOpen(!progressOpen)}>{props.rank} · {props.posture}%</button><span role="status">{props.saveStatus}</span>
    </div>
    {progressOpen && <aside className="slot" aria-label="Progress details"><strong>Rank</strong><div>{props.rank}</div><strong>Posture</strong><div>{props.posture}%</div><strong>Failed checks</strong><div>{props.failedChecks.join(', ') || 'None'}</div><strong>Active incidents</strong><div>{props.activeIncidentCount}</div></aside>}
  </header>
}
