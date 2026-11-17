import type { ReactNode } from 'react'

/**
 * Region slots (D1). `top` is the header, `left` the Work screen's left rail,
 * `upper` the Directory tab, `lower` the PowerShell tab, `evidence` the Evidence tab (T07).
 */
export interface WorkspaceSlots {
  top: ReactNode
  left: ReactNode
  upper: ReactNode
  lower: ReactNode
  evidence?: ReactNode
}

export type WorkTab = 'PowerShell' | 'Directory' | 'Evidence'

const TAB_HELP: Record<WorkTab, string> = {
  PowerShell: 'Type commands in the practice console. Everything here is simulated.',
  Directory: 'Browse and edit directory objects with buttons.',
  Evidence: 'Read the audit log and access checks.',
}

export interface WorkspaceProps {
  slots: WorkspaceSlots
  tab: WorkTab
  onTab(tab: WorkTab): void
  evidenceCount: number
  /** Inbox, Read, or Debrief content. When set, it replaces the two-column Work screen. */
  view?: ReactNode
}

export default function Workspace({ slots, tab, onTab, evidenceCount, view }: WorkspaceProps) {
  const working = view === undefined
  return <div className="shell">
    <div data-region="top">{slots.top}</div>
    {view !== undefined && <main className="screen">{view}</main>}
    {/* The Work screen stays mounted so the terminal keeps its transcript and draft across screens and tabs. */}
    <div className="workspace" hidden={!working}>
      <aside className="rail" data-region="left" aria-label="Ticket and tools">{slots.left}</aside>
      <main className="work-area">
        <div className="tab-row">
          <div className="tabs" role="tablist" aria-label="Work area">
            {(['PowerShell', 'Directory', 'Evidence'] as const).map((name) => <button
              key={name}
              id={`tab-${name}`}
              role="tab"
              aria-selected={tab === name}
              aria-controls={`panel-${name}`}
              onClick={() => onTab(name)}
            >{name === 'Evidence' ? `Evidence (${evidenceCount})` : name}</button>)}
          </div>
          <p className="tab-help">{TAB_HELP[tab]}</p>
        </div>
        <section id="panel-PowerShell" role="tabpanel" aria-labelledby="tab-PowerShell" data-region="lower" hidden={tab !== 'PowerShell'}>{slots.lower}</section>
        <section id="panel-Directory" role="tabpanel" aria-labelledby="tab-Directory" data-region="upper" hidden={tab !== 'Directory'}>{slots.upper}</section>
        <section id="panel-Evidence" role="tabpanel" aria-labelledby="tab-Evidence" hidden={tab !== 'Evidence'}>
          {slots.evidence}
        </section>
      </main>
    </div>
  </div>
}
