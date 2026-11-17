import { describe, expect, it } from 'vitest'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { dispatch } from '../../src/engine/dispatch'
import type { Action, ActionResult } from '../../src/engine/types'
import type { AuditEvent, DomainState, Guid } from '../../src/domain/types'
import { createDefaultRegistry, createRuntime, run } from '../../src/ps/runtime'
import { parse } from '../../src/ps/parser'
import { canonicalAttrs, toConsoleEquivalent } from '../../src/ui/equivalent/toConsoleEquivalent'
import { case01 } from '../../src/tickets/cases/case01'
import { createCampaign, introduceTicket } from '../../src/tickets/engine'

const base = buildBaseDomain()
const id = (key: string) => base.ids[key]! as Guid
const operator = id('user.operator')
const registry = createDefaultRegistry()
/** Case 01 seed 1 after introduction: Maya Ali (mali) is locked out. */
const start: DomainState = introduceTicket(createCampaign(base.state, ['case01']), case01, 1).active!.state

function gui(state: DomainState, action: Action): ActionResult {
  return dispatch(state, action, { actor: operator, source: 'gui', whatIf: false, baseRevision: state.revision })
}

function consoleRun(state: DomainState, source: string, policy: 'pass' | 'fail' = 'pass') {
  const rt = createRuntime({ registry, actor: operator, readSecure: () => ({ policy }), confirm: () => true })
  return run(source, rt, state)
}

const withoutSource = (events: AuditEvent[]) => events.map(({ source: _source, ...rest }) => rest)
/** Diff entries as a set: attribute order inside one change is not meaningful. */
const sorted = (diff: ActionResult['diff']) => [...diff].sort((a, b) => `${a.kind}|${a.target}|${a.key}`.localeCompare(`${b.kind}|${b.target}|${b.key}`))

/** Same diff and same events except `source`, and the same resulting objects. */
function expectSame(state: DomainState, action: Action, source: string, policy: 'pass' | 'fail' = 'pass') {
  const g = gui(state, action)
  const c = consoleRun(state, source, policy)
  expect(c.errors, source).toEqual([])
  expect(g.ok, `${action.type}: ${g.message ?? ''}`).toBe(true)
  expect(sorted(c.committed.flatMap((result) => result.diff))).toEqual(sorted(g.diff))
  expect(withoutSource(c.committed.flatMap((result) => result.events))).toEqual(withoutSource(g.events))
  expect(c.state.objects).toEqual(g.state.objects)
  expect(c.state.memberships).toEqual(g.state.memberships)
  expect(c.state.aces).toEqual(g.state.aces)
  expect(g.events.every((event) => event.source === 'gui')).toBe(true)
  expect(c.committed.flatMap((result) => result.events).every((event) => event.source === 'console')).toBe(true)
}

const disabled = gui(start, { type: 'user.setEnabled', target: id('user.kmorita'), enabled: false }).state

/** One case per Tier 1 action type the GUI or a hint can produce. */
const CASES: { name: string; state: DomainState; action: Action; policy?: 'pass' | 'fail' }[] = [
  { name: 'user.unlock', state: start, action: { type: 'user.unlock', target: id('user.mali') } },
  { name: 'user.setEnabled false', state: start, action: { type: 'user.setEnabled', target: id('user.kmorita'), enabled: false } },
  { name: 'user.setEnabled true', state: disabled, action: { type: 'user.setEnabled', target: id('user.kmorita'), enabled: true } },
  { name: 'user.setAttrs named, change at logon, and -Replace', state: start, action: { type: 'user.setAttrs', target: id('user.pnair'), attrs: canonicalAttrs('Set-ADUser', { title: "Lead O'Brien Tech", changePasswordAtLogon: true, sn: 'Nair-Rao', physicalDeliveryOfficeName: 'B2' }) } },
  { name: 'user.resetPassword pass', state: start, action: { type: 'user.resetPassword', target: id('user.pnair'), credential: { policy: 'pass' } } },
  { name: 'user.create enabled with password', state: start, action: { type: 'user.create', name: 'Jordan Pike', samAccountName: 'jpike', parent: id('ou.pharmacy'), attrs: canonicalAttrs('New-ADUser', { sn: 'Pike', givenName: 'Jordan' }), enabled: true, credential: { policy: 'pass' } } },
  { name: 'user.create without password', state: start, action: { type: 'user.create', name: 'Avery Stone', samAccountName: 'astone', parent: id('ou.finance'), attrs: {} } },
  { name: 'object.move', state: start, action: { type: 'object.move', target: id('user.pnair'), newParent: id('ou.finance') } },
  { name: 'group.addMember', state: start, action: { type: 'group.addMember', group: id('group.financeStaff'), member: id('user.pnair') } },
  { name: 'group.removeMember', state: start, action: { type: 'group.removeMember', group: id('group.pharmacyStaff'), member: id('user.pnair') } },
  { name: 'acl.addEntry one layer', state: start, action: { type: 'acl.addEntry', resource: 'share.finance', trustee: id('user.pnair'), right: 'read', layer: 'share' } },
  { name: 'acl.addEntry both layers', state: start, action: { type: 'acl.addEntry', resource: 'share.finance', trustee: id('user.pnair'), right: 'modify' } },
  { name: 'acl.removeEntry', state: start, action: { type: 'acl.removeEntry', resource: 'share.pharmacy', trustee: id('group.pharmacyShareRead'), right: 'read' } },
  { name: 'session.signIn', state: start, action: { type: 'session.signIn', user: id('user.tlindqvist'), host: id('computer.pharmWs01') } },
  { name: 'session.signIn bad password', state: start, action: { type: 'session.signIn', user: id('user.tlindqvist'), host: id('computer.pharmWs01'), badPassword: true } },
  { name: 'clock.advance', state: start, action: { type: 'clock.advance', milliseconds: 5 * 60_000 } },
]

describe('GUI to console: toConsoleEquivalent', () => {
  for (const { name, state, action, policy } of CASES) {
    it(`${name}: the equivalent parses and reproduces the diff and events`, () => {
      const source = toConsoleEquivalent(action, state)
      expect(parse(source).errors, source).toEqual([])
      expectSame(state, action, source, policy)
    })
  }

  it('uses registry names and adds -Confirm:$false only where the cmdlet prompts', () => {
    expect(toConsoleEquivalent({ type: 'user.unlock', target: id('user.mali') }, start)).toBe('Unlock-ADAccount -Identity mali')
    expect(toConsoleEquivalent({ type: 'group.removeMember', group: id('group.pharmacyStaff'), member: id('user.pnair') }, start)).toBe('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false')
    expect(toConsoleEquivalent({ type: 'user.setAttrs', target: id('user.pnair'), attrs: { changePasswordAtLogon: true } }, start)).toBe('Set-ADUser -Identity pnair -ChangePasswordAtLogon $true')
    const reset = toConsoleEquivalent({ type: 'user.resetPassword', target: id('user.pnair'), credential: { policy: 'pass' } }, start)
    expect(reset).toBe("$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity pnair -Reset -NewPassword $pw")
  })

  it('user.resetPassword with a failing password: both routes refuse and change nothing', () => {
    const action: Action = { type: 'user.resetPassword', target: id('user.pnair'), credential: { policy: 'fail' } }
    const g = gui(start, action)
    const c = consoleRun(start, toConsoleEquivalent(action, start), 'fail')
    expect(g.ok).toBe(false)
    expect(g.state).toBe(start)
    expect(c.committed).toEqual([])
    expect(c.state).toBe(start)
    expect(c.errors).toHaveLength(1)
  })

  it('says so, as a comment, for an action no Tier 1 cmdlet expresses', () => {
    expect(toConsoleEquivalent({ type: 'session.end', session: 's1' }, start)).toMatch(/^# No console command/)
  })
})

describe('console to GUI', () => {
  const PAIRS: { source: string; action: Action; state?: DomainState }[] = [
    { source: 'Unlock-ADAccount -Identity mali', action: { type: 'user.unlock', target: id('user.mali') } },
    { source: "Get-ADUser -Identity 'CN=Maya Ali,OU=Pharmacy,DC=corp,DC=contoso,DC=local' | Unlock-ADAccount", action: { type: 'user.unlock', target: id('user.mali') } },
    { source: 'Disable-ADAccount kmorita', action: { type: 'user.setEnabled', target: id('user.kmorita'), enabled: false } },
    { source: 'Enable-ADAccount -Identity kmorita', action: { type: 'user.setEnabled', target: id('user.kmorita'), enabled: true }, state: disabled },
    { source: "Set-ADUser pnair -Title 'Lead Technician'", action: { type: 'user.setAttrs', target: id('user.pnair'), attrs: { title: 'Lead Technician' } } },
    { source: "Move-ADObject -Identity pnair -TargetPath 'OU=Finance,DC=corp,DC=contoso,DC=local'", action: { type: 'object.move', target: id('user.pnair'), newParent: id('ou.finance') } },
    { source: 'Add-ADPrincipalGroupMembership -Identity pnair -MemberOf GG-Finance-Staff', action: { type: 'group.addMember', group: id('group.financeStaff'), member: id('user.pnair') } },
    { source: 'Remove-ADGroupMember GG-Pharmacy-Staff pnair -Confirm:$false', action: { type: 'group.removeMember', group: id('group.pharmacyStaff'), member: id('user.pnair') } },
    { source: 'Add-SimResourcePermission Finance pnair -Right Read -Layer Share', action: { type: 'acl.addEntry', resource: 'share.finance', trustee: id('user.pnair'), right: 'read', layer: 'share' } },
    { source: 'Step-SimClock -Minutes 5', action: { type: 'clock.advance', milliseconds: 5 * 60_000 } },
  ]
  for (const { source, action, state } of PAIRS) {
    it(`${source} matches the GUI ${action.type}`, () => expectSame(state ?? start, action, source))
  }
})
