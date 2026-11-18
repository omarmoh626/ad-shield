import { dispatch } from '../../engine/dispatch'
import type { Action } from '../../engine/types'
import { findBySamAccountName } from '../../domain/indexes'
import { deriveDn } from '../../domain/dn'
import { hostNameOf } from '../../engine/handlers/common'
import type { DomainState, Guid } from '../../domain/types'
import { buildBaseDomain, OPERATOR_ID } from '../../fixtures/baseDomain'
import { attrEquals, freshSignInResult } from '../predicates'
import type { Attempt, CaseFixture, Debrief, Hint, Predicate, ScriptStep, TicketDef } from '../types'

export const CASE05_ID = 'case05'
const FAILED_SIGN_IN = 4625

const VARIANTS = {
  1: { target: { given: 'Lena', sn: 'Ortiz', sam: 'lortiz' }, control: { given: 'Lena', sn: 'Ortez', sam: 'lortez' }, record: 'VM-4418', endDate: 'Friday 23 January' },
  2: { target: { given: 'Marcus', sn: 'Bell', sam: 'mbell.ext' }, control: { given: 'Marcus', sn: 'Belle', sam: 'mbelle.ext' }, record: 'HR-9072', endDate: 'Tuesday 27 January' },
} as const

function buildCase05(seed: number): CaseFixture {
  const variant = VARIANTS[seed as keyof typeof VARIANTS]
  if (!variant) throw new Error(`Case 05 has no seed ${seed}. Known seeds: 1, 2.`)
  const base = buildBaseDomain()
  const ids: Record<string, Guid> = {
    operator: base.ids[OPERATOR_ID]!,
    target: '' as Guid,
    control: '' as Guid,
    approvedGroup: base.ids['group.pharmacyStaff']!,
    unapprovedGroup: base.ids['group.pharmacyManagers']!,
    workstation: base.ids['computer.pharmWs01']!, // the contractor's assigned workstation (D2)
  }
  const create = (person: { given: string; sn: string; sam: string }): Action => ({
    type: 'user.create', name: `${person.given} ${person.sn}`, samAccountName: person.sam,
    parent: base.ids['ou.pharmacy']!, enabled: true, credential: { policy: 'pass' },
    attrs: { givenName: person.given, sn: person.sn, displayName: `${person.given} ${person.sn}`, title: 'Contractor', department: 'Pharmacy' },
  })
  const introduce = (initial: DomainState) => {
    let state = initial
    const apply = (action: Action) => {
      const result = dispatch(state, action, { actor: ids.operator, source: 'system', whatIf: false })
      if (!result.ok) throw new Error(`Case 05 setup failed on ${action.type}: ${result.message ?? result.error}`)
      state = result.state
    }
    apply(create(variant.target))
    apply(create(variant.control))
    const target = findBySamAccountName(state, variant.target.sam)
    const control = findBySamAccountName(state, variant.control.sam)
    if (!target || !control) throw new Error('Case 05 setup could not resolve contractor accounts.')
    ids.target = target
    ids.control = control
    apply({ type: 'group.addMember', group: ids.approvedGroup, member: target })
    apply({ type: 'group.addMember', group: ids.approvedGroup, member: control })
    apply({ type: 'group.addMember', group: ids.unapprovedGroup, member: target })
    return state
  }
  const setup = introduce(base.state)
  const targetName = String(setup.objects[ids.target]!.attrs.displayName)
  const controlName = String(setup.objects[ids.control]!.attrs.displayName)
  const groupName = String(setup.objects[ids.approvedGroup]!.rdn)
  const otherGroupName = String(setup.objects[ids.unapprovedGroup]!.rdn)
  const sam = variant.target.sam
  const controlSam = variant.control.sam
  const targetPath = ['Directory', 'Pharmacy', targetName]
  // D2: Windows records 4625 on the computer where the sign-in was attempted, not on a domain controller.
  const workstationName = String(setup.objects[ids.workstation]!.rdn)
  const RECORDING_HOST = hostNameOf(setup.objects[ids.workstation]!)
  const checklistSignIn = `Test ${variant.target.given}'s sign-in · simulated`
  const disable = `Disable-ADAccount -Identity ${sam}`
  const remove = `Remove-ADGroupMember -Identity ${groupName} -Members ${sam} -Confirm:$false`
  const script: ScriptStep[] = [
    { code: 'Get-SimTicket', explain: `Read record ${variant.record}. It approves removal of ${groupName} and disabling ${sam} after ${variant.endDate}.` },
    { code: `Get-ADUser -Identity ${sam} -Properties Enabled,primaryGroupID | Select-Object SamAccountName,Enabled,primaryGroupID`, explain: 'Confirm the exact account and note its primary group before making changes.' },
    { code: remove, explain: `Remove only the approved ${groupName} access. -Confirm:$false answers the simulated confirmation prompt.` },
    { code: disable, explain: 'Disable the contractor account so a new simulated sign-in is denied.' },
    { code: `Test-SimSignIn -Identity ${sam} -ComputerName ${workstationName}`, explain: `Attempt a new simulated sign-in at the contractor's assigned workstation. Expected: denied and recorded as event 4625 in that workstation's Security log (${RECORDING_HOST}).` },
    { code: `Get-ADUser -Identity ${sam} -Properties Enabled,primaryGroupID | Select-Object SamAccountName,Enabled,primaryGroupID`, explain: 'Verify the account is disabled and its primary group is unchanged.' },
  ]
  const gui = [
    { path: [...targetPath, 'Properties', 'Groups', `Remove from ${groupName}`, 'Apply'], action: { type: 'group.removeMember', group: ids.approvedGroup, member: ids.target } as Action },
    { path: [...targetPath, 'Actions', 'Disable account…', 'Apply'], action: { type: 'user.setEnabled', target: ids.target, enabled: false } as Action },
    { path: ['What done looks like', checklistSignIn], action: { type: 'session.signIn', user: ids.target, host: ids.workstation } as Action },
  ]
  const retainedHistory: Predicate = {
    id: 'history', label: 'The contractor account and its audit history are retained', kind: 'evidence',
    evaluate: (state, attempt) => {
      const exists = Boolean(state.objects[ids.target])
      const account = attempt.checkpoint.objects[ids.target]
      const accountDn = account ? deriveDn(attempt.checkpoint, ids.target) : ''
      const before = attempt.checkpoint.events.filter((event) => event.target === ids.target || event.data.memberSid === account?.sid || event.data.memberDn === accountDn)
      const kept = before.filter((event) => state.events.some((current) => JSON.stringify(current) === JSON.stringify(event))).length
      const retained = kept === before.length
      return { status: exists && retained ? 'met' : 'unmet', observed: `${exists ? 'account retained' : 'account missing'}; ${kept}/${before.length} prior account and membership events retained`, required: 'account exists and every pre-attempt account and membership event remains in the log' }
    },
  }
  const primaryGroup: Predicate = {
    id: 'primaryGroup', label: 'The account primary group is unchanged', kind: 'control', posture: 'security',
    evaluate: (state, attempt) => {
      const before = attempt.checkpoint.objects[ids.target]?.attrs.primaryGroupID
      const now = state.objects[ids.target]?.attrs.primaryGroupID
      return { status: Object.is(before, now) ? 'met' : 'unmet', observed: String(now ?? 'missing'), required: String(before ?? 'missing') }
    },
  }
  const controlUntouched: Predicate = {
    id: 'control', label: `${controlName} stays enabled with access unchanged`, kind: 'control', posture: 'security',
    evaluate: (state, attempt) => {
      const before = attempt.checkpoint.objects[ids.control]
      const now = state.objects[ids.control]
      const groups = (s: DomainState) => s.memberships.filter((item) => item.member === ids.control).map((item) => item.group).sort()
      const changed: string[] = []
      if (!now) changed.push('account missing')
      else if (before) {
        if (before.rdn !== now.rdn) changed.push(`name ${before.rdn} → ${now.rdn}`)
        if (before.parent !== now.parent) changed.push('parent container changed')
        for (const key of [...new Set([...Object.keys(before.attrs), ...Object.keys(now.attrs)])].sort()) {
          if (JSON.stringify(before.attrs[key]) !== JSON.stringify(now.attrs[key])) changed.push(`${key} changed`)
        }
      }
      const beforeGroups = groups(attempt.checkpoint), nowGroups = groups(state)
      if (JSON.stringify(beforeGroups) !== JSON.stringify(nowGroups)) changed.push(`groups ${beforeGroups.map((id) => attempt.checkpoint.objects[id]?.rdn).join(', ') || 'none'} → ${nowGroups.map((id) => state.objects[id]?.rdn).join(', ') || 'none'}`)
      const same = changed.length === 0
      return { status: same ? 'met' : 'unmet', observed: now ? `${now.attrs.enabled === true ? 'enabled' : 'disabled'}${changed.length ? `; ${changed.join('; ')}` : '; no attribute, parent, or group changes'}` : changed.join('; '), required: 'enabled; same attributes, parent, and groups as ticket arrival' }
    },
  }
  const predicates: Predicate[] = [
    { ...attrEquals('disabled', `${targetName}'s account is disabled`, ids.target, 'enabled', false), posture: 'security' },
    { ...notInGroup('approvedAccess', `${targetName} no longer has approved ${groupName} access`, ids.target, ids.approvedGroup), posture: 'security' },
    { ...freshSignInResult('signin', 'A new simulated sign-in is denied', ids.target, false), posture: 'security' },
    {
      id: 'failedSignInEvent', label: `Denied sign-in is recorded on ${RECORDING_HOST} (event ${FAILED_SIGN_IN})`, kind: 'evidence',
      evaluate: (state, attempt) => {
        const floor = Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq))
        const event = state.events.find((item) => item.seq > floor && item.eventId === FAILED_SIGN_IN && item.target === ids.target && item.host === RECORDING_HOST)
        return { status: event ? 'met' : 'unmet', observed: event ? `event ${FAILED_SIGN_IN} on ${event.host}` : `no event ${FAILED_SIGN_IN} on ${RECORDING_HOST} after sequence ${floor}`, required: `event ${FAILED_SIGN_IN} on ${RECORDING_HOST}` }
      },
    },
    { ...notInUnapprovedGroups('unapprovedAccess', `${targetName} keeps all non-approved group memberships`, ids.target, ids.approvedGroup), posture: 'security' },
    primaryGroup,
    retainedHistory,
    controlUntouched,
  ]
  const hints: [Hint, Hint, Hint] = [
    { level: 1, content: `The vendor engagement ends ${variant.endDate}. Which account does record ${variant.record} name, and which access does it approve for removal?` },
    { level: 2, content: `Remove ${sam} from ${groupName}, then disable the account. Keep its primary group and audit history. ${controlName} (${controlSam}) is a similar-name control; leave it enabled and in its group.` },
    { level: 3, content: [...script.map((step) => `# ${step.explain}\n${step.code}`), `GUI route: ${gui.map((step) => step.path.join(' → ')).join('\nThen: ')}`].join('\n\n') },
  ]
  const debrief = (attempt: Attempt): Debrief => {
    const disabled = attempt.state.objects[ids.target]?.attrs.enabled === false
    const removed = !attempt.state.memberships.some((item) => item.member === ids.target && item.group === ids.approvedGroup)
    const denied = attempt.state.events.some((event) => event.eventId === FAILED_SIGN_IN && event.target === ids.target && event.host === RECORDING_HOST)
    const initialPrimary = attempt.checkpoint.objects[ids.target]?.attrs.primaryGroupID
    const currentPrimary = attempt.state.objects[ids.target]?.attrs.primaryGroupID
    const primary = initialPrimary === currentPrimary ? 'primary group retained' : `primary group changed from ${String(initialPrimary ?? 'missing')} to ${String(currentPrimary ?? 'missing')}`
    const nonApprovedRemoved = attempt.history.some((entry) => entry.action.type === 'group.removeMember' && entry.action.member === ids.target && entry.action.group !== ids.approvedGroup)
    const sequence = attempt.history.map((entry) => {
      const action = entry.action
      if (action.type === 'group.removeMember' && action.member === ids.target) return `removed ${attempt.checkpoint.objects[action.group]?.rdn ?? 'a group'}`
      if (action.type === 'user.setEnabled' && action.target === ids.target && !action.enabled) return 'disabled account'
      return undefined
    }).filter((item): item is string => Boolean(item))
    return {
      change: disabled && removed ? `You ${sequence.length ? sequence.join(', then ') : 'made changes to'} ${targetName} (${sam}). ${nonApprovedRemoved ? `A non-approved group (${otherGroupName}) was also removed. ` : ''}Its account and audit history remain.` : `Offboarding is incomplete for ${targetName} (${sam}).`,
      access: `${targetName}: ${removed ? 'approved Pharmacy access removed' : 'approved Pharmacy access remains'}; ${primary}. ${controlName} remains ${attempt.state.objects[ids.control]?.attrs.enabled === true ? 'enabled' : 'disabled'} with its access unchanged.`,
      verification: denied ? `A simulated new sign-in was denied on ${RECORDING_HOST} and recorded as event ${FAILED_SIGN_IN}.` : `Run a simulated new sign-in for ${sam}; confirm denial on ${RECORDING_HOST}.`,
      reusableCommand: `${remove}; ${disable}`,
      summary: `${targetName} is ${disabled ? 'disabled' : 'enabled'}; approved access ${removed ? 'is removed' : 'remains'}; ${primary}; ${controlName} is ${attempt.state.objects[ids.control]?.attrs.enabled === true ? 'enabled' : 'disabled'}.`,
    }
  }
  return {
    ticketId: CASE05_ID, ids, introduce,
    request: {
      sender: 'Vendor Management', priority: 'High', impact: `${targetName}'s engagement ends ${variant.endDate}; retained access would leave a former contractor able to reach Pharmacy resources.`, sla: '4 hours (simulated)',
      title: `Offboard ${targetName} at contract end`,
      story: `Vendor record ${variant.record} confirms ${targetName} (${sam}) finishes on ${variant.endDate}. Remove the listed Pharmacy role access and turn off the account after the final shift.`,
      goal: `Disable ${sam} and remove only the approved access, while retaining the account, its primary group, its audit history, and the similar contractor's access.`,
      who: { person: targetName, account: sam }, alreadyChecked: `Vendor Management verified record ${variant.record} and the engagement end date.`,
      clue: { text: `${variant.record}: engagement ends ${variant.endDate}; approved removal: ${groupName}` },
      careful: `${controlName} (${controlSam}) has a similar name. Keep that account enabled with access unchanged. Do not remove ${otherGroupName}; it is not on the approved list.`,
      glossary: [
        { term: 'Contractor offboarding', definition: 'Removing approved access and disabling an account when a vendor engagement ends.' },
        { term: 'Primary group', definition: 'The account’s built-in primary group setting. It is separate from ordinary group membership rows.' },
        { term: 'Audit history', definition: 'The retained record of simulated changes and sign-in events.' },
        { term: 'Event 4625', definition: 'A Windows security event for a failed sign-in, recorded on the computer where the sign-in was attempted.' },
        { term: 'Confirmation', definition: 'A simulated prompt that asks before a group membership is removed.' },
      ],
      needs: `${targetName}'s account must no longer sign in or retain the approved Pharmacy role access after ${variant.endDate}.`,
      evidence: [`Vendor record ${variant.record}: ${sam} engagement ends ${variant.endDate}.`, `Assigned workstation: ${workstationName}.`, `Approved-for-removal list from the record: ${groupName}.`, `Similar-name check: ${controlName} (${controlSam}) is a separate active contractor.`],
    },
    responsibility: { account: sam, outcome: `Disable ${sam}, remove approved ${groupName} access, deny a new sign-in, and retain the account, primary group, history, and control contractor.` },
    predicates, hints, routes: { script, gui },
    wrongFixes: [
      { name: 'Disable only', steps: [{ code: disable, explain: 'Disables the account but leaves approved group access assigned.' }], expectUnmet: ['approvedAccess'] },
      { name: 'Remove unapproved manager group', steps: [{ code: `Remove-ADGroupMember -Identity ${otherGroupName} -Members ${sam} -Confirm:$false`, explain: 'This group is not on the approved-for-removal list.' }, { code: disable, explain: 'Disables the account but leaves approved access assigned.' }], expectUnmet: ['approvedAccess', 'unapprovedAccess'] },
      { name: 'Act on similar contractor', steps: [{ code: `Disable-ADAccount -Identity ${controlSam}`, explain: 'Disables the control account instead of the contractor named in the record.' }], expectUnmet: ['disabled', 'control'] },
    ],
    debrief,
    transfer: { question: 'A contractor account is disabled, but the approved role still appears in its memberships. What remains to do?', choices: [`Remove the account from ${groupName}`, 'Delete the account and its history', 'Change its primary group'], answer: `Remove the account from ${groupName}`, feedback: 'Disabling blocks a new sign-in. Removing the approved role membership completes access cleanup while preserving the account and its history.' },
  }
}

function notInGroup(id: string, label: string, member: Guid, group: Guid): Predicate {
  return { id, label, kind: 'outcome', evaluate: (state) => {
    const present = state.memberships.some((item) => item.member === member && item.group === group)
    return { status: present ? 'unmet' : 'met', observed: present ? 'membership remains' : 'membership removed', required: 'membership removed' }
  } }
}

function notInUnapprovedGroups(id: string, label: string, member: Guid, approvedGroup: Guid): Predicate {
  return { id, label, kind: 'control', evaluate: (state, attempt) => {
    const directGroups = (value: DomainState) => value.memberships.filter((item) => item.member === member && item.group !== approvedGroup).map((item) => item.group).sort()
    const before = directGroups(attempt.checkpoint)
    const now = directGroups(state)
    const same = JSON.stringify(before) === JSON.stringify(now)
    const names = now.map((group) => state.objects[group]?.rdn ?? String(group))
    return { status: same ? 'met' : 'unmet', observed: same ? names.join(', ') || 'no non-approved memberships changed' : `now ${names.join(', ') || 'none'}`, required: 'all non-approved group memberships unchanged since ticket arrival' }
  } }
}

export const case05: TicketDef = { id: CASE05_ID, tier: 1, seeds: [1, 2], build: buildCase05 }
