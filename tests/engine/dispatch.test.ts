import { describe, expect, it } from 'vitest'
import { deriveDn } from '../../src/domain/dn'
import { createObject } from '../../src/domain/graph'
import { buildIndexes, findBySamAccountName } from '../../src/domain/indexes'
import type { AttrValue, DomainState, Guid } from '../../src/domain/types'
import { dispatch, isPermissionBearing, principalsOf, ridOf, type Action, type ActionCtx, type DelegationAce, type GroupScope, type MemberKind } from '../../src/engine'
import { buildBaseDomain, LAB_START, OPERATOR_ID } from '../../src/fixtures/baseDomain'

const HOST = 'DC01.corp.contoso.local'
const base = buildBaseDomain()
const ids = base.ids
const operator = ids[OPERATOR_ID]
const ctx = (overrides: Partial<ActionCtx> = {}): ActionCtx => ({ actor: operator, source: 'console', whatIf: false, ...overrides })
const run = (state: DomainState, action: Action, overrides: Partial<ActionCtx> = {}) => dispatch(state, action, ctx(overrides))

function withAttrs(state: DomainState, guid: Guid, attrs: Record<string, AttrValue>): DomainState {
  const object = state.objects[guid]
  const next = { ...state, objects: { ...state.objects, [guid]: { ...object, attrs: { ...object.attrs, ...attrs } } } }
  return { ...next, indexes: buildIndexes(next) }
}

function withGroup(state: DomainState, name: string, scope: GroupScope, category: 'Security' | 'Distribution' = 'Security'): { state: DomainState; guid: Guid } {
  const created = createObject(state, { objectClass: 'group', rdn: name, parent: ids['ou.roleGroups'], attrs: { sAMAccountName: name, groupScope: scope, groupCategory: category }, securityPrincipal: true })
  return { state: created.state, guid: created.object.guid }
}

describe('dispatch pipeline', () => {
  it('previews with whatIf: same state reference, no events, populated diff', () => {
    const result = run(base.state, { type: 'user.setEnabled', target: ids['user.pnair'], enabled: false }, { whatIf: true })
    expect(result.ok).toBe(true)
    expect(result.state).toBe(base.state)
    expect(result.events).toEqual([])
    expect(result.diff).toEqual([{ kind: 'attr', target: ids['user.pnair'], key: 'enabled', before: true, after: false }])
    const create = run(base.state, { type: 'user.create', name: 'Preview Person', samAccountName: 'pperson' }, { whatIf: true })
    expect(create.state).toBe(base.state)
    expect(create.events).toEqual([])
    expect(create.diff.length).toBeGreaterThan(0)
    expect(base.state.ids.guidCounter).toBe(buildBaseDomain().state.ids.guidCounter)
  })

  it('commits one revision, stamps object rev, and keeps indexes consistent', () => {
    const result = run(base.state, { type: 'user.setAttrs', target: ids['user.pnair'], attrs: { title: 'Lead Technician' } })
    expect(result.ok).toBe(true)
    expect(result.state).not.toBe(base.state)
    expect(result.state.revision).toBe(base.state.revision + 1)
    expect(result.state.objects[ids['user.pnair']].rev).toBe(result.state.revision)
    expect(result.state.indexes).toEqual(buildIndexes(result.state))
    expect(base.state.objects[ids['user.pnair']].attrs.title).toBe('Pharmacy Technician')
  })

  it('returns denied and commits nothing for an unauthorized action, whatever the source', () => {
    const attempts: Action[] = [
      { type: 'group.addMember', group: ids['group.domainAdmins'], member: operator },
      { type: 'user.setEnabled', target: ids['user.ehartmann'], enabled: false },
      { type: 'user.resetPassword', target: ids['user.administrator'], credential: { policy: 'pass' } },
      { type: 'object.move', target: ids['user.pnair'], newParent: ids['ou.executive'] },
      { type: 'object.move', target: ids['user.administrator'], newParent: ids['ou.pharmacy'] },
      { type: 'user.setEnabled', target: ids['user.administrator'], enabled: false },
      { type: 'group.addMember', group: ids['group.itHelpdesk'], member: ids['user.pnair'] },
    ]
    for (const action of attempts) {
      for (const source of ['console', 'gui', 'system'] as const) {
        const result = run(base.state, action, { source })
        expect(result.ok, `${action.type} ${source}`).toBe(false)
        expect(result.error).toBe('denied')
        expect(result.state).toBe(base.state)
        expect(result.events).toEqual([])
      }
    }
    expect(run(base.state, { type: 'user.unlock', target: ids['user.pnair'] }, { actor: 'missing' as Guid }).error).toBe('denied')
  })

  it('denies an actor that is not an enabled user account', () => {
    const action: Action = { type: 'user.setAttrs', target: ids['user.pnair'], attrs: { title: 'Lead' } }
    expect(run(base.state, action).ok).toBe(true)
    // The delegated group itself, a computer, a container, and a missing GUID can never act.
    for (const actor of [ids['group.itHelpdesk'], ids['computer.dc01'], ids['ou.pharmacy'], 'missing' as Guid]) {
      for (const source of ['console', 'gui', 'system'] as const) {
        const result = run(base.state, action, { actor, source })
        expect(result.error, `${actor} ${source}`).toBe('denied')
        expect(result.state).toBe(base.state)
        expect(result.events).toEqual([])
      }
    }
    expect(run(base.state, { type: 'clock.advance', milliseconds: 1000 }, { actor: ids['group.itHelpdesk'] }).error).toBe('denied')
    const disabledOperator = withAttrs(base.state, operator, { enabled: false })
    const disabled = run(disabledOperator, action)
    expect(disabled.error).toBe('denied')
    expect(disabled.state).toBe(disabledOperator)
  })

  it('leaves the state untouched when an action fails', () => {
    const failures: [Action, string][] = [
      [{ type: 'user.setEnabled', target: 'missing' as Guid, enabled: false }, 'notFound'],
      [{ type: 'user.setAttrs', target: ids['user.pnair'], attrs: { enabled: false } }, 'invalid'],
      [{ type: 'user.resetPassword', target: ids['user.pnair'], credential: { policy: 'fail' } }, 'invalid'],
      [{ type: 'user.create', name: 'Priya Nair', samAccountName: 'pnair2', parent: ids['ou.pharmacy'] }, 'conflict'],
      [{ type: 'user.create', name: 'Someone New', samAccountName: 'PNAIR', parent: ids['ou.pharmacy'] }, 'conflict'],
      [{ type: 'group.addMember', group: ids['group.pharmacyStaff'], member: ids['user.pnair'] }, 'conflict'],
      [{ type: 'group.removeMember', group: ids['group.pharmacyStaff'], member: ids['user.kmorita'] }, 'notFound'],
      [{ type: 'clock.advance', milliseconds: -5 }, 'invalid'],
      [{ type: 'session.end', session: 's1' }, 'notFound'],
    ]
    for (const [action, error] of failures) {
      const result = run(base.state, action)
      expect(result.error, action.type).toBe(error)
      expect(result.ok).toBe(false)
      expect(result.state).toBe(base.state)
      expect(result.events).toEqual([])
    }
  })

  it('rejects a GUI save on a changed object as stale and accepts one on an untouched object', () => {
    const opened = base.state.revision
    const changed = run(base.state, { type: 'user.setAttrs', target: ids['user.mali'], attrs: { title: 'Director of Pharmacy' } }).state
    const stale = run(changed, { type: 'user.setAttrs', target: ids['user.mali'], attrs: { department: 'Clinical' } }, { source: 'gui', baseRevision: opened })
    expect(stale.ok).toBe(false)
    expect(stale.error).toBe('stale')
    expect(stale.state).toBe(changed)
    const fresh = run(changed, { type: 'user.setAttrs', target: ids['user.tlindqvist'], attrs: { department: 'Clinical' } }, { source: 'gui', baseRevision: opened })
    expect(fresh.ok).toBe(true)
    expect(fresh.state.objects[ids['user.tlindqvist']].attrs.department).toBe('Clinical')
    const group = run(base.state, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['user.pnair'] }).state
    expect(run(group, { type: 'group.removeMember', group: ids['group.pharmacyManagers'], member: ids['user.mali'] }, { source: 'gui', baseRevision: opened }).error).toBe('stale')
  })
})

describe('fix round 2', () => {
  it('rejects a GUI membership save as stale when the member changed after the form opened', () => {
    const opened = base.state.revision
    const gui = { source: 'gui' as const, baseRevision: opened }
    const changed = run(base.state, { type: 'user.setAttrs', target: ids['user.pnair'], attrs: { title: 'Lead Technician' } }).state
    const add = run(changed, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['user.pnair'] }, gui)
    expect(add.error).toBe('stale')
    expect(add.state).toBe(changed)
    expect(add.events).toEqual([])
    const remove = run(changed, { type: 'group.removeMember', group: ids['group.pharmacyStaff'], member: ids['user.pnair'] }, gui)
    expect(remove.error).toBe('stale')
    expect(remove.state).toBe(changed)
    const moved = run(base.state, { type: 'object.move', target: ids['user.pnair'], newParent: ids['ou.finance'] }).state
    expect(run(moved, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['user.pnair'] }, gui).error).toBe('stale')
    // An untouched member and group still save, and a console command is never stale.
    expect(run(changed, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['user.tlindqvist'] }, gui).ok).toBe(true)
    expect(run(changed, { type: 'group.removeMember', group: ids['group.pharmacyStaff'], member: ids['user.tlindqvist'] }, gui).ok).toBe(true)
    expect(run(changed, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['user.pnair'] }).ok).toBe(true)
  })

  it('rejects a clock advance whose resulting time is not a safe integer', () => {
    const late = { ...base.state, now: Number.MAX_SAFE_INTEGER - 10 }
    const overflow = run(late, { type: 'clock.advance', milliseconds: 100 })
    expect(overflow.ok).toBe(false)
    expect(overflow.error).toBe('invalid')
    expect(overflow.state).toBe(late)
    expect(overflow.events).toEqual([])
    expect(run(late, { type: 'clock.advance', milliseconds: Number.MAX_SAFE_INTEGER }).error).toBe('invalid')
    const edge = run(late, { type: 'clock.advance', milliseconds: 10 })
    expect(edge.ok).toBe(true)
    expect(edge.state.now).toBe(Number.MAX_SAFE_INTEGER)
    expect(edge.events[0].time).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('final review fix', () => {
  // Grants `trustee` user rights over the Executive OU, where the operator has none.
  const delegate = (state: DomainState, trustee: Guid, rows: [Guid, Guid][]): DomainState => {
    const ace: DelegationAce = { kind: 'delegation', trustee, scope: ids['ou.executive'], objectClasses: ['user'] }
    const next = { ...state, aces: [...state.aces, ace], memberships: [...state.memberships, ...rows.map(([group, member]) => ({ group, member }))] }
    return { ...next, indexes: buildIndexes(next) }
  }
  const action: Action = { type: 'user.setAttrs', target: ids['user.ehartmann'], attrs: { title: 'Chair' } }

  it('never lets distribution-group membership satisfy a delegation', () => {
    expect(run(base.state, action).error).toBe('denied')
    const dist = withGroup(base.state, 'T-Dist-Trustee', 'Global', 'Distribution')
    const direct = delegate(dist.state, dist.guid, [[dist.guid, operator]])
    expect(principalsOf(direct, operator).has(dist.guid)).toBe(false)
    const denied = run(direct, action)
    expect(denied.error).toBe('denied')
    expect(denied.state).toBe(direct)

    // Nesting through a distribution group passes nothing on, in either direction.
    const sec = withGroup(dist.state, 'T-Sec-Inner', 'Global')
    expect(run(delegate(sec.state, dist.guid, [[sec.guid, operator], [dist.guid, sec.guid]]), action).error).toBe('denied')
    expect(run(delegate(sec.state, sec.guid, [[dist.guid, operator], [sec.guid, dist.guid]]), action).error).toBe('denied')

    // Control: the same grant through a security group is honored.
    const control = delegate(sec.state, sec.guid, [[sec.guid, operator]])
    expect(run(control, action).ok).toBe(true)
  })
})

describe('audit events', () => {
  const expectWindows = (result: ReturnType<typeof run>, eventId: number, target: Guid, source = 'console') => {
    expect(result.ok).toBe(true)
    const event = result.events.at(-1)
    expect(event).toMatchObject({ origin: 'windows', host: HOST, log: 'Security', eventId, actor: operator, target, time: result.state.now, source })
    expect(result.state.events.at(-1)).toBe(event)
  }

  it('records the right Windows event for each user handler', () => {
    const user = ids['user.pnair']
    const created = run(base.state, { type: 'user.create', name: 'New Hire', samAccountName: 'nhire', parent: ids['ou.pharmacy'], enabled: true, credential: { policy: 'pass' } })
    const createdGuid = findBySamAccountName(created.state, 'nhire') as Guid
    expect(created.events.map((event) => event.eventId)).toEqual([4720, 4722])
    expect(created.events.map((event) => event.seq)).toEqual([1, 2])
    expectWindows(created, 4722, createdGuid)
    expectWindows(run(base.state, { type: 'user.setAttrs', target: user, attrs: { title: 'Lead' } }, { source: 'gui' }), 4738, user, 'gui')
    expectWindows(run(base.state, { type: 'user.setEnabled', target: user, enabled: false }), 4725, user)
    const disabled = run(base.state, { type: 'user.setEnabled', target: user, enabled: false }).state
    expectWindows(run(disabled, { type: 'user.setEnabled', target: user, enabled: true }), 4722, user)
    expectWindows(run(withAttrs(base.state, user, { lockedOut: true, badPwdCount: 5 }), { type: 'user.unlock', target: user }), 4767, user)
    const reset = run(base.state, { type: 'user.resetPassword', target: user, credential: { policy: 'pass' } })
    expectWindows(reset, 4724, user)
    expect(reset.state.objects[user].attrs.credentialVersion).toBe(2)
  })

  it('uses 4728, 4732, or 4756 for additions and 4729, 4733, 4757 for removals by group scope', () => {
    const cases: [string, number, number][] = [['group.pharmacyManagers', 4728, 4729], ['group.pharmacyShareRead', 4732, 4733], ['group.allStaff', 4756, 4757]]
    for (const [group, added, removed] of cases) {
      const add = run(base.state, { type: 'group.addMember', group: ids[group], member: ids['user.pnair'] })
      expectWindows(add, added, ids[group])
      expect(add.events[0].data.memberName).toBe('pnair')
      expectWindows(run(add.state, { type: 'group.removeMember', group: ids[group], member: ids['user.pnair'] }), removed, ids[group])
    }
  })

  it('records moves and clock changes as simulator activity at lab time', () => {
    const moved = run(base.state, { type: 'object.move', target: ids['user.pnair'], newParent: ids['ou.finance'] })
    expect(moved.ok).toBe(true)
    expect(moved.events[0]).toMatchObject({ origin: 'simulator', actor: operator, target: ids['user.pnair'], time: LAB_START, source: 'console' })
    expect(moved.events[0].eventId).toBeUndefined()
    expect(moved.events[0].data).toMatchObject({ kind: 'object.move', toDn: 'CN=Priya Nair,OU=Finance,DC=corp,DC=contoso,DC=local' })
    const advanced = run(base.state, { type: 'clock.advance', milliseconds: 60_000 }, { source: 'system' })
    expect(advanced.state.now).toBe(LAB_START + 60_000)
    expect(advanced.events[0]).toMatchObject({ origin: 'simulator', time: LAB_START + 60_000, source: 'system' })
    expect(advanced.diff).toEqual([{ kind: 'clock', key: 'now', before: LAB_START, after: LAB_START + 60_000 }])
  })

  it('reports an idempotent request as no change without an event', () => {
    const result = run(base.state, { type: 'user.unlock', target: ids['user.pnair'] })
    expect(result).toMatchObject({ ok: true, events: [], diff: [], warnings: [{ code: 'noChange' }] })
    expect(result.state).toBe(base.state)
  })
})

describe('group rules', () => {
  it('enforces the nesting matrix for every member kind and group scope', () => {
    const expected: Record<GroupScope, Record<MemberKind, boolean>> = {
      Global: { user: true, computer: true, Global: true, Universal: false, DomainLocal: false },
      Universal: { user: true, computer: true, Global: true, Universal: true, DomainLocal: false },
      DomainLocal: { user: true, computer: true, Global: true, Universal: true, DomainLocal: true },
    }
    for (const scope of ['Global', 'Universal', 'DomainLocal'] as const) {
      for (const kind of ['user', 'computer', 'Global', 'Universal', 'DomainLocal'] as const) {
        let state = base.state
        const outer = withGroup(state, `T-Outer-${scope}`, scope)
        state = outer.state
        let member: Guid
        if (kind === 'user') member = ids['user.pnair']
        else if (kind === 'computer') member = ids['computer.pharmWs01']
        else {
          const inner = withGroup(state, `T-Inner-${kind}`, kind)
          state = inner.state
          member = inner.guid
        }
        const result = run(state, { type: 'group.addMember', group: outer.guid, member })
        expect(result.ok, `${kind} into ${scope}`).toBe(expected[scope][kind])
        if (!expected[scope][kind]) {
          expect(result.error).toBe('invalid')
          expect(result.state).toBe(state)
        } else {
          expect(result.state.memberships).toContainEqual({ group: outer.guid, member })
        }
      }
    }
  })

  it('rejects non-principals, self membership, and circular nesting', () => {
    expect(run(base.state, { type: 'group.addMember', group: ids['group.pharmacyStaff'], member: ids['ou.finance'] }).error).toBe('invalid')
    expect(run(base.state, { type: 'group.addMember', group: ids['group.pharmacyStaff'], member: ids['group.pharmacyStaff'] }).error).toBe('invalid')
    const nested = run(base.state, { type: 'group.addMember', group: ids['group.pharmacyStaff'], member: ids['group.pharmacyManagers'] })
    expect(nested.ok).toBe(true)
    expect(run(nested.state, { type: 'group.addMember', group: ids['group.pharmacyManagers'], member: ids['group.pharmacyStaff'] }).error).toBe('invalid')
  })

  it('adds to a distribution group but flags it as not permission-bearing', () => {
    const group = ids['group.pharmacyNews']
    const result = run(base.state, { type: 'group.addMember', group, member: ids['user.pnair'] })
    expect(result.ok).toBe(true)
    expect(result.state.memberships).toContainEqual({ group, member: ids['user.pnair'] })
    expect(result.warnings.map((warning) => warning.code)).toEqual(['notPermissionBearing'])
    expect(isPermissionBearing(result.state.objects[group])).toBe(false)
    expect(isPermissionBearing(result.state.objects[ids['group.pharmacyStaff']])).toBe(true)
    expect(result.events[0]).toMatchObject({ origin: 'simulator', target: group })
    expect(result.events[0].eventId).toBeUndefined()
  })

  it('keeps the primary group apart from memberships', () => {
    const user = ids['user.pnair']
    const group = ids['group.pharmacyManagers']
    const state = withAttrs(base.state, user, { primaryGroupID: ridOf(base.state.objects[group]) as number })
    const add = run(state, { type: 'group.addMember', group, member: user })
    expect(add.error).toBe('conflict')
    expect(add.state.memberships).not.toContainEqual({ group, member: user })
    expect(run(state, { type: 'group.removeMember', group, member: user }).error).toBe('invalid')
    const created = run(base.state, { type: 'user.create', name: 'New Hire', samAccountName: 'nhire' }).state
    const createdGuid = findBySamAccountName(created, 'nhire') as Guid
    expect(created.objects[createdGuid].attrs.primaryGroupID).toBe(513)
    expect(created.memberships.some((row) => row.member === createdGuid)).toBe(false)
  })

  it('keeps guid, sid, and memberships across a move', () => {
    const user = ids['user.mali']
    const before = base.state.objects[user]
    const moved = run(base.state, { type: 'object.move', target: user, newParent: ids['ou.finance'] }).state
    expect(moved.objects[user].guid).toBe(before.guid)
    expect(moved.objects[user].sid).toBe(before.sid)
    expect(moved.memberships).toEqual(base.state.memberships)
    expect(deriveDn(moved, user)).toBe('CN=Maya Ali,OU=Finance,DC=corp,DC=contoso,DC=local')
  })
})

describe('user.create', () => {
  it('lands in the default Users container when no path is given', () => {
    const result = run(base.state, { type: 'user.create', name: 'Default Path', samAccountName: 'dpath' })
    expect(result.ok).toBe(true)
    const guid = findBySamAccountName(result.state, 'dpath') as Guid
    expect(deriveDn(result.state, guid)).toBe('CN=Default Path,CN=Users,DC=corp,DC=contoso,DC=local')
    expect(result.state.objects[guid].parent).toBe(ids['cn.users'])
    expect(result.state.indexes.childrenByParent[ids['cn.users']]).toContain(guid)
    expect(result.state.objects[guid].sid).toBeDefined()
    expect(result.state.objects[guid].attrs.userPrincipalName).toBe('dpath@corp.contoso.local')
  })

  it('starts disabled unless enabled with a valid credential', () => {
    const plain = run(base.state, { type: 'user.create', name: 'Plain Account', samAccountName: 'plain' })
    expect(plain.state.objects[findBySamAccountName(plain.state, 'plain') as Guid].attrs).toMatchObject({ enabled: false, credentialVersion: 0 })
    expect(plain.warnings).toEqual([])
    const noCredential = run(base.state, { type: 'user.create', name: 'No Credential', samAccountName: 'nocred', enabled: true })
    expect(noCredential.state.objects[findBySamAccountName(noCredential.state, 'nocred') as Guid].attrs.enabled).toBe(false)
    expect(noCredential.warnings.map((warning) => warning.code)).toEqual(['notEnabled'])
    const enabled = run(base.state, { type: 'user.create', name: 'Ready Account', samAccountName: 'ready', enabled: true, credential: { policy: 'pass' } })
    expect(enabled.state.objects[findBySamAccountName(enabled.state, 'ready') as Guid].attrs).toMatchObject({ enabled: true, credentialVersion: 1 })
  })

  it('leaves one disabled account and a passwordRejected warning when the password fails policy', () => {
    const result = run(base.state, { type: 'user.create', name: 'Weak Secret', samAccountName: 'wsecret', parent: ids['ou.pharmacy'], enabled: true, credential: { policy: 'fail' } })
    expect(result.ok).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toEqual(['passwordRejected'])
    expect(Object.keys(result.state.objects).length).toBe(Object.keys(base.state.objects).length + 1)
    const account = result.state.objects[findBySamAccountName(result.state, 'wsecret') as Guid]
    expect(account.attrs).toMatchObject({ enabled: false, credentialVersion: 0 })
    expect(result.events.map((event) => event.eventId)).toEqual([4720])
    expect(run(result.state, { type: 'user.setEnabled', target: account.guid, enabled: true }).error).toBe('invalid')
    expect(JSON.stringify(result).toLowerCase()).not.toContain('"password"')
  })

  it('allocates the same IDs for the same actions', () => {
    const action: Action = { type: 'user.create', name: 'Repeat Person', samAccountName: 'repeat' }
    const first = run(buildBaseDomain().state, action).state
    const second = run(buildBaseDomain().state, action).state
    const guid = findBySamAccountName(first, 'repeat') as Guid
    expect(findBySamAccountName(second, 'repeat')).toBe(guid)
    expect(second.objects[guid].sid).toBe(first.objects[guid].sid)
  })
})
