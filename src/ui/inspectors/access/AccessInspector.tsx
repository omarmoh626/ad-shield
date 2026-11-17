import { useState } from 'react'
import { buildContext } from '../../../access/token'
import { evaluateAccess } from '../../../access/trace'
import type { AccessLayerTrace, MembershipPath, Right } from '../../../access/types'
import type { DomainState, Guid } from '../../../domain/types'
import { RIGHT_NAMES, shares } from '../../../ps/cmdlets/sim/common'
import { displayName, nameFor, typeLabel } from '../../directory/labels'

const VIA_TEXT = { role: 'through a group (role)', direct: 'through a direct grant to the person', both: 'through a group and a direct grant', none: 'not granted' } as const
const LAYER_TITLE = { share: 'Share layer', file: 'File layer (NTFS)' } as const

/** A membership path in words: "Maya Ali → GG-Pharmacy-Staff → DL-Pharmacy-Share-Read". */
function pathText(state: DomainState, path: MembershipPath): string {
  return path.path.map((guid) => nameFor(state, guid)).join(' → ')
}

function Layer({ state, trace }: { state: DomainState; trace: AccessLayerTrace }) {
  const deciding = trace.entries.find((entry) => entry.applies)
  return <div className="card layer">
    <p className="label">{LAYER_TITLE[trace.layer]}</p>
    <p><strong>{trace.allowed ? 'Allowed' : 'Not allowed'}</strong> · {deciding ? `decided by ${deciding.effect === 'allow' ? 'Allow' : 'Deny'} ${RIGHT_NAMES[deciding.right]} for ${nameFor(state, deciding.trustee)}` : 'no entry applies'}</p>
    <p className="muted hint-line">Entries in evaluation order (explicit Deny, explicit Allow, inherited Deny, inherited Allow). The first that applies decides.</p>
    <ol className="entries">{trace.entries.map((entry, index) => <li key={index} className={entry.applies ? 'applies' : undefined}>
      {entry.effect === 'allow' ? 'Allow' : 'Deny'} {RIGHT_NAMES[entry.right]} · {nameFor(state, entry.trustee)}{entry.inherited ? ' · inherited' : ''} · <em>{entry.applies ? (entry === deciding ? 'applies, decides' : 'applies') : 'does not apply'}</em>
    </li>)}</ol>
  </div>
}

/**
 * Access inspector (read view): pick a principal, a share, and a right; see the membership path,
 * each layer's entries in evaluation order, each layer's result, and the final result.
 * It evaluates a fresh simulated sign-in from current state and never writes state.
 */
export default function AccessInspector({ state, initial }: { state: DomainState; initial?: Guid | null }) {
  const people = Object.values(state.objects).filter((object) => (object.objectClass === 'user' || object.objectClass === 'computer') && object.sid)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
  const all = shares(state)
  const start = initial && people.some((person) => person.guid === initial) ? initial : ''
  const [who, setWho] = useState<Guid | ''>(start)
  const [share, setShare] = useState(all[0]?.id ?? '')
  const [right, setRight] = useState<Right>('read')
  const trace = who && share ? evaluateAccess(state, buildContext(state, who), share, right) : undefined
  const relevant = trace ? trace.paths.filter((path) => trace.layers.some((layer) => layer.entries.some((entry) => entry.applies && entry.trustee === path.trustee))) : []

  return <section className="access-inspector" aria-labelledby="access-title">
    <h2 id="access-title" className="section-title">Access inspector <span className="muted">· simulated</span></h2>
    <p className="muted">This exercise models two layers on each simulated share: share permissions and file (NTFS) permissions. Both must allow. Directory object permissions and Entra access are not modeled here.</p>
    <div className="log-filters">
      <label className="log-field"><span className="label">Who</span>
        <select value={who} onChange={(event) => setWho(event.target.value as Guid | '')}>
          <option value="">Choose a person or computer…</option>
          {people.map((person) => <option key={person.guid} value={person.guid}>{displayName(person)} · {typeLabel(person)}</option>)}
        </select>
      </label>
      <label className="log-field"><span className="label">Share</span>
        <select value={share} onChange={(event) => setShare(event.target.value)}>
          {all.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="log-field"><span className="label">Right</span>
        <select value={right} onChange={(event) => setRight(event.target.value as Right)}>
          {(Object.keys(RIGHT_NAMES) as Right[]).map((name) => <option key={name} value={name}>{RIGHT_NAMES[name]}</option>)}
        </select>
      </label>
    </div>
    {trace && <div className="access-result">
      <p className={trace.allowed ? 'notice' : 'warning'} role="status">
        <strong>Result: {trace.allowed ? 'Allowed' : 'Not allowed'}</strong> · {nameFor(state, who as Guid)} {trace.allowed ? 'can' : 'cannot'} {RIGHT_NAMES[right]} on {state.resources[share]?.name as string} ({VIA_TEXT[trace.via]}). Checked as a fresh simulated sign-in.
      </p>
      <div>
        <p className="label">Membership path</p>
        {relevant.length
          ? <ul className="member-of">{relevant.map((path) => <li key={path.trustee} className="mono">{pathText(state, path)}</li>)}</ul>
          : <p className="muted">No group of {nameFor(state, who as Guid)} has an entry on this share.</p>}
        <details><summary>Every security group in the sign-in ({trace.paths.length})</summary>
          <ul className="member-of">{trace.paths.map((path) => <li key={path.trustee} className="mono">{pathText(state, path)}</li>)}</ul>
        </details>
      </div>
      <div className="cards">{trace.layers.map((layer) => <Layer key={layer.layer} state={state} trace={layer} />)}</div>
    </div>}
  </section>
}
