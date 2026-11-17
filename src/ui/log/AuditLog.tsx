import { useMemo, useState } from 'react'
import type { DomainState } from '../../domain/types'
import { describeEvent, labTime } from '../debrief/timeline'
import { useWindow } from '../directory/windowed'
import { EMPTY_FILTER, ORIGIN_LABEL, filterEvents, type LogFilter, type OriginFilter } from './logFilter'

export const LOG_ROW_HEIGHT = 64
export const LOG_VIEWPORT = 384

const SOURCE_LABEL = { console: 'PowerShell', gui: 'Directory', system: 'System' } as const

/** Filterable audit log (read view). It renders only the visible rows plus a buffer and never writes state. */
export default function AuditLog({ state }: { state: DomainState }) {
  const [filter, setFilter] = useState<LogFilter>(EMPTY_FILTER)
  const rows = useMemo(() => filterEvents(state, filter), [state, filter])
  const { slice, onScroll } = useWindow(rows.length, LOG_ROW_HEIGHT, LOG_VIEWPORT)
  const field = (key: Exclude<keyof LogFilter, 'origin'>, label: string, mono = false) => <label className="log-field">
    <span className="label">{label}</span>
    <input className={mono ? 'mono' : undefined} value={filter[key]} onChange={(event) => setFilter({ ...filter, [key]: event.target.value })} />
  </label>

  return <section className="audit-log" aria-labelledby="audit-log-title">
    <h2 id="audit-log-title" className="section-title">Audit log <span className="muted">· simulated</span></h2>
    <div className="log-filters" role="search" aria-label="Filter the audit log">
      {field('text', 'Text')}
      <label className="log-field">
        <span className="label">Source</span>
        <select value={filter.origin} onChange={(event) => setFilter({ ...filter, origin: event.target.value as OriginFilter })}>
          <option value="all">All sources</option>
          {(['windows', 'entra', 'simulator'] as const).map((origin) => <option key={origin} value={origin}>{ORIGIN_LABEL[origin]}</option>)}
        </select>
      </label>
      {field('eventId', 'Event ID', true)}
      {field('host', 'Host', true)}
      {field('actor', 'Actor')}
      {field('target', 'Target')}
      <button type="button" className="quiet" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
    </div>
    <p className="muted" aria-live="polite">{rows.length} of {state.events.length} events, newest first</p>
    <div className="log-list" role="list" aria-label="Audit events" tabIndex={0} onScroll={onScroll} style={{ height: LOG_VIEWPORT }}>
      <div style={{ height: slice.before }} aria-hidden="true" />
      {rows.slice(slice.start, slice.end).map((event) => <div key={event.seq} role="listitem" className={`log-row origin-${event.origin}`} style={{ height: LOG_ROW_HEIGHT }}>
        <div className="log-meta">
          <span className="origin-tag">{ORIGIN_LABEL[event.origin]}</span>
          {event.eventId !== undefined && <span className="mono chip">{event.eventId}</span>}
          {event.host && <span className="mono">{event.host}</span>}
          <span className="mono muted">{labTime(event.time)}</span>
          <span className="muted">via {SOURCE_LABEL[event.source]}</span>
        </div>
        <p className="log-text">{describeEvent(event, state)}</p>
      </div>)}
      <div style={{ height: slice.after }} aria-hidden="true" />
      {rows.length === 0 && <p className="muted">No events match these filters.</p>}
    </div>
  </section>
}
