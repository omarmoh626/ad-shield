import { dispatch } from '../../engine/dispatch'
import type { Action } from '../../engine/types'
import { findBySamAccountName } from '../../domain/indexes'
import type { DomainState, Guid } from '../../domain/types'
import { buildBaseDomain, OPERATOR_ID } from '../../fixtures/baseDomain'
import { buildContext } from '../../access/token'
import { evaluateAccess } from '../../access/trace'
import { directUserEntries, effectiveAccessVia, memberOf, noDirectAccessEntry, notMemberOf, sessionAccessVia } from '../predicates'
import type { Attempt, CaseFixture, Debrief, Hint, Predicate, ScriptStep, TicketDef } from '../types'

export const CASE02_ID = 'case02'
const VARIANTS = {
  1: { user: 'user.pnair', sam: 'pnair', host: 'computer.pharmWs01', hostName: 'PHARM-WS01', control: 'user.aokoye', controlName: 'aokoye', evidence: 'Finance manager approval F-2048' },
  2: { user: 'user.tlindqvist', sam: 'tlindqvist', host: 'computer.pharmWs01', hostName: 'PHARM-WS01', control: 'user.aokoye', controlName: 'aokoye', evidence: 'Finance manager approval F-2193' },
} as const

function buildCase02(seed: number): CaseFixture {
  const variant = VARIANTS[seed as keyof typeof VARIANTS]
  if (!variant) throw new Error(`Case 02 has no seed ${seed}. Known seeds: 1, 2.`)
  const base = buildBaseDomain()
  const ids: Record<string, Guid> = {
    operator: base.ids[OPERATOR_ID], user: base.ids[variant.user], host: base.ids[variant.host],
    control: base.ids[variant.control], role: base.ids['group.financeStaff'], writeRole: base.ids['group.financeManagers'],
    resourceRole: base.ids['group.financeShareRead'],
  }
  let sessionId = ''
  const introduce = (initial: DomainState) => {
    let state = initial
    const apply = (action: Action) => {
      const out = dispatch(state, action, { actor: ids.operator, source: 'system', whatIf: false })
      if (!out.ok) throw new Error(`Case 02 setup failed on ${action.type}: ${out.message ?? out.error}`)
      state = out.state
    }
    // Existing session captures the pre-approval token: adding the role later cannot refresh it.
    apply({ type: 'session.signIn', user: ids.user, host: ids.host })
    const session = state.sessions[state.sessions.length - 1] as { id: string }
    sessionId = session.id
    return state
  }
  const preview = introduce(base.state)
  const principal = findBySamAccountName(preview, variant.sam)
  if (principal !== ids.user) throw new Error('Case 02 account ID does not match its fixture seed.')
  const personName = String(preview.objects[ids.user]?.attrs.displayName ?? variant.sam)
  const groupName = 'GG-Finance-Staff'
  const code = `Add-ADGroupMember -Identity ${groupName} -Members ${variant.sam}`
  const guiPath = ['Directory', 'Pharmacy', personName, 'Properties', 'Groups', 'Add to a group…', 'Apply']
  const script: ScriptStep[] = [
    { code: `Get-SimTicket`, explain: `Read the approval record. ${variant.evidence} approves read access for ${personName} on Finance.` },
    { code, explain: 'Add the person to the approved global Finance role. The nested domain-local read group supplies share access.' },
    { code: `Test-SimSignIn -Identity ${variant.sam} -ComputerName ${variant.hostName}`, explain: 'Issue a simulated fresh sign-in with current group memberships.' },
    { code: `Test-SimResourceAccess -Identity ${variant.sam} -Resource Finance -Right Read`, explain: 'Check read access for a simulated fresh sign-in.' },
    { code: `Test-SimResourceAccess -Identity ${variant.sam} -Resource Finance -Right Write`, explain: 'Confirm the approved read role does not grant write.' },
  ]
  const predicates: Predicate[] = [
    { ...memberOf('approvedRole', 'Approved Finance role group supplies access', ids.user, ids.role), posture: 'security' },
    { ...effectiveAccessVia('freshRead', 'Fresh simulated sign-in can read the Finance share', ids.user, 'share.finance', 'read', true, 'role'), posture: 'availability' },
    { ...effectiveAccessVia('freshWriteDenied', 'Fresh simulated sign-in is denied write access', ids.user, 'share.finance', 'write', false, 'none'), posture: 'security' },
    { ...sessionAccessVia('existingSession', 'Existing session keeps its old group snapshot', sessionId, 'share.finance', 'read', false, 'none'), kind: 'evidence', posture: 'security' },
    { ...notMemberOf('notWriteRole', 'User is not in the broader Finance manager role', ids.user, ids.writeRole), posture: 'security' },
    { ...effectiveAccessVia('controlDenied', 'Control user remains denied Finance read access', ids.control, 'share.finance', 'read', false, 'none'), posture: 'security' },
    { ...noDirectAccessEntry('noDirectGrant', 'No applying direct user entry grants Finance access', ids.user, 'share.finance', 'any'), posture: 'security' },
  ]
  const hints: [Hint, Hint, Hint] = [
    { level: 1, content: `The approval names ${personName}, Finance, and read. What role group should connect ${variant.sam} to the resource permission? Check both access and the existing session.` },
    { level: 2, content: `Use the approved global role GG-Finance-Staff. Add the user to the group, then test a simulated fresh sign-in for read and write. The pre-existing session keeps its old group snapshot. Never add a direct user permission or the manager write role.` },
    { level: 3, content: [...script.map((step) => `# ${step.explain}\n${step.code}`), `GUI route: ${guiPath.join(' → ')}`].join('\n\n') },
  ]
  const debrief = (attempt: Attempt): Debrief => {
    const added = attempt.history.some((entry) => entry.action.type === 'group.addMember' && entry.action.group === ids.role && entry.action.member === ids.user)
    const checked = attempt.state.events.some((event) => event.eventId === 4624 && event.target === ids.user)
    const readTrace = evaluateAccess(attempt.state, buildContext(attempt.state, ids.user), 'share.finance', 'read')
    const writeTrace = evaluateAccess(attempt.state, buildContext(attempt.state, ids.user), 'share.finance', 'write')
    const directEntry = directUserEntries(attempt.state, ids.user, 'share.finance')[0]
    const inWriteRole = attempt.state.memberships.some((membership) => membership.member === ids.user && membership.group === ids.writeRole)
    const allowed = (value: boolean) => value ? 'allowed' : 'denied'
    return {
      change: added ? `${personName} (${variant.sam}) joined GG-Finance-Staff under ${variant.evidence}.` : `No approved Finance role change for ${variant.sam} was recorded.`,
      access: `Current simulated fresh access: read ${allowed(readTrace.allowed)}, write ${allowed(writeTrace.allowed)}. ${directEntry ? `An applying direct user entry is present on the ${directEntry.layer} layer (${directEntry.effect} ${directEntry.right}).` : 'No applying direct user entry is present.'} ${inWriteRole ? 'The user is in GG-Finance-Managers.' : 'The user is not in GG-Finance-Managers.'} The existing session retains its earlier group snapshot.`,
      verification: checked ? `A simulated fresh sign-in was recorded on ${variant.hostName}; check read and write separately.` : `Run a simulated fresh sign-in, then check Finance read and write separately.`,
      reusableCommand: code,
      summary: `${personName}: simulated Finance read ${allowed(readTrace.allowed)}, write ${allowed(writeTrace.allowed)}; direct entry ${directEntry ? 'present' : 'absent'}; write role ${inWriteRole ? 'present' : 'absent'}.`,
    }
  }
  return {
    ticketId: CASE02_ID, ids, introduce,
    request: {
      sender: 'Finance Manager', priority: 'Normal', impact: `${personName} cannot review the month-end Finance workbook.` , sla: '4 hours (simulated)',
      title: `Approve read access to the Finance share`,
      story: `${variant.evidence} names ${personName} (${variant.sam}), the Finance share, and read access only. The manager needs the workbook reviewed before close.`,
      goal: `Grant ${personName} read access to Finance through the approved role path, without write access or a direct user grant.`,
      who: { person: personName, account: variant.sam }, alreadyChecked: `${variant.evidence} is approved and names the user, resource, and read right.`,
      clue: { text: `${variant.evidence}: ${variant.sam} · Finance · Read` }, careful: `An existing simulated session keeps its old group snapshot. ${variant.controlName} is a control user; leave that account denied.`,
      glossary: [
        { term: 'Role group', definition: 'A security group for people with the same job role.' },
        { term: 'Resource group', definition: 'A group granted permission to a resource.' },
        { term: 'Fresh sign-in', definition: 'A simulated sign-in that builds a new security context from current memberships.' },
        { term: 'Existing session', definition: 'A simulated security context that keeps the groups captured when it was issued.' },
        { term: 'Access trace', definition: 'The modeled permission result, including the path that supplied access.' },
      ],
      needs: `${personName} needs read access to the simulated Finance share.`,
      evidence: [`${variant.evidence} approves ${variant.sam} for Finance read only.`, `Control check: ${variant.controlName} must remain denied.`],
    },
    responsibility: { account: variant.sam, outcome: 'Fresh simulated sign-in reads Finance and is denied write through the approved role group; control user remains denied.' },
    predicates, hints, routes: { script, gui: [{ path: guiPath, action: { type: 'group.addMember', group: ids.role, member: ids.user } }] },
    wrongFixes: [
      { name: 'Add user to Finance manager write role', steps: [{ code: `Add-ADGroupMember -Identity GG-Finance-Managers -Members ${variant.sam}`, explain: 'The broader manager role grants write and fails least privilege.' }], expectUnmet: ['freshWriteDenied', 'notWriteRole'] },
      { name: 'Add direct user permission', steps: [{ code: `Add-SimResourcePermission -Resource Finance -Identity ${variant.sam} -Right Read`, explain: 'A direct permission bypasses the approved role group.' }], expectUnmet: ['noDirectGrant'] },
    ], debrief,
    transfer: { question: 'A user joins the approved role group but an old session still gets denied. What should you check?', choices: ['Use the existing session again', 'Run a simulated fresh sign-in and inspect its access trace', 'Grant the user direct access'], answer: 'Run a simulated fresh sign-in and inspect its access trace', feedback: 'The existing session keeps its old group snapshot. A simulated fresh sign-in builds a new context from current memberships; the access trace shows whether the role path supplies access.' },
  }
}

export const case02: TicketDef = { id: CASE02_ID, tier: 1, seeds: [1, 2], build: buildCase02 }
