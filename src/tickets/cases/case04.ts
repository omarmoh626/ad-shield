import { dispatch } from '../../engine/dispatch'
import type { Action } from '../../engine/types'
import { deriveDn } from '../../domain/dn'
import { findBySamAccountName } from '../../domain/indexes'
import type { DomainState, Guid } from '../../domain/types'
import { buildBaseDomain, OPERATOR_ID } from '../../fixtures/baseDomain'
import { buildContext } from '../../access/token'
import { evaluateAccess } from '../../access/trace'
import { effectiveAccessVia, freshSignInResult, memberOf } from '../predicates'
import type { Attempt, CaseFixture, Debrief, Hint, Predicate, ScriptStep, TicketDef } from '../types'

/**
 * Case 04: a Pharmacy technician transfers to Finance. The former manager
 * noticed the old Pharmacy access still works. Every name, hint, route, and
 * predicate below comes from one Variant and the fixture IDs resolved from it.
 */
export const CASE04_ID = 'case04'

interface Person { given: string; sn: string; sam: string }
interface Variant {
  /** An existing base account, or a technician this case creates in Pharmacy. */
  target: { baseId?: string; person: Person }
  control: { baseId?: string; person: Person }
  record: string
  effective: string
  approval: string
}

const VARIANTS: Record<number, Variant> = {
  1: {
    target: { baseId: 'user.pnair', person: { given: 'Priya', sn: 'Nair', sam: 'pnair' } },
    control: { person: { given: 'Jonah', sn: 'Reyes', sam: 'jreyes' } },
    record: 'HR-TR-3107', effective: 'Monday 12 January', approval: 'Finance manager approval F-2231',
  },
  2: {
    target: { person: { given: 'Grace', sn: 'Okafor', sam: 'gokafor' } },
    control: { baseId: 'user.pnair', person: { given: 'Priya', sn: 'Nair', sam: 'pnair' } },
    record: 'HR-TR-3164', effective: 'Wednesday 14 January', approval: 'Finance manager approval F-2258',
  },
}

const fullName = (person: Person) => `${person.given} ${person.sn}`
const quote = (value: string) => `'${value}'`

function buildCase04(seed: number): CaseFixture {
  const variant = VARIANTS[seed]
  if (!variant) throw new Error(`Case 04 has no seed ${seed}. Known seeds: 1, 2.`)
  const base = buildBaseDomain()
  const ids: Record<string, Guid> = {
    operator: base.ids[OPERATOR_ID]!,
    target: (variant.target.baseId ? base.ids[variant.target.baseId] : '') as Guid,
    control: (variant.control.baseId ? base.ids[variant.control.baseId] : '') as Guid,
    pharmacyOu: base.ids['ou.pharmacy']!,
    financeOu: base.ids['ou.finance']!,
    oldRole: base.ids['group.pharmacyStaff']!,
    newRole: base.ids['group.financeStaff']!,
    enterpriseRole: base.ids['group.allStaff']!,
    oldHost: base.ids['computer.pharmWs01']!,
    workstation: base.ids['computer.finWs01']!,
  }
  let sessionId = ''
  const introduce = (initial: DomainState) => {
    let state = initial
    const apply = (action: Action) => {
      const out = dispatch(state, action, { actor: ids.operator, source: 'system', whatIf: false })
      if (!out.ok) throw new Error(`Case 04 setup failed on ${action.type}: ${out.message ?? out.error}`)
      state = out.state
    }
    const ensure = (who: { baseId?: string; person: Person }): Guid => {
      if (!who.baseId) {
        const person = who.person
        apply({
          type: 'user.create', name: fullName(person), samAccountName: person.sam, parent: ids.pharmacyOu, enabled: true, credential: { policy: 'pass' },
          attrs: { givenName: person.given, sn: person.sn, displayName: fullName(person), title: 'Pharmacy Technician', department: 'Pharmacy' },
        })
        const created = findBySamAccountName(state, person.sam)
        if (!created) throw new Error(`Case 04 setup could not resolve ${person.sam}.`)
        apply({ type: 'group.addMember', group: ids.oldRole, member: created })
        return created
      }
      return base.ids[who.baseId]!
    }
    ids.target = ensure(variant.target)
    ids.control = ensure(variant.control)
    // The enterprise-wide role is assigned to the person directly. The transfer must keep it.
    apply({ type: 'group.addMember', group: ids.enterpriseRole, member: ids.target })
    // A session issued before the transfer. It keeps its Pharmacy group snapshot until it ends.
    apply({ type: 'session.signIn', user: ids.target, host: ids.oldHost })
    sessionId = (state.sessions[state.sessions.length - 1] as { id: string }).id
    return state
  }
  const setup = introduce(base.state)
  const person = fullName(variant.target.person)
  const controlName = fullName(variant.control.person)
  const sam = variant.target.person.sam
  const controlSam = variant.control.person.sam
  const name = (guid: Guid) => String(setup.objects[guid]!.rdn)
  const oldRole = name(ids.oldRole)
  const newRole = name(ids.newRole)
  const enterpriseRole = name(ids.enterpriseRole)
  const financeDn = deriveDn(setup, ids.financeOu)
  const targetDn = deriveDn(setup, ids.target)
  const workstation = name(ids.workstation)
  const oldHost = name(ids.oldHost)
  const signInLabel = `Test ${variant.target.person.given}'s sign-in · simulated`

  const move = `Move-ADObject -Identity ${quote(targetDn)} -TargetPath ${quote(financeDn)}`
  const removeOld = `Remove-ADGroupMember -Identity ${oldRole} -Members ${sam} -Confirm:$false`
  const addNew = `Add-ADGroupMember -Identity ${newRole} -Members ${sam}`
  const script: ScriptStep[] = [
    { code: 'Get-SimTicket', explain: `Read ${variant.record}. ${person} moves from Pharmacy to Finance on ${variant.effective}. ${variant.approval} approves the Finance role.` },
    { code: `Get-ADUser -Identity ${sam} -Properties ObjectGUID,ObjectSID,MemberOf | Select-Object SamAccountName,ObjectGUID,ObjectSID,MemberOf`, explain: 'Note the GUID and SID. The transfer must keep this same account, and the role memberships show where the old access comes from.' },
    { code: move, explain: `Move the account to the Finance OU. A move keeps the GUID, the SID, and every group membership, so the Pharmacy access stays.` },
    { code: removeOld, explain: `Remove the Pharmacy role group. It nests into the Pharmacy share read group. -Confirm:$false answers the simulated confirmation prompt.` },
    { code: addNew, explain: `Add the approved Finance role group. Keep ${enterpriseRole}; it is the enterprise-wide role.` },
    { code: `Test-SimSignIn -Identity ${sam} -ComputerName ${workstation}`, explain: 'Issue a simulated fresh sign-in. It builds a new security context from the current memberships.' },
    { code: `Test-SimResourceAccess -Identity ${sam} -Resource Finance -Right Read`, explain: 'Expected: read is allowed through the Finance role path.' },
    { code: `Test-SimResourceAccess -Identity ${sam} -Resource Pharmacy -Right Read`, explain: `Expected: denied. The session issued on ${oldHost} before the transfer keeps its old groups until it ends.` },
  ]
  const accountPath = (ou: string) => ['Directory', ou, person]
  const gui = [
    { path: [...accountPath('Pharmacy'), 'Actions', 'Move…', 'Move to', financeDn, 'Apply'], action: { type: 'object.move', target: ids.target, newParent: ids.financeOu } as Action },
    { path: [...accountPath('Finance'), 'Properties', 'Groups', `Remove from ${oldRole}`, 'Apply'], action: { type: 'group.removeMember', group: ids.oldRole, member: ids.target } as Action },
    { path: [...accountPath('Finance'), 'Properties', 'Groups', 'Add to a group…', 'Add to group', newRole, 'Apply'], action: { type: 'group.addMember', group: ids.newRole, member: ids.target } as Action },
    { path: ['What done looks like', signInLabel], action: { type: 'session.signIn', user: ids.target, host: ids.workstation } as Action },
  ]

  /** Same account means the fixture GUID with the SID it had at ticket arrival, now in Finance. Never graded by name. */
  const sameAccount: Predicate = {
    id: 'sameAccount', label: `The same account (GUID and SID) for ${person} is in the Finance OU`, kind: 'outcome', posture: 'availability',
    evaluate: (state, attempt) => {
      const original = attempt.checkpoint.objects[ids.target]
      const now = state.objects[ids.target]
      const namesakes = Object.values(state.objects).filter((object) => object.guid !== ids.target && object.objectClass === 'user' && object.parent === ids.financeOu && object.rdn === original?.rdn)
      const namesake = namesakes.length ? `; a different account named ${original?.rdn} (new GUID and SID) is in Finance` : ''
      if (!now || !original) return { status: 'unmet', observed: `account with the ticket's GUID not found${namesake}`, required: `GUID ${ids.target} with its original SID in ${financeDn}` }
      const sameSid = now.sid !== undefined && now.sid === original.sid
      const inFinance = now.parent === ids.financeOu
      const where = now.parent ? deriveDn(state, now.parent) : '(top)'
      return { status: sameSid && inFinance ? 'met' : 'unmet', observed: `GUID ${ids.target}, SID ${sameSid ? 'unchanged' : 'changed'}, in ${where}${namesake}`, required: `GUID ${ids.target} with its original SID in ${financeDn}` }
    },
  }
  /** Names the group path that still grants Pharmacy read, so a move alone shows why it fails. */
  const pharmacyDenied: Predicate = {
    id: 'pharmacyDenied', label: 'A fresh simulated sign-in is denied the Pharmacy share', kind: 'outcome', posture: 'security',
    evaluate: (state) => {
      if (!state.objects[ids.target]) return { status: 'unmet', observed: 'account not found', required: 'denied' }
      const trace = evaluateAccess(state, buildContext(state, ids.target), 'share.pharmacy', 'read')
      if (!trace.allowed) return { status: 'met', observed: 'denied', required: 'denied' }
      return { status: 'unmet', observed: `still allowed through ${grantingPaths(state, trace, ids.target)}`, required: 'denied' }
    },
  }
  const existingSession: Predicate = {
    id: 'existingSession', label: 'An existing session keeps its old access until it ends', kind: 'evidence',
    evaluate: (state) => {
      const session = state.sessions.find((item) => (item as { id?: string }).id === sessionId) as { context?: Parameters<typeof evaluateAccess>[1]; endedAt?: number; ended?: boolean } | undefined
      if (!session?.context) return { status: 'met', observed: 'the earlier session is no longer recorded', required: 'shown for information; it does not block closing' }
      const trace = evaluateAccess(state, session.context, 'share.pharmacy', 'read')
      return { status: 'met', observed: `session issued on ${oldHost} before the transfer: Pharmacy read ${trace.allowed ? 'still allowed' : 'denied'} with its old group snapshot`, required: 'shown for information; a fresh sign-in is what the checks above grade' }
    },
  }
  const predicates: Predicate[] = [
    sameAccount,
    { ...effectiveAccessVia('financeRead', 'A fresh simulated sign-in can read the Finance share', ids.target, 'share.finance', 'read', true, 'role'), posture: 'availability' },
    pharmacyDenied,
    { ...memberOf('enterpriseRole', `The enterprise-wide role ${enterpriseRole} is kept`, ids.target, ids.enterpriseRole), kind: 'control', posture: 'availability' },
    { ...effectiveAccessVia('control', `${controlName} keeps Pharmacy read access`, ids.control, 'share.pharmacy', 'read', true, 'role'), kind: 'control', posture: 'availability' },
    { ...freshSignInResult('signin', `A fresh sign-in at ${workstation} works · simulated`, ids.target, true), kind: 'evidence' },
    existingSession,
  ]
  const hints: [Hint, Hint, Hint] = [
    { level: 1, content: `A transfer changes where an account lives and which role it holds. Moving an account to another OU keeps its groups. Which group gives ${sam} the Pharmacy share today?` },
    { level: 2, content: `Use Move-ADObject (or Directory → Move…) to put ${sam} in Finance. Then Remove-ADGroupMember for ${oldRole} and Add-ADGroupMember for ${newRole}. Check a fresh sign-in with Test-SimResourceAccess for both shares. The access inspector shows the group path. Keep ${enterpriseRole}, and leave ${controlName} (${controlSam}) alone.` },
    { level: 3, content: [...script.map((step) => `# ${step.explain}\n${step.code}`), `GUI route: ${gui.map((step) => step.path.join(' → ')).join('\nThen: ')}`].join('\n\n') },
  ]
  const debrief = (attempt: Attempt): Debrief => {
    const done = (match: (action: Action) => boolean) => attempt.history.findIndex((entry) => !entry.whatIf && match(entry.action))
    const moved = done((action) => action.type === 'object.move' && action.target === ids.target && action.newParent === ids.financeOu)
    const removed = done((action) => action.type === 'group.removeMember' && action.group === ids.oldRole && action.member === ids.target)
    const added = done((action) => action.type === 'group.addMember' && action.group === ids.newRole && action.member === ids.target)
    const context = attempt.state.objects[ids.target] ? buildContext(attempt.state, ids.target) : undefined
    const finance = context ? evaluateAccess(attempt.state, context, 'share.finance', 'read').allowed : false
    const pharmacy = context ? evaluateAccess(attempt.state, context, 'share.pharmacy', 'read').allowed : false
    const steps = [moved >= 0 ? 'moved the account to Finance' : '', removed >= 0 ? `removed ${oldRole}` : '', added >= 0 ? `added ${newRole}` : ''].filter(Boolean)
    const order = moved >= 0 && removed >= 0 ? (moved < removed ? 'You moved the account first, then fixed its groups.' : 'You fixed the groups first, then moved the account. Both orders work.') : ''
    const freshSignIn = attempt.state.events.some((event) => event.eventId === 4624 && event.target === ids.target && event.host?.startsWith(workstation))
    return {
      change: steps.length ? `For ${person} (${sam}) you ${steps.join(', ')}. ${order}`.trim() : `No transfer change for ${sam} was recorded.`,
      access: `${person} on a fresh simulated sign-in: Finance read ${finance ? 'allowed' : 'denied'}, Pharmacy read ${pharmacy ? 'allowed' : 'denied'}. ${enterpriseRole} is ${attempt.state.memberships.some((m) => m.member === ids.target && m.group === ids.enterpriseRole) ? 'kept' : 'missing'}. ${controlName} keeps Pharmacy access. The session issued before the transfer keeps its old groups until it ends.`,
      verification: freshSignIn ? `A simulated fresh sign-in was recorded on ${workstation}; Finance and Pharmacy read were checked against current memberships.` : `Run a simulated fresh sign-in on ${workstation}, then test Finance and Pharmacy read.`,
      reusableCommand: `${move}; ${removeOld}; ${addNew}`,
      summary: `Same account (GUID and SID) moved to Finance; Pharmacy role removed, Finance role added, enterprise-wide role kept.`,
    }
  }
  return {
    ticketId: CASE04_ID, ids, introduce,
    request: {
      sender: 'HR · People Operations', priority: 'Normal', impact: `${person} starts in Finance on ${variant.effective}. Lingering Pharmacy access lets a non-Pharmacy employee open patient medication files.`, sla: '8 hours (simulated)',
      title: `Transfer ${person} from Pharmacy to Finance`,
      story: `HR transfer record ${variant.record} moves ${person} (${sam}) from Pharmacy to Finance on ${variant.effective}. Maya Ali, the former Pharmacy manager, adds a note: "${variant.target.person.given} has started in Finance, but I can still see ${variant.target.person.given} opening the Pharmacy share."`,
      goal: `Keep the same ${sam} account, place it in Finance with Finance share read access, and remove Pharmacy access without touching the enterprise-wide role.`,
      who: { person, account: sam },
      alreadyChecked: `HR confirmed ${variant.record} and the effective date. ${variant.approval} approves ${newRole}.`,
      clue: { text: `${variant.record}: ${sam} · Pharmacy → Finance · effective ${variant.effective}. Manager note: Pharmacy share still opens.` },
      careful: `${controlName} (${controlSam}) is another Pharmacy technician and keeps Pharmacy access. Keep ${enterpriseRole} on ${sam}. Do not create a new account: the transfer keeps the same GUID and SID.`,
      glossary: [
        { term: 'Organizational unit (OU)', definition: 'A directory container that organizes accounts and scopes policy. Moving an account between OUs does not change its groups.' },
        { term: 'GUID and SID', definition: 'The account’s permanent identifiers. A move keeps both; a new account gets new ones.' },
        { term: 'Role group', definition: 'A security group for people with the same job role.' },
        { term: 'Enterprise-wide role', definition: `${enterpriseRole}: a role every staff member keeps whatever their department.` },
        { term: 'Fresh sign-in', definition: 'A simulated sign-in that builds a new security context from current memberships. An existing session keeps its old groups until it ends.' },
      ],
      needs: `${person} needs Finance share read access and no Pharmacy share access, on the same account.`,
      evidence: [
        `HR transfer record ${variant.record}: ${sam}, Pharmacy → Finance, effective ${variant.effective}.`,
        `${variant.approval}: ${newRole} for ${sam}.`,
        `Former manager note (Maya Ali): Pharmacy share still opens for ${sam}.`,
        `Control: ${controlName} (${controlSam}) stays in Pharmacy with access.`,
      ],
    },
    responsibility: { account: sam, outcome: `Same ${sam} account in Finance; a fresh sign-in reads Finance and is denied Pharmacy; ${enterpriseRole} kept; ${controlSam} unchanged.` },
    predicates, hints, routes: { script, gui },
    wrongFixes: [
      { name: 'Move the account only', steps: [{ code: move, explain: 'The move keeps every group, so Pharmacy access stays and Finance access never arrives.' }], expectUnmet: ['financeRead', 'pharmacyDenied'] },
      { name: 'Create a replacement account in Finance', steps: [
        { code: `New-ADUser -Name ${quote(person)} -SamAccountName ${sam}2 -Path ${quote(financeDn)}`, explain: 'A new account gets a new GUID and SID. The original keeps its Pharmacy access.' },
        { code: `Add-ADGroupMember -Identity ${newRole} -Members ${sam}2`, explain: 'Grants Finance to the new account, not to the transferring one.' },
      ], expectUnmet: ['sameAccount', 'pharmacyDenied'] },
      { name: 'Remove the enterprise-wide role', steps: [
        { code: move, explain: 'Move to Finance.' },
        { code: removeOld, explain: 'Remove the Pharmacy role.' },
        { code: addNew, explain: 'Add the Finance role.' },
        { code: `Remove-ADGroupMember -Identity ${enterpriseRole} -Members ${sam} -Confirm:$false`, explain: 'The enterprise-wide role is not department access. Removing it breaks services every employee needs.' },
      ], expectUnmet: ['enterpriseRole'] },
    ],
    debrief,
    transfer: {
      question: 'You moved a transferred user to the new OU, but the old share still opens on a fresh sign-in. Why?',
      choices: ['The move has not replicated yet', 'The old role group membership moved with the account', 'The OU move changed the SID'],
      answer: 'The old role group membership moved with the account',
      feedback: 'An OU move changes where the account lives. It keeps the GUID, the SID, and every group membership. Remove the old role group and add the new one, then test a fresh sign-in.',
    },
  }

  function grantingPaths(state: DomainState, trace: ReturnType<typeof evaluateAccess>, user: Guid): string {
    const granting = new Set(trace.layers.flatMap((layer) => layer.entries.filter((entry) => entry.applies && entry.effect === 'allow').map((entry) => entry.trustee)))
    const label = (guid: Guid) => String(state.objects[guid]?.rdn ?? guid)
    const paths = trace.paths.filter((item) => granting.has(item.trustee)).map((item) => item.path.filter((guid) => guid !== user).map(label).join(' → '))
    return [...new Set(paths)].join('; ') || 'a direct entry'
  }
}

export const case04: TicketDef = { id: CASE04_ID, tier: 1, seeds: [1, 2], build: buildCase04 }
