import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { DirObject, DomainState, Guid } from '../../domain/types'
import { getDn } from '../../domain/graph'
import { labTime } from '../debrief/timeline'
import { displayName, groupKind, signInName, statusLabel, typeLabel } from '../directory/labels'

const TABS = ['General', 'Account', 'Groups'] as const
type PropertiesTab = typeof TABS[number]
const ACCOUNT_CLASSES = new Set(['user', 'computer', 'serviceAccount'])

export interface ObjectPropertiesProps {
  state: DomainState
  guid: Guid | null
}

/** Primary group: the group whose SID ends with the object's primaryGroupID RID. It is not a membership row (CONTRACTS s4). */
export function primaryGroupOf(state: DomainState, object: DirObject): DirObject | undefined {
  const rid = object.attrs.primaryGroupID
  if (typeof rid !== 'number') return undefined
  return Object.values(state.objects).find((candidate) => candidate.objectClass === 'group' && candidate.sid?.endsWith(`-${rid}`))
}

/** Direct groups only, from the member-to-groups index, sorted by name. */
export function directGroupsOf(state: DomainState, guid: Guid): DirObject[] {
  return (state.indexes.groupsByMember[guid] ?? []).flatMap((id) => state.objects[id] ? [state.objects[id]] : [])
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
}

const text = (value: unknown): string | undefined => typeof value === 'string' && value ? value : undefined

function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return <><dt>{label}</dt><dd className={mono ? 'mono' : undefined}>{children}</dd></>
}

function General({ state, object }: { state: DomainState; object: DirObject }) {
  const a = object.attrs
  return <dl className="props">
    <Row label="Name">{displayName(object)}</Row>
    <Row label="Type">{typeLabel(object)}{groupKind(object) ? ` · ${groupKind(object)}` : ''}</Row>
    {text(a.title) && <Row label="Job title">{text(a.title)}</Row>}
    {text(a.department) && <Row label="Department">{text(a.department)}</Row>}
    {text(a.description) && <Row label="Description">{text(a.description)}</Row>}
    {text(a.dNSHostName) && <Row label="Host name" mono>{text(a.dNSHostName)}</Row>}
    {text(a.operatingSystem) && <Row label="Operating system">{text(a.operatingSystem)}</Row>}
    <Row label="Distinguished name" mono>{getDn(state, object.guid)}</Row>
  </dl>
}

function Account({ object }: { object: DirObject }) {
  if (!ACCOUNT_CLASSES.has(object.objectClass)) return <p className="muted">This {typeLabel(object)} has no sign-in account.</p>
  const a = object.attrs
  const locked = a.lockedOut === true
  const mustChange = a.pwdLastSet === 0
  return <dl className="props">
    <Row label="Status">{statusLabel(object)}</Row>
    <Row label="Account turned on">{a.enabled === false ? 'No' : 'Yes'} (<code>Enabled {a.enabled === false ? 'False' : 'True'}</code>)</Row>
    <Row label="Locked out">{locked ? 'Yes' : 'No'} (<code>LockedOut {locked ? 'True' : 'False'}</code>)</Row>
    {typeof a.badPwdCount === 'number' && <Row label="Wrong passwords in a row">{a.badPwdCount}</Row>}
    {typeof a.pwdLastSet === 'number' && <Row label="Password last set">{mustChange ? 'Never' : `${labTime(a.pwdLastSet)} lab time`}</Row>}
    <Row label="Must change password at next sign-in">{mustChange ? 'Yes' : 'No'}</Row>
    {text(a.userPrincipalName) && <Row label="Sign-in name (UPN)" mono>{text(a.userPrincipalName)}</Row>}
    {signInName(object) && <Row label="Pre-Windows 2000 name" mono>{signInName(object)}</Row>}
  </dl>
}

function Groups({ state, object }: { state: DomainState; object: DirObject }) {
  const direct = directGroupsOf(state, object.guid)
  const primary = primaryGroupOf(state, object)
  return <div className="props-groups">
    {primary && <p><span className="label">Primary group</span><span>{displayName(primary)}</span> <span className="muted">· set by <code>primaryGroupID</code>, not a membership</span></p>}
    <p className="label">Member of ({direct.length}, direct only)</p>
    {direct.length
      ? <ul className="member-of">{direct.map((group) => <li key={group.guid}><span className="mono">{displayName(group)}</span> <span className="muted">· {groupKind(group) || typeLabel(group)}</span></li>)}</ul>
      : <p className="muted">No direct group memberships.</p>}
  </div>
}

/** Read-only properties for the selected object (T07 P1). P2 adds the editors below these tabs. */
export default function ObjectProperties({ state, guid }: ObjectPropertiesProps) {
  const [tab, setTab] = useState<PropertiesTab>('General')
  const object = guid ? state.objects[guid] : undefined
  if (!object) return <div className="props-empty muted">Pick an object in the tree to see its properties.</div>
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.indexOf(tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = TABS[(at + step + TABS.length) % TABS.length]!
    setTab(next)
    document.getElementById(`props-tab-${next}`)?.focus()
  }
  const sam = signInName(object)
  return <section className="properties" aria-label={`Properties of ${displayName(object)}`}>
    <h2 className="props-title">{displayName(object)}</h2>
    <p className="meta"><span className="pill">{typeLabel(object)}</span>{statusLabel(object) && <span className="pill">{statusLabel(object)}</span>}{sam && <span className="mono">{sam}</span>}</p>
    <div className="tabs" role="tablist" aria-label="Properties" onKeyDown={onKey}>
      {TABS.map((name) => <button
        key={name}
        id={`props-tab-${name}`}
        role="tab"
        type="button"
        tabIndex={tab === name ? 0 : -1}
        aria-selected={tab === name}
        aria-controls="props-panel"
        onClick={() => setTab(name)}
      >{name}</button>)}
    </div>
    <div id="props-panel" role="tabpanel" aria-labelledby={`props-tab-${tab}`}>
      {tab === 'General' && <General state={state} object={object} />}
      {tab === 'Account' && <Account object={object} />}
      {tab === 'Groups' && <Groups state={state} object={object} />}
    </div>
  </section>
}
