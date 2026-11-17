import { createDomainState, createObject } from '../domain/graph'
import { buildIndexes } from '../domain/indexes'
import type { AttrValue, DomainState, Guid, Membership, ObjectClass } from '../domain/types'
import type { GroupCategory, GroupScope } from '../engine/groups'
import type { Ace as ResourceAce, Resource, Right } from '../access/types'
import type { ResourceAdminAce } from '../engine/handlers/acl'
import type { DelegationAce } from '../engine/types'

/**
 * The base domain `corp.contoso.local` for a fictional healthcare enterprise.
 * Every person, host, and group here is fictional. No password value exists
 * anywhere in this file. Accounts carry a credential version only.
 */
export interface BaseDomain {
  state: DomainState
  /** Stable fixture ID to object GUID. The same on every build. */
  ids: Record<string, Guid>
}

export const DOMAIN_DNS_NAME = 'corp.contoso.local'
/** Lab clock start: 2026-01-12 13:00:00 UTC. A fixed value, never the real clock. */
export const LAB_START = 1768222800000
/** Fixture ID of the analyst's operator account (DECISIONS D5). */
export const OPERATOR_ID = 'user.operator'
/** Fixture ID of the analyst's admin workstation, where the lab console runs (T04 D9). */
export const ADMIN_WORKSTATION_ID = 'computer.itAdm01'

const WELL_KNOWN_FIRST_RID = 512
const FIRST_ORDINARY_RID = 1100
const RID = { domainUsers: 513, domainComputers: 515, domainControllers: 516 } as const

interface UserSeed { id: string; ou: string; given: string; sn: string; sam: string; title: string; department: string }

const USERS: readonly UserSeed[] = [
  { id: 'user.mali', ou: 'ou.pharmacy', given: 'Maya', sn: 'Ali', sam: 'mali', title: 'Pharmacy Manager', department: 'Pharmacy' },
  { id: 'user.tlindqvist', ou: 'ou.pharmacy', given: 'Tomas', sn: 'Lindqvist', sam: 'tlindqvist', title: 'Pharmacist', department: 'Pharmacy' },
  { id: 'user.pnair', ou: 'ou.pharmacy', given: 'Priya', sn: 'Nair', sam: 'pnair', title: 'Pharmacy Technician', department: 'Pharmacy' },
  { id: 'user.dwhitfield', ou: 'ou.finance', given: 'Dana', sn: 'Whitfield', sam: 'dwhitfield', title: 'Finance Manager', department: 'Finance' },
  { id: 'user.kmorita', ou: 'ou.finance', given: 'Kenji', sn: 'Morita', sam: 'kmorita', title: 'Accountant', department: 'Finance' },
  { id: 'user.lferreira', ou: 'ou.finance', given: 'Lucia', sn: 'Ferreira', sam: 'lferreira', title: 'Payroll Analyst', department: 'Finance' },
  { id: 'user.aokoye', ou: 'ou.nursing', given: 'Amara', sn: 'Okoye', sam: 'aokoye', title: 'Charge Nurse', department: 'Nursing' },
  { id: 'user.bcastillo', ou: 'ou.nursing', given: 'Ben', sn: 'Castillo', sam: 'bcastillo', title: 'Registered Nurse', department: 'Nursing' },
  { id: OPERATOR_ID, ou: 'ou.it', given: 'Riley', sn: 'Chen', sam: 'rchen.ops', title: 'IAM Analyst', department: 'IT' },
  { id: 'user.nhaddad', ou: 'ou.it', given: 'Noor', sn: 'Haddad', sam: 'nhaddad', title: 'Systems Administrator', department: 'IT' },
  { id: 'user.ehartmann', ou: 'ou.executive', given: 'Evelyn', sn: 'Hartmann', sam: 'ehartmann', title: 'Chief Executive Officer', department: 'Executive' },
]

interface GroupSeed { id: string; parent: string; name: string; scope: GroupScope; category: GroupCategory; description: string }

/** Built-in groups. They are created first so they receive the well-known RIDs 512 to 516 in order. */
const BUILTIN_GROUPS: readonly GroupSeed[] = [
  { id: 'group.domainAdmins', parent: 'cn.users', name: 'Domain Admins', scope: 'Global', category: 'Security', description: 'Designated administrators of the domain' },
  { id: 'group.domainUsers', parent: 'cn.users', name: 'Domain Users', scope: 'Global', category: 'Security', description: 'All domain users' },
  { id: 'group.domainGuests', parent: 'cn.users', name: 'Domain Guests', scope: 'Global', category: 'Security', description: 'All domain guests' },
  { id: 'group.domainComputers', parent: 'cn.users', name: 'Domain Computers', scope: 'Global', category: 'Security', description: 'All workstations and servers joined to the domain' },
  { id: 'group.domainControllers', parent: 'cn.users', name: 'Domain Controllers', scope: 'Global', category: 'Security', description: 'All domain controllers in the domain' },
]

const GROUPS: readonly GroupSeed[] = [
  // Role groups: global security groups that hold people.
  { id: 'group.pharmacyStaff', parent: 'ou.roleGroups', name: 'GG-Pharmacy-Staff', scope: 'Global', category: 'Security', description: 'Role group: Pharmacy staff' },
  { id: 'group.pharmacyManagers', parent: 'ou.roleGroups', name: 'GG-Pharmacy-Managers', scope: 'Global', category: 'Security', description: 'Role group: Pharmacy managers' },
  { id: 'group.financeStaff', parent: 'ou.roleGroups', name: 'GG-Finance-Staff', scope: 'Global', category: 'Security', description: 'Role group: Finance staff' },
  { id: 'group.financeManagers', parent: 'ou.roleGroups', name: 'GG-Finance-Managers', scope: 'Global', category: 'Security', description: 'Role group: Finance managers' },
  { id: 'group.nursingStaff', parent: 'ou.roleGroups', name: 'GG-Nursing-Staff', scope: 'Global', category: 'Security', description: 'Role group: Nursing staff' },
  { id: 'group.itHelpdesk', parent: 'ou.it', name: 'GG-IT-Helpdesk', scope: 'Global', category: 'Security', description: 'Role group: IAM analysts with delegated rights' },
  // Resource groups: domain local security groups that are granted permissions.
  { id: 'group.pharmacyShareRead', parent: 'ou.resourceGroups', name: 'DL-Pharmacy-Share-Read', scope: 'DomainLocal', category: 'Security', description: 'Resource group: read access to the Pharmacy share' },
  { id: 'group.pharmacyShareModify', parent: 'ou.resourceGroups', name: 'DL-Pharmacy-Share-Modify', scope: 'DomainLocal', category: 'Security', description: 'Resource group: modify access to the Pharmacy share' },
  { id: 'group.financeShareRead', parent: 'ou.resourceGroups', name: 'DL-Finance-Share-Read', scope: 'DomainLocal', category: 'Security', description: 'Resource group: read access to the Finance share' },
  { id: 'group.financeShareModify', parent: 'ou.resourceGroups', name: 'DL-Finance-Share-Modify', scope: 'DomainLocal', category: 'Security', description: 'Resource group: modify access to the Finance share' },
  // Enterprise-wide groups.
  { id: 'group.allStaff', parent: 'ou.groups', name: 'UG-All-Staff', scope: 'Universal', category: 'Security', description: 'Every staff role group in the enterprise' },
  { id: 'group.pharmacyNews', parent: 'ou.groups', name: 'DG-Pharmacy-News', scope: 'Global', category: 'Distribution', description: 'Mail distribution list. It grants no access.' },
]

/** [group, member] pairs by fixture ID. A primary group is never listed here. */
const MEMBERSHIPS: readonly (readonly [string, string])[] = [
  ['group.domainAdmins', 'user.administrator'],
  ['group.pharmacyStaff', 'user.mali'],
  ['group.pharmacyStaff', 'user.tlindqvist'],
  ['group.pharmacyStaff', 'user.pnair'],
  ['group.pharmacyManagers', 'user.mali'],
  ['group.financeStaff', 'user.dwhitfield'],
  ['group.financeStaff', 'user.kmorita'],
  ['group.financeStaff', 'user.lferreira'],
  ['group.financeManagers', 'user.dwhitfield'],
  ['group.nursingStaff', 'user.aokoye'],
  ['group.nursingStaff', 'user.bcastillo'],
  ['group.itHelpdesk', OPERATOR_ID],
  ['group.pharmacyShareRead', 'group.pharmacyStaff'],
  ['group.pharmacyShareModify', 'group.pharmacyManagers'],
  ['group.financeShareRead', 'group.financeStaff'],
  ['group.financeShareModify', 'group.financeManagers'],
  ['group.allStaff', 'group.pharmacyStaff'],
  ['group.allStaff', 'group.financeStaff'],
  ['group.allStaff', 'group.nursingStaff'],
  ['group.allStaff', 'group.itHelpdesk'],
  ['group.pharmacyNews', 'user.mali'],
]

/**
 * Delegated rights of the operator's role group (DECISIONS D5): users and
 * groups in the department OUs, users in the default Users container, and the
 * role and resource groups. Nothing over Domain Admins or the Executive OU.
 * Protected objects carry `adminCount: 1` and stay outside every delegation.
 */
const DELEGATIONS: readonly (readonly [string, readonly ObjectClass[]])[] = [
  ['ou.pharmacy', ['user', 'group']],
  ['ou.finance', ['user', 'group']],
  ['ou.nursing', ['user', 'group']],
  ['cn.users', ['user']],
  ['ou.groups', ['group']],
]

interface ShareSeed { id: string; name: string; description: string; grants: readonly (readonly [string, Right])[] }

/**
 * Department shares on FS01. Each follows account, then global role group, then
 * domain local resource group, then permission. Both the share layer and the
 * file layer grant the resource groups, so both layers must allow.
 */
const SHARES: readonly ShareSeed[] = [
  { id: 'share.pharmacy', name: 'Pharmacy', description: 'Simulated Pharmacy department share', grants: [['group.pharmacyShareRead', 'read'], ['group.pharmacyShareModify', 'modify']] },
  { id: 'share.finance', name: 'Finance', description: 'Simulated Finance department share', grants: [['group.financeShareRead', 'read'], ['group.financeShareModify', 'modify']] },
]

export function buildBaseDomain(seed = 1): BaseDomain {
  let state = createDomainState(seed, LAB_START)
  const ids: Record<string, Guid> = {}

  const add = (id: string, objectClass: ObjectClass, rdn: string, parent: string | null, attrs: Record<string, AttrValue> = {}, securityPrincipal = false): void => {
    if (id in ids) throw new Error(`Duplicate fixture ID ${id}`)
    if (parent !== null && !(parent in ids)) throw new Error(`Unknown fixture parent ${parent}`)
    const created = createObject(state, { objectClass, rdn, parent: parent === null ? null : ids[parent], attrs: { whenCreated: LAB_START, ...attrs }, securityPrincipal })
    state = created.state
    ids[id] = created.object.guid
  }
  const addGroup = (seedRow: GroupSeed): void => add(seedRow.id, 'group', seedRow.name, seedRow.parent, { sAMAccountName: seedRow.name, groupScope: seedRow.scope, groupCategory: seedRow.category, description: seedRow.description, ...(seedRow.id === 'group.domainAdmins' ? { adminCount: 1 } : {}) }, true)
  const addUser = (id: string, parent: string, name: string, sam: string, attrs: Record<string, AttrValue>): void => add(id, 'user', name, parent, {
    displayName: name,
    sAMAccountName: sam,
    userPrincipalName: `${sam}@${DOMAIN_DNS_NAME}`,
    enabled: true,
    lockedOut: false,
    badPwdCount: 0,
    credentialVersion: 1,
    pwdLastSet: LAB_START,
    primaryGroupID: RID.domainUsers,
    ...attrs,
  }, true)
  const addComputer = (id: string, parent: string, name: string, attrs: Record<string, AttrValue>): void => add(id, 'computer', name, parent, {
    sAMAccountName: `${name}$`,
    dNSHostName: `${name}.${DOMAIN_DNS_NAME}`,
    enabled: true,
    primaryGroupID: RID.domainComputers,
    ...attrs,
  }, true)

  add('domain', 'domain', DOMAIN_DNS_NAME, null)
  add('cn.users', 'container', 'Users', 'domain', { description: 'Default container for upgraded user accounts' })
  add('cn.computers', 'container', 'Computers', 'domain', { description: 'Default container for upgraded computer accounts' })
  add('ou.domainControllers', 'organizationalUnit', 'Domain Controllers', 'domain')
  add('ou.pharmacy', 'organizationalUnit', 'Pharmacy', 'domain')
  add('ou.finance', 'organizationalUnit', 'Finance', 'domain')
  add('ou.nursing', 'organizationalUnit', 'Nursing', 'domain')
  add('ou.it', 'organizationalUnit', 'IT', 'domain')
  add('ou.executive', 'organizationalUnit', 'Executive', 'domain')
  add('ou.workstations', 'organizationalUnit', 'Workstations', 'domain')
  add('ou.servers', 'organizationalUnit', 'Servers', 'domain')
  add('ou.serviceAccounts', 'organizationalUnit', 'Service Accounts', 'domain')
  add('ou.groups', 'organizationalUnit', 'Groups', 'domain')
  add('ou.roleGroups', 'organizationalUnit', 'Role Groups', 'ou.groups')
  add('ou.resourceGroups', 'organizationalUnit', 'Resource Groups', 'ou.groups')

  state = { ...state, ids: { ...state.ids, nextRid: WELL_KNOWN_FIRST_RID } }
  BUILTIN_GROUPS.forEach(addGroup)
  state = { ...state, ids: { ...state.ids, nextRid: FIRST_ORDINARY_RID } }

  addUser('user.administrator', 'cn.users', 'Administrator', 'Administrator', { description: 'Built-in account for administering the domain', adminCount: 1 })
  for (const user of USERS) {
    addUser(user.id, user.ou, `${user.given} ${user.sn}`, user.sam, { givenName: user.given, sn: user.sn, title: user.title, department: user.department })
  }
  addUser('user.svcPharmRx', 'ou.serviceAccounts', 'svc-pharmrx', 'svc-pharmrx', {
    description: 'Service account for the simulated pharmacy dispensing service',
    isServiceAccount: true,
    servicePrincipalName: [`HTTP/pharmrx.${DOMAIN_DNS_NAME}`],
  })

  addComputer('computer.dc01', 'ou.domainControllers', 'DC01', { isDomainController: true, primaryGroupID: RID.domainControllers, operatingSystem: 'Windows Server 2022' })
  addComputer('computer.fs01', 'ou.servers', 'FS01', { operatingSystem: 'Windows Server 2022', description: 'File server for department shares' })
  addComputer('computer.pharmWs01', 'ou.workstations', 'PHARM-WS01', { operatingSystem: 'Windows 11 Enterprise' })
  addComputer('computer.finWs01', 'ou.workstations', 'FIN-WS01', { operatingSystem: 'Windows 11 Enterprise' })
  addComputer('computer.nursWs01', 'ou.workstations', 'NURS-WS01', { operatingSystem: 'Windows 11 Enterprise' })

  GROUPS.forEach(addGroup)

  // Added after the groups so the GUIDs and RIDs of earlier fixture objects stay the same.
  addComputer(ADMIN_WORKSTATION_ID, 'ou.workstations', 'IT-ADM01', { operatingSystem: 'Windows 11 Enterprise', description: 'Analyst admin workstation. The lab console runs here.', isAnalystWorkstation: true })

  const resolve = (id: string): Guid => {
    if (!(id in ids)) throw new Error(`Unknown fixture ID ${id}`)
    return ids[id]
  }
  const memberships: Membership[] = MEMBERSHIPS.map(([group, member]) => ({ group: resolve(group), member: resolve(member) }))
  const delegations: DelegationAce[] = DELEGATIONS.map(([scope, objectClasses]) => ({ kind: 'delegation', trustee: resolve('group.itHelpdesk'), scope: resolve(scope), objectClasses: [...objectClasses] }))

  const fileServer = resolve('computer.fs01')
  const resources: Record<string, Resource> = {}
  const shareAces: ResourceAce[] = []
  const shareAdmins: ResourceAdminAce[] = []
  for (const share of SHARES) {
    resources[share.id] = { id: share.id, name: share.name, shareLayer: 'share', fileLayer: 'file', host: fileServer, path: `\\\\FS01.${DOMAIN_DNS_NAME}\\${share.name}`, description: share.description }
    for (const [group, right] of share.grants) {
      for (const layer of ['share', 'file'] as const) shareAces.push({ resourceId: share.id, layer, trustee: resolve(group), right, effect: 'allow' })
    }
    // The helpdesk may change permissions on the department shares (DECISIONS D4).
    shareAdmins.push({ kind: 'resourceAdmin', trustee: resolve('group.itHelpdesk'), resourceId: share.id })
  }

  // Every fixture object carries rev 1, so the finished fixture is revision 1.
  const finished = { ...state, revision: 1, memberships, resources, aces: [...delegations, ...shareAces, ...shareAdmins] }
  return { state: { ...finished, indexes: buildIndexes(finished) }, ids }
}
