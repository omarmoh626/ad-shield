import { dispatch } from '../../engine/dispatch'
import type { Action } from '../../engine/types'
import { findBySamAccountName } from '../../domain/indexes'
import type { DomainState, Guid } from '../../domain/types'
import { LOCKOUT_THRESHOLD } from '../../access/sessions'
import { buildBaseDomain, LAB_START, OPERATOR_ID } from '../../fixtures/baseDomain'
import { attrEquals, credentialVersionUnchanged, eventExists, freshSignInResult } from '../predicates'
import type { Attempt, CaseFixture, Debrief, Hint, Predicate, ScriptStep, TicketDef } from '../types'

/**
 * Case 01: a verified employee is locked out before shift change.
 * Every name, hint, route, and predicate below comes from one Variant and the
 * fixture IDs resolved from it, so the two seeds can never disagree.
 */
export const CASE01_ID = 'case01'

const MINUTE = 60_000
/** 06:54 UTC on the day after the lab clock start (LAB_START is 13:00 UTC). */
const LOCKOUT_TIME = LAB_START + (17 * 60 + 54) * MINUTE
const NEAR_MATCH_SIGN_IN = LOCKOUT_TIME - 14 * MINUTE
const TICKET_TIME = LOCKOUT_TIME + 8 * MINUTE
const LOCKOUT_EVENT = 4740
const UNLOCK_EVENT = 4767

interface Person { given: string; sn: string; sam: string }
interface Variant {
  targetId: string
  target: Person
  role: string
  department: string
  ouId: string
  ouName: string
  roleGroupId: string
  workstationId: string
  workstation: string
  nearMatch: Person
  pronoun: { subject: string; object: string; possessive: string }
}

const VARIANTS: Record<number, Variant> = {
  1: {
    targetId: 'user.mali', target: { given: 'Maya', sn: 'Ali', sam: 'mali' }, role: 'Pharmacy Technician', department: 'Pharmacy',
    ouId: 'ou.pharmacy', ouName: 'Pharmacy', roleGroupId: 'group.pharmacyStaff', workstationId: 'computer.pharmWs01', workstation: 'PHARM-WS01',
    nearMatch: { given: 'Maya', sn: 'Alli', sam: 'malli' }, pronoun: { subject: 'she', object: 'her', possessive: 'her' },
  },
  2: {
    targetId: 'user.kmorita', target: { given: 'Kenji', sn: 'Morita', sam: 'kmorita' }, role: 'Accountant', department: 'Finance',
    ouId: 'ou.finance', ouName: 'Finance', roleGroupId: 'group.financeStaff', workstationId: 'computer.finWs01', workstation: 'FIN-WS01',
    nearMatch: { given: 'Kenji', sn: 'Morito', sam: 'kmorito' }, pronoun: { subject: 'he', object: 'him', possessive: 'his' },
  },
}

const fullName = (person: Person) => `${person.given} ${person.sn}`
const clockTime = (time: number) => {
  const minutes = Math.floor(time / MINUTE) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function variantFor(seed: number): Variant {
  const variant = VARIANTS[seed]
  if (!variant) throw new Error(`Case 01 has no seed ${seed}. Known seeds: ${Object.keys(VARIANTS).join(', ')}.`)
  return variant
}

/** Builds the case scenario on top of the base domain through the normal action pipeline. */
function introduceVariant(variant: Variant, base: DomainState, baseIds: Record<string, Guid>): DomainState {
  const operator = baseIds[OPERATOR_ID]
  let state = base
  const apply = (action: Action) => {
    const result = dispatch(state, action, { actor: operator, source: 'system', whatIf: false })
    if (!result.ok) throw new Error(`Case 01 setup failed on ${action.type}: ${result.message ?? result.error}`)
    state = result.state
  }
  const advanceTo = (time: number) => { if (time > state.now) apply({ type: 'clock.advance', milliseconds: time - state.now }) }
  const target = baseIds[variant.targetId]
  const workstation = baseIds[variant.workstationId]

  apply({ type: 'user.setAttrs', target, attrs: { title: variant.role, department: variant.department } })
  apply({
    type: 'user.create', name: fullName(variant.nearMatch), samAccountName: variant.nearMatch.sam, parent: baseIds[variant.ouId], enabled: true, credential: { policy: 'pass' },
    attrs: { givenName: variant.nearMatch.given, sn: variant.nearMatch.sn, displayName: fullName(variant.nearMatch), title: variant.role, department: variant.department },
  })
  const nearMatch = findBySamAccountName(state, variant.nearMatch.sam)
  if (!nearMatch) throw new Error('Case 01 setup could not find the near-match account.')
  apply({ type: 'group.addMember', group: baseIds[variant.roleGroupId], member: nearMatch })

  // The coworker with the similar name signs in normally and keeps working.
  advanceTo(NEAR_MATCH_SIGN_IN)
  apply({ type: 'session.signIn', user: nearMatch, host: workstation })

  // Repeated wrong passwords at the target's own workstation trigger the lockout (4625 x N, then 4740).
  advanceTo(LOCKOUT_TIME)
  for (let attempt = 0; attempt < LOCKOUT_THRESHOLD; attempt++) apply({ type: 'session.signIn', user: target, host: workstation, badPassword: true })
  advanceTo(TICKET_TIME)
  return state
}

function buildCase01(seed: number): CaseFixture {
  const variant = variantFor(seed)
  const base = buildBaseDomain()
  // Resolve the GUID of the near-match once, from the same base the campaign uses.
  const preview = introduceVariant(variant, base.state, base.ids)
  const nearMatchGuid = findBySamAccountName(preview, variant.nearMatch.sam)!
  const ids: Record<string, Guid> = {
    operator: base.ids[OPERATOR_ID],
    target: base.ids[variant.targetId],
    nearMatch: nearMatchGuid,
    workstation: base.ids[variant.workstationId],
    ou: base.ids[variant.ouId],
    roleGroup: base.ids[variant.roleGroupId],
  }

  const name = fullName(variant.target)
  const sam = variant.target.sam
  const near = fullName(variant.nearMatch)
  const nearSam = variant.nearMatch.sam
  const { subject, object, possessive } = variant.pronoun
  const lockedAt = clockTime(LOCKOUT_TIME)
  const getUser = `Get-ADUser -Identity ${sam} -Properties LockedOut | Select-Object SamAccountName,Enabled,LockedOut`
  const reusable = `Unlock-ADAccount -Identity ${sam}`

  const script: ScriptStep[] = [
    { code: getUser, explain: 'Inspect the correct account. Expected here: Enabled=True, LockedOut=True.' },
    { code: `Unlock-ADAccount -Identity ${sam} -WhatIf`, explain: `Preview the target. ${variant.target.given} remains locked after this line.` },
    { code: reusable, explain: 'Apply the change. A successful unlock normally gives no console output.' },
    { code: getUser, explain: 'Read the account again. Expected here: Enabled=True, LockedOut=False.' },
  ]
  const guiPath = ['Directory', variant.ouName, name, 'Properties', 'Account', 'Unlock account', 'Apply']
  const gui = [{ path: guiPath, action: { type: 'user.unlock', target: ids.target } as Action }]

  const hints: [Hint, Hint, Hint] = [
    { level: 1, content: `A lockout is a temporary block after too many wrong passwords. It is different from a disabled account. Which two account properties tell you whether an unlock will help ${variant.target.given}?` },
    { level: 2, content: `Use Get-ADUser to read the account. LockedOut is not in the default output, so you must request it: -Properties LockedOut. Check Enabled and LockedOut for ${sam}, and make sure you have ${name}, not ${near} (${nearSam}).` },
    { level: 3, content: [
      ...script.map((step) => `# ${step.explain}\n${step.code}`),
      `GUI route: ${guiPath.join(' → ')}`,
      `Executable equivalent: ${reusable} (recorded as event ${UNLOCK_EVENT}).`,
    ].join('\n\n') },
  ]

  const unchangedWithMemberships = (id: string, label: string, guid: Guid, posture: Predicate['posture']): Predicate => ({
    id, label, kind: 'control', weight: 1, posture,
    evaluate: (state, attempt) => {
      const before = attempt.checkpoint
      const objectSame = JSON.stringify(before.objects[guid]) === JSON.stringify(state.objects[guid])
      const groups = (s: DomainState) => s.memberships.filter((m) => m.member === guid).map((m) => s.objects[m.group]?.rdn ?? String(m.group)).sort()
      const groupsSame = JSON.stringify(groups(before)) === JSON.stringify(groups(state))
      const observed = objectSame && groupsSame ? 'unchanged' : [objectSame ? '' : 'account changed', groupsSame ? '' : `groups now ${groups(state).join(', ') || 'none'}`].filter(Boolean).join('; ')
      return { status: objectSame && groupsSame ? 'met' : 'unmet', observed, required: 'unchanged since the ticket arrived' }
    },
  })
  const groupsUnchanged: Predicate = {
    id: 'groups', label: `${variant.target.given}'s group memberships are unchanged`, kind: 'control', weight: 1, posture: 'security',
    evaluate: (state, attempt) => {
      const groups = (s: DomainState) => s.memberships.filter((m) => m.member === ids.target).map((m) => s.objects[m.group]?.rdn ?? String(m.group)).sort().join(', ')
      const now = groups(state), before = groups(attempt.checkpoint)
      return { status: now === before ? 'met' : 'unmet', observed: now || 'none', required: before || 'none' }
    },
  }
  const predicates: Predicate[] = [
    { ...attrEquals('unlocked', `${variant.target.given}'s account is unlocked`, ids.target, 'lockedOut', false), posture: 'availability' },
    { ...attrEquals('enabled', `${variant.target.given}'s account is still turned on`, ids.target, 'enabled', true), posture: 'availability' },
    { ...freshSignInResult('signin', `${variant.target.given} can sign in again`, ids.target, true), posture: 'availability' },
    { ...credentialVersionUnchanged('credential', `${variant.target.given}'s password was not changed`, ids.target), posture: 'security' },
    groupsUnchanged,
    unchangedWithMemberships('nearMatch', `${near}'s account was not touched`, ids.nearMatch, 'security'),
    eventExists('unlockEvent', `The unlock was recorded (event ${UNLOCK_EVENT})`, UNLOCK_EVENT, ids.target),
  ]

  const debrief = (attempt: Attempt): Debrief => {
    const unlocks = attempt.history.filter((entry) => entry.action.type === 'user.unlock' && (entry.action as { target: Guid }).target === ids.target)
    const how = unlocks.map((entry) => entry.source === 'gui' ? 'Active Directory Users and Computers' : 'PowerShell')
    const checkpointSeq = Math.max(0, ...attempt.checkpoint.events.map((event) => event.seq))
    const freshSignIn = attempt.state.events.some((event) => event.seq > checkpointSeq && event.eventId === 4624 && event.target === ids.target)
    const unlockEvent = attempt.state.events.find((event) => event.seq > checkpointSeq && event.eventId === UNLOCK_EVENT && event.target === ids.target)
    return {
      change: unlocks.length
        ? `You unlocked ${name} (${sam}) with ${[...new Set(how)].join(' and ')}${unlockEvent ? ` at ${clockTime(unlockEvent.time)}, recorded as event ${UNLOCK_EVENT}` : ''}. ${possessive[0].toUpperCase()}${possessive.slice(1)} password, groups, and ${near}'s account stayed as they were.`
        : `No unlock of ${name} (${sam}) was recorded.`,
      access: `${name} regained the ability to sign in at ${variant.workstation}. Nobody gained or lost any other access.`,
      verification: freshSignIn
        ? `A simulated fresh sign-in for ${sam} succeeded (event 4624), and the account reads Enabled=True, LockedOut=False.`
        : `The account reads Enabled=True, LockedOut=False. Next time, also run a simulated fresh sign-in to prove ${subject} can get in.`,
      reusableCommand: reusable,
      summary: `${name} can start ${possessive} shift. You fixed the lockout without touching ${possessive} password or ${near}, and you can show ${object} the record.`,
    }
  }

  return {
    ticketId: CASE01_ID,
    ids,
    introduce(state) {
      const next = introduceVariant(variant, state, base.ids)
      if (findBySamAccountName(next, nearSam) !== ids.nearMatch) throw new Error('Case 01 must be introduced on the base domain it was built from.')
      return next
    },
    request: {
      sender: 'Service Desk',
      priority: 'High',
      impact: `${variant.target.given} cannot start ${possessive} ${variant.department.toLowerCase()} shift, and the handoff is waiting on ${object}.`,
      sla: '30 minutes (simulated)',
      title: `${name} is locked out before shift change`,
      story: `At ${lockedAt}, repeated wrong passwords at ${possessive} assigned workstation ${variant.workstation} locked ${name}'s account. The Service Desk called ${object} back and confirmed it was really ${object}. ${subject[0].toUpperCase()}${subject.slice(1)} needs to sign in before the shift handoff.`,
      goal: `Get ${name} signing in again before handoff, without changing ${possessive} password or anyone else's account.`,
      who: { person: `${name}, ${variant.role}`, account: sam },
      alreadyChecked: `The Service Desk verified ${name}'s identity with its callback procedure.`,
      clue: { text: `Account locked out at ${lockedAt} from ${variant.workstation}`, eventId: LOCKOUT_EVENT },
      careful: `${near} (${nearSam}) has a very similar name. That account is enabled and working. Leave it alone.`,
      glossary: [
        { term: 'Account lockout', definition: 'A temporary block that Active Directory applies after too many wrong passwords in a row. The password itself is still valid.' },
        { term: 'Sign-in name (sAMAccountName)', definition: `The short name a person types to sign in, for example ${sam}.` },
        { term: 'Enabled', definition: 'Whether the account is turned on. A disabled account cannot sign in even when it is not locked.' },
        { term: 'LockedOut', definition: 'A property that is True while the account is locked out. Get-ADUser shows it only when you ask for it with -Properties.' },
        { term: 'Organizational unit (OU)', definition: `A folder in the directory that holds accounts, for example ${variant.ouName}.` },
        { term: 'Event 4740', definition: 'The Windows security event recorded when an account is locked out.' },
        { term: 'Event 4767', definition: 'The Windows security event recorded when an account is unlocked.' },
        { term: 'Callback verification', definition: 'The Service Desk calls the person back on a number from the HR record to prove who they are.' },
        { term: '-WhatIf', definition: 'A switch that shows what a command would do without changing anything.' },
      ],
      needs: `${name} needs to sign in at ${variant.workstation} before the shift handoff.`,
      evidence: [
        `Security event ${LOCKOUT_EVENT} on DC01: ${sam} locked out at ${lockedAt}, caller computer ${variant.workstation}.`,
        `Callback note: the Service Desk called ${name} on the number in the HR record and verified ${possessive} identity.`,
      ],
    },
    responsibility: { account: sam, outcome: `${name} can sign in again, with ${possessive} password, groups, and ${near}'s account unchanged.` },
    predicates,
    hints,
    routes: { script, gui },
    wrongFixes: [{
      name: 'Password reset alone',
      steps: [{ code: `$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity ${sam} -Reset -NewPassword $pw`, explain: 'Resets the password. A reset does not clear a lockout.' }],
      expectUnmet: ['unlocked', 'signin', 'credential', 'unlockEvent'],
    }],
    debrief,
    transfer: {
      question: `If ${variant.target.given} could sign in but the ${variant.department} share said Access denied, what would you inspect next?`,
      choices: [
        'Unlock the account again',
        `${possessive[0].toUpperCase()}${possessive.slice(1)} group memberships and the share's permissions`,
        'Reset the password',
      ],
      answer: `${possessive[0].toUpperCase()}${possessive.slice(1)} group memberships and the share's permissions`,
      feedback: `A successful sign-in proves the account works. Access denied on a share is a permissions question: follow ${possessive} group memberships to the groups the share allows, at both the share layer and the file layer.`,
    },
  }
}

export const case01: TicketDef = { id: CASE01_ID, tier: 1, seeds: [1, 2], build: buildCase01 }
