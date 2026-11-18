import { dispatch } from '../../engine/dispatch'
import type { Action } from '../../engine/types'
import { deriveDn } from '../../domain/dn'
import { findBySamAccountName } from '../../domain/indexes'
import type { DomainState, Guid } from '../../domain/types'
import { buildBaseDomain, OPERATOR_ID } from '../../fixtures/baseDomain'
import { accountCheck, eventExists, exactlyOneNewAccount, objectMatchesBaseline } from '../predicates'
import type { Attempt, CaseFixture, Debrief, Hint, Predicate, ScriptStep, TicketDef } from '../types'

/**
 * Case 03: HR sends a new-hire record. Every name, group, hint, route, and
 * predicate below comes from one Variant and the fixture IDs resolved from it.
 * The new account's GUID does not exist until the learner creates it, so the
 * predicates find it by the approved sign-in name. The GUI route uses the GUID
 * a create on the case base produces, which is deterministic.
 */
export const CASE03_ID = 'case03'
const ACCOUNT_CREATED_EVENT = 4720

interface Variant {
  hire: { given: string; sn: string; cn: string; sam: string; title: string; start: string; record: string }
  department: string
  ouId: string
  ouName: string
  groupIds: [string, string]
  namesakeId: string
  namesakeTitle: string
  /** True when the namesake lives in the same OU, so the CN 'Given Surname' is already taken there. */
  sameOu: boolean
  trapGroupId: string
  pronoun: { subject: string; possessive: string }
}

const VARIANTS: Record<number, Variant> = {
  1: {
    hire: { given: 'Tomas', sn: 'Lindqvist', cn: 'Tomas J. Lindqvist', sam: 'tolindqvist', title: 'Pharmacy Technician', start: 'Monday 19 January', record: 'HR-NH-3107' },
    department: 'Pharmacy', ouId: 'ou.pharmacy', ouName: 'Pharmacy', groupIds: ['group.pharmacyStaff', 'group.pharmacyNews'],
    namesakeId: 'user.tlindqvist', namesakeTitle: 'Pharmacist', sameOu: true, trapGroupId: 'group.pharmacyManagers',
    pronoun: { subject: 'he', possessive: 'his' },
  },
  2: {
    hire: { given: 'Maya', sn: 'Ali', cn: 'Maya Ali', sam: 'maali', title: 'Registered Nurse', start: 'Tuesday 20 January', record: 'HR-NH-3122' },
    department: 'Nursing', ouId: 'ou.nursing', ouName: 'Nursing', groupIds: ['group.nursingStaff', 'group.allStaff'],
    namesakeId: 'user.mali', namesakeTitle: 'Pharmacy Manager', sameOu: false, trapGroupId: 'group.pharmacyManagers',
    pronoun: { subject: 'she', possessive: 'her' },
  },
}

function variantFor(seed: number): Variant {
  const variant = VARIANTS[seed]
  if (!variant) throw new Error(`Case 03 has no seed ${seed}. Known seeds: ${Object.keys(VARIANTS).join(', ')}.`)
  return variant
}

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`

function buildCase03(seed: number): CaseFixture {
  const variant = variantFor(seed)
  const base = buildBaseDomain()
  const state0 = base.state
  const { hire } = variant
  const display = `${hire.given} ${hire.sn}`
  const sam = hire.sam
  const ou = base.ids[variant.ouId]!
  const ouDn = deriveDn(state0, ou)
  const groupNames = variant.groupIds.map((id) => state0.objects[base.ids[id]!]!.rdn) as [string, string]
  const namesake = base.ids[variant.namesakeId]!
  const namesakeSam = String(state0.objects[namesake]!.attrs.sAMAccountName)
  const namesakeDn = deriveDn(state0, namesake)
  const trapGroup = state0.objects[base.ids[variant.trapGroupId]!]!.rdn
  const usersDn = `CN=Users,${deriveDn(state0, Object.values(state0.objects).find((object) => object.objectClass === 'domain')!.guid)}`
  if (findBySamAccountName(state0, sam)) throw new Error(`Case 03 approved sign-in name ${sam} already exists in the base domain.`)

  // The GUI wizard sets the CN and display name from "Full name"; it has no change-at-next-logon box.
  const createAction: Action = {
    type: 'user.create', name: hire.cn, samAccountName: sam, parent: ou, enabled: true, credential: { policy: 'pass' },
    attrs: { givenName: hire.given, sn: hire.sn },
  }
  const preview = dispatch(state0, createAction, { actor: base.ids[OPERATOR_ID]!, source: 'gui', whatIf: false })
  const newUser = preview.ok ? findBySamAccountName(preview.state, sam) : undefined
  if (!newUser) throw new Error('Case 03 could not resolve the GUID of the new account on its base domain.')

  const ids: Record<string, Guid> = {
    operator: base.ids[OPERATOR_ID]!,
    ou,
    group1: base.ids[variant.groupIds[0]]!,
    group2: base.ids[variant.groupIds[1]]!,
    namesake,
    trapGroup: base.ids[variant.trapGroupId]!,
    newUser,
  }

  const newUserLine = `New-ADUser -Name ${quote(hire.cn)} -DisplayName ${quote(display)} -GivenName ${hire.given} -Surname ${hire.sn} -SamAccountName ${sam} -Title ${quote(hire.title)} -Department ${variant.department} -Path ${quote(ouDn)} -AccountPassword $pw -ChangePasswordAtLogon $true -Enabled $true`
  const reusable = `$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString; ${newUserLine}`
  const script: ScriptStep[] = [
    { code: `Get-ADUser -Filter "DisplayName -eq '${display}'" | Select-Object SamAccountName,DistinguishedName`, explain: `Find who already uses the display name ${display}. Expected here: ${namesakeSam}, the existing ${variant.namesakeTitle}. Leave that account alone.` },
    { code: `Get-ADUser -Filter "SamAccountName -eq '${sam}'"`, explain: `Confirm the approved sign-in name ${sam} is free. Expected here: no output.` },
    { code: `$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString`, explain: 'Type the initial password into the masked, simulated prompt. Only a policy verdict is kept; the text is discarded.' },
    { code: newUserLine, explain: `Create the account in ${ouDn} with the initial credential, the change-at-next-sign-in flag, and the account turned on.${variant.sameOu ? ` Names (CN) must be unique within an OU and ${display} is already taken here, so the name adds the middle initial while the display name stays ${display}.` : ''}` },
    { code: `Add-ADGroupMember -Identity ${groupNames[0]} -Members ${sam}`, explain: `Grant the first approved baseline group. -Identity is the group; -Members is the new account.` },
    { code: `Add-ADGroupMember -Identity ${groupNames[1]} -Members ${sam}`, explain: 'Grant the second approved baseline group.' },
    { code: `Get-ADPrincipalGroupMembership -Identity ${sam} | Select-Object Name`, explain: `Verify. Expected here: Domain Users (primary group), ${groupNames[0]}, and ${groupNames[1]}.` },
  ]

  const accountPath = (cn: string) => ['Directory', variant.ouName, cn]
  const gui = [
    { path: ['Directory', variant.ouName, 'New user…', 'Full name', 'Sign-in name (sAMAccountName)', 'Initial password (simulated, optional)', 'Turn on the account (needs a valid simulated password)', 'Create'], action: createAction },
    { path: [...accountPath(hire.cn), 'Properties', 'Account', 'User must change password at next sign-in', 'Apply'], action: { type: 'user.setAttrs', target: newUser, attrs: { changePasswordAtLogon: true } } as Action },
    { path: [...accountPath(hire.cn), 'Properties', 'Groups', 'Add to a group…', 'Add to group', groupNames[0], 'Apply'], action: { type: 'group.addMember', group: ids.group1, member: newUser } as Action },
    { path: [...accountPath(hire.cn), 'Properties', 'Groups', 'Add to a group…', 'Add to group', groupNames[1], 'Apply'], action: { type: 'group.addMember', group: ids.group2, member: newUser } as Action },
  ]

  const directGroups = (state: DomainState, guid: Guid) => state.memberships.filter((m) => m.member === guid).map((m) => state.objects[m.group]?.rdn ?? String(m.group)).sort()
  // With a duplicate, tell the learner how to recover: this slice has no Remove-ADUser (BACKLOG, revision phase).
  const oneAccountBase = exactlyOneNewAccount('oneAccount', `Exactly one new account exists, signed in as ${sam}`, sam)
  const oneAccount: Predicate = { ...oneAccountBase, posture: 'security', evaluate: (state, attempt) => {
    const out = oneAccountBase.evaluate(state, attempt)
    const created = Object.values(state.objects).filter((object) => object.objectClass === 'user' && !attempt.checkpoint.objects[object.guid]).length
    return created > 1 ? { ...out, observed: `${out.observed}. Use Reset this attempt to start the case again; the lab has no Remove-ADUser yet` } : out
  } }
  const predicates: Predicate[] = [
    oneAccount,
    { ...accountCheck('inOu', `The account is in the ${variant.ouName} OU`, sam, ouDn, (account, state) => { const parent = account.parent ? deriveDn(state, account.parent) : 'no container'; return [account.parent === ou, parent] }), posture: 'security' },
    { ...accountCheck('enabled', 'The account is turned on', sam, 'enabled', (account) => [account.attrs.enabled === true, account.attrs.enabled === true ? 'enabled' : 'disabled']), posture: 'availability' },
    { ...accountCheck('credential', 'An initial password is set (simulated)', sam, 'initial credential set', (account) => { const version = Number(account.attrs.credentialVersion ?? 0); return [version >= 1, version >= 1 ? 'initial credential set' : 'no credential set'] }), posture: 'availability' },
    { ...accountCheck('mustChange', `${hire.given} must choose a new password at first sign-in`, sam, 'change at next sign-in: on', (account) => [account.attrs.changePasswordAtLogon === true, `change at next sign-in: ${account.attrs.changePasswordAtLogon === true ? 'on' : 'off'}`]), posture: 'security' },
    { ...accountCheck('group1', `${hire.given} is in ${groupNames[0]}`, sam, groupNames[0], (account, state) => [directGroups(state, account.guid).includes(groupNames[0]), directGroups(state, account.guid).join(', ') || 'no groups']), posture: 'availability' },
    { ...accountCheck('group2', `${hire.given} is in ${groupNames[1]}`, sam, groupNames[1], (account, state) => [directGroups(state, account.guid).includes(groupNames[1]), directGroups(state, account.guid).join(', ') || 'no groups']), posture: 'availability' },
    { ...accountCheck('onlyBaseline', `No groups beyond the approved baseline (for example, not ${trapGroup})`, sam, [...groupNames].sort().join(', '), (account, state) => { const now = directGroups(state, account.guid); return [now.length === 2 && groupNames.every((name) => now.includes(name)), now.join(', ') || 'no groups'] }, 'control'), posture: 'security' },
    { ...objectMatchesBaseline('namesake', `The existing ${display} (${namesakeSam}) is unchanged`, namesake), posture: 'security' },
    eventExists('createEvent', `The account creation was recorded (event ${ACCOUNT_CREATED_EVENT})`, ACCOUNT_CREATED_EVENT),
  ]

  const hints: [Hint, Hint, Hint] = [
    { level: 1, content: `Two people can share a display name. The sign-in name is what must be unique. Which account already shows ${display}, which OU should the new account live in, and what state should it start in?` },
    { level: 2, content: [
      `Create ${sam} with New-ADUser and -Path ${quote(ouDn)}. Without -Path the account lands in ${usersDn}.`,
      `Use Read-Host -AsSecureString for -AccountPassword, and add -ChangePasswordAtLogon $true -Enabled $true.`,
      variant.sameOu ? `Names (CN) must be unique within an OU, and ${namesakeSam} already uses the name ${display} in OU=${variant.ouName}. So the new account needs a different name, while its display name can still be ${display}. Use -Name ${quote(hire.cn)} with -DisplayName ${quote(display)}. Do not rename or edit ${namesakeSam}.` : `${namesakeSam} in another OU already shows ${display}. That is a different person. Do not edit that account.`,
      `If the password is rejected, the account is still created but turned off. Do not create a second one: run Set-ADAccountPassword -Identity ${sam} -Reset with a new secure prompt, then Enable-ADAccount -Identity ${sam}.`,
      `Then add ${sam} to ${groupNames[0]} and ${groupNames[1]} with Add-ADGroupMember (-Identity is the group, -Members is the user).`,
    ].join(' ') },
    { level: 3, content: [
      ...script.map((step) => `# ${step.explain}\n${step.code}`),
      `GUI route: ${gui.map((step) => step.path.join(' → ')).join('\nthen ')}`,
      `Alternate: create with no -Path, then Move-ADObject -Identity ${quote(`CN=${hire.cn},${usersDn}`)} -TargetPath ${quote(ouDn)}.`,
    ].join('\n\n') },
  ]

  const debrief = (attempt: Attempt): Debrief => {
    const creates = attempt.history.filter((entry) => entry.action.type === 'user.create' && !entry.whatIf)
    const rejected = creates.some((entry) => entry.action.type === 'user.create' && entry.action.credential?.policy === 'fail')
    const resets = attempt.history.filter((entry) => entry.action.type === 'user.resetPassword' && !entry.whatIf).length
    const moved = attempt.history.some((entry) => entry.action.type === 'object.move' && !entry.whatIf)
    const results = Object.fromEntries(predicates.map((predicate) => [predicate.id, predicate.evaluate(attempt.state, attempt)]))
    const met = (id: string) => results[id]?.status === 'met'
    const how = [...new Set(creates.map((entry) => entry.source === 'gui' ? 'Active Directory Users and Computers' : 'PowerShell'))]
    const account = Object.values(attempt.state.objects).find((object) => object.objectClass === 'user' && String(object.attrs.sAMAccountName).toLowerCase() === sam)
    const change = creates.length === 0
      ? `No account for ${display} was created.`
      : `You created ${results.oneAccount!.observed} with ${how.join(' and ')}${moved ? ', then moved it' : ''}. It is in ${results.inOu!.observed}${met('enabled') ? ' and turned on' : ' but turned off'}.`
    const partial = rejected
      ? ` The first simulated password was rejected by policy, so the account was created without a credential and turned off.${resets && met('enabled') ? ' You recovered by resetting the password and turning the account on, without creating a duplicate.' : ' Recover with Set-ADAccountPassword -Reset and Enable-ADAccount on the same account; do not create a second one.'}`
      : ''
    return {
      change: change + partial,
      access: account
        ? `${display} (${sam}) has direct groups ${results.onlyBaseline!.observed}${met('onlyBaseline') ? ', exactly the HR baseline' : `; the HR baseline is ${groupNames.join(' and ')}`}. ${met('namesake') ? `${namesakeSam}, the existing ${display}, was not changed.` : `${namesakeSam}, the existing ${display}, was changed: ${results.namesake!.observed}.`}`
        : `No account named ${sam} exists, so nobody gained access. ${met('namesake') ? `${namesakeSam} was not changed.` : `${namesakeSam} was changed: ${results.namesake!.observed}.`}`,
      verification: met('credential') && met('mustChange')
        ? `An initial credential is set (simulated; the lab keeps only its version) and ${hire.given} must choose a new password at first sign-in, so a simulated sign-in today is refused until ${variant.pronoun.subject} changes it.`
        : `Check the credential state and the change-at-next-sign-in flag: ${results.credential!.observed}; ${results.mustChange!.observed}.`,
      reusableCommand: reusable,
      summary: `${display} can start on ${hire.start} with one account in ${variant.ouName}, the two baseline groups, and a first-sign-in password change, while ${namesakeSam} stays exactly as it was.`,
    }
  }

  return {
    ticketId: CASE03_ID,
    ids,
    introduce(state) {
      // The case adds nothing: the namesake and the departmental OU are already in the base domain.
      if (findBySamAccountName(state, sam)) throw new Error(`Case 03 must be introduced on a domain without ${sam}.`)
      return state
    },
    request: {
      sender: 'People Operations (HR)',
      priority: 'Normal',
      impact: `${display} starts as a ${hire.title} on ${hire.start} and cannot sign in or reach ${variant.department} resources without an account.`,
      sla: '1 business day (simulated)',
      title: `New hire: ${display}, ${hire.title}`,
      story: `HR record ${hire.record} confirms ${display} joins ${variant.department} on ${hire.start}. The hiring manager approved the sign-in name ${sam} and two baseline groups. ${display} will set ${variant.pronoun.possessive} own password at first sign-in.`,
      goal: `Create one working account for ${display} as ${sam} in the ${variant.ouName} OU with the two approved groups, without changing the existing ${display}.`,
      who: { person: `${display}, ${hire.title}`, account: sam },
      alreadyChecked: `HR verified ${display}'s identity and right to work. The hiring manager approved ${sam} because ${namesakeSam} is taken.`,
      clue: { text: `${hire.record}: ${display} · ${variant.department} · sign-in ${sam} · groups ${groupNames.join(', ')}` },
      careful: `${namesakeSam} (${namesakeDn}) is a different person, the existing ${variant.namesakeTitle}, with the same display name ${display}. Leave that account exactly as it is.${variant.sameOu ? ` That account already uses the name (CN) ${display} in OU=${variant.ouName}, and names must be unique within an OU, so the new account needs a different name (for example ${hire.cn}) even though its display name is the same.` : ''}`,
      glossary: [
        { term: 'Sign-in name (sAMAccountName)', definition: `The short name a person types to sign in, for example ${sam}. It must be unique in the domain.` },
        { term: 'Display name', definition: 'The name people see in address lists. Two accounts can share it.' },
        { term: 'Name (CN)', definition: 'The object name inside its OU. Two objects in the same OU cannot share it.' },
        { term: 'Organizational unit (OU)', definition: `A folder in the directory that holds accounts, for example ${variant.ouName}.` },
        { term: 'CN=Users', definition: 'The default container. New-ADUser puts an account there when you leave out -Path.' },
        { term: 'Change password at next sign-in', definition: 'A flag that makes the person choose their own password the first time they sign in.' },
        { term: 'Baseline groups', definition: 'The groups every new starter in a role receives, as approved in the HR record.' },
        { term: 'Event 4720', definition: 'The Windows security event recorded when a user account is created.' },
      ],
      needs: `${display} needs an account that works on ${hire.start}, with ${groupNames[0]} and ${groupNames[1]}.`,
      evidence: [
        `${hire.record} (HR): ${display}, ${hire.title}, ${variant.department}, start ${hire.start}.`,
        `Approved sign-in name: ${sam}. Approved baseline groups: ${groupNames[0]}, ${groupNames[1]}.`,
        `Directory note: ${namesakeSam} already has the display name ${display}.`,
      ],
    },
    responsibility: { account: sam, outcome: `One enabled ${sam} account in ${variant.ouName} with an initial simulated password, change at next sign-in, and the two baseline groups; ${namesakeSam} unchanged.` },
    predicates,
    hints,
    routes: { script, gui },
    wrongFixes: [
      {
        name: 'Create without -Path',
        steps: [
          script[2]!,
          { code: newUserLine.replace(` -Path ${quote(ouDn)}`, ''), explain: `Without -Path the account lands in ${usersDn}.` },
          script[4]!, script[5]!,
        ],
        expectUnmet: ['inOu'],
      },
      {
        name: `Edit the existing ${display}`,
        steps: [
          { code: `Set-ADUser -Identity ${namesakeSam} -DisplayName ${quote(`${display} (${variant.namesakeTitle})`)}`, explain: 'Changes another person\'s account to make room for the new one.' },
          ...script.slice(2, 6),
        ],
        expectUnmet: ['namesake'],
      },
      {
        name: 'Create the account but leave it turned off',
        steps: [
          script[2]!,
          { code: newUserLine.replace(' -Enabled $true', ''), explain: 'New accounts start turned off unless -Enabled $true is given.' },
          script[4]!, script[5]!,
        ],
        expectUnmet: ['enabled'],
      },
    ],
    debrief,
    transfer: {
      question: `Next week HR sends another starter whose name matches an existing employee, and the manager says "just copy the other person's groups". What do you do?`,
      choices: [
        "Copy the existing employee's groups to the new account",
        'Grant only the baseline groups in the approved HR record and identify both people by sign-in name',
        'Rename the existing employee so the names no longer clash',
      ],
      answer: 'Grant only the baseline groups in the approved HR record and identify both people by sign-in name',
      feedback: `A matching name says nothing about matching access. Copying groups can hand the new starter someone else's rights, and renaming the existing person changes an account nobody asked you to touch. Use the approved record, and tell people apart by sign-in name, not display name.`,
    },
  }
}

export const case03: TicketDef = { id: CASE03_ID, tier: 1, seeds: [1, 2], build: buildCase03 }
