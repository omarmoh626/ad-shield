import { deriveDn } from '../../../../domain/dn'
import { getObjectByDn } from '../../../../domain/graph'
import type { DirObject, DomainState, Guid, ObjectClass } from '../../../../domain/types'
import type { CmdletSpec, ParameterSet } from '../../../registry'
import { PsError, isObject, type PsObject, type PsScriptBlock, type PsValue } from '../../../values'
import { compileFilter } from '../filter'
import { resolveIdentity } from '../identity'

export const USER = 'Microsoft.ActiveDirectory.Management.ADUser', GROUP = 'Microsoft.ActiveDirectory.Management.ADGroup', OBJECT = 'Microsoft.ActiveDirectory.Management.ADObject'
export const MEMBER = 'Microsoft.ActiveDirectory.Management.ADPrincipal'
const identitySet: ParameterSet[] = [{ name: 'Identity', parameters: [{ name: 'Identity', type: 'object', position: 0, mandatory: true }, { name: 'Properties', type: 'string[]' }] }]
const filterSet: ParameterSet[] = [{ name: 'Filter', parameters: [{ name: 'Filter', type: 'object', mandatory: true }, { name: 'Properties', type: 'string[]' }, { name: 'SearchBase', type: 'string' }, { name: 'SearchScope', type: 'string', values: ['Base', 'OneLevel', 'Subtree'] }] }]
const attrsFor = (o: DirObject, key: string): unknown => {
  const known: Record<string, unknown> = { Name: o.rdn, DistinguishedName: '', ObjectGUID: o.guid, SID: o.sid ?? '', ObjectClass: o.objectClass, SamAccountName: o.attrs.sAMAccountName ?? '', Enabled: o.attrs.enabled ?? false }
  return Object.entries(known).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] ?? Object.entries(o.attrs).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1]
}
export function adValue(state: DomainState, o: DirObject, type: string, properties?: string[]): PsObject {
  const defaults = type === USER ? ['DistinguishedName', 'Enabled', 'GivenName', 'Name', 'ObjectClass', 'ObjectGUID', 'SamAccountName', 'SID', 'Surname', 'UserPrincipalName'] : type === GROUP ? ['DistinguishedName', 'GroupCategory', 'GroupScope', 'Name', 'ObjectClass', 'ObjectGUID', 'SamAccountName', 'SID'] : ['DistinguishedName', 'Name', 'ObjectClass', 'ObjectGUID', 'SID']
  const requested = properties?.includes('*') ? [...new Set([...defaults, 'LockedOut', ...Object.keys(o.attrs)])] : properties ? [...new Set([...defaults, ...properties])] : undefined
  const names = requested ?? defaults
  const values: Record<string, PsValue> = {}
  for (const name of names) {
    let value = attrsFor(o, name)
    if (name.toLowerCase() === 'distinguishedname') value = deriveDn(state, o)
    if (name.toLowerCase() === 'lockedout' && !properties?.some((p) => p.toLowerCase() === 'lockedout' || p === '*')) continue
    if (value !== undefined) values[name] = value as PsValue
  }
  return { typeName: type, text: o.rdn, properties: values, ref: o.guid } as PsObject
}
const classes: Record<string, ObjectClass[]> = { user: ['user'], group: ['group'], object: ['user','computer','group','organizationalUnit','container','domain','serviceAccount'] }
function identityObjects(state: DomainState, value: PsValue | undefined, accepted: ObjectClass[]): DirObject[] {
  if (value === undefined) return []
  const values = Array.isArray(value) ? value : [value]
  const found: DirObject[] = []
  for (const entry of values) {
    const raw = isObject(entry) && 'ref' in entry && entry.ref ? String(entry.ref) : typeof entry === 'string' ? entry : String(entry)
    const guid = resolveIdentity(state, raw, accepted)
    if (typeof guid !== 'string') throw guid.error
    found.push(state.objects[guid])
  }
  return found
}
function compileAdFilter(value: PsValue | undefined): ((read: (name: string) => PsValue) => boolean) | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return compileFilter(value)
  if (isObject(value) && value.typeName === 'System.Management.Automation.ScriptBlock') {
    const source = (value as PsScriptBlock).block as PsScriptBlock['block'] & { source?: string }
    if (source.source === undefined) throw new PsError('Filter script block has no preserved source text.')
    return compileFilter(source.source)
  }
  throw new PsError('Filter must be a quoted expression or script block.')
}
function searched(state: DomainState, inv: Parameters<CmdletSpec['run']>[0], accepted: ObjectClass[], matches?: (read: (name: string) => PsValue) => boolean): DirObject[] {
  if (inv.params.Identity !== undefined) return identityObjects(state, inv.params.Identity, accepted)
  let base: DirObject | undefined
  const searchBase = inv.params.SearchBase
  if (typeof searchBase === 'string') base = getObjectByDn(state, searchBase)
  if (typeof searchBase === 'string' && !base) throw new PsError(`Search base '${searchBase}' was not found.`, { identity: searchBase })
  const scope = String(inv.params.SearchScope ?? 'Subtree').toLowerCase()
  const descendants = (o: DirObject): boolean => {
    if (!base) return true
    if (scope === 'base') return o.guid === base.guid
    if (scope === 'subtree' && o.guid === base.guid) return true
    let parent = o.parent
    if (scope === 'onelevel' && parent === base.guid) return true
    while (parent !== null) { if (parent === base.guid) return scope === 'subtree'; parent = state.objects[parent]?.parent ?? null }
    return false
  }
  return Object.values(state.objects).filter((o) => accepted.includes(o.objectClass) && descendants(o) && (!matches || matches((name) => (attrsFor(o, name) ?? null) as PsValue)))
}
function spec(name: string, type: string, accepted: ObjectClass[], display: string[], synopsis: string): CmdletSpec {
  return { name, module: 'ActiveDirectory', parameterSets: [...identitySet, ...filterSet], defaultParameterSet: 'Identity', inputTypes: [], outputType: type, defaultDisplay: display, supportsWhatIf: false, confirmImpact: 'none', help: { synopsis, examples: [{ code: name === 'Get-ADUser' ? "Get-ADUser -Identity mali -Properties LockedOut" : `${name} -Filter '*'`, explain: `Reads simulated directory ${name.replace('Get-AD','').toLowerCase()} records.` }] }, *run(inv, rt) {
    const match = compileAdFilter(inv.params.Filter)
    const objects = inv.parameterSet === 'Identity' ? identityObjects(rt.state, inv.params.Identity, accepted) : searched(rt.state, inv, accepted, match)
    const props = inv.params.Properties as string[] | undefined
    for (const o of objects) yield adValue(rt.state, o, type, props)
  } }
}

const getUser = spec('Get-ADUser', USER, ['user'], ['Name','SamAccountName','Enabled'], 'Gets simulated Active Directory user accounts.')
const getGroup = spec('Get-ADGroup', GROUP, ['group'], ['Name','SamAccountName','GroupScope','GroupCategory'], 'Gets simulated Active Directory groups.')
const getObject = spec('Get-ADObject', OBJECT, classes.object, ['Name','ObjectClass','DistinguishedName'], 'Gets basic simulated directory objects.')

const getGroupMember: CmdletSpec = {
  name: 'Get-ADGroupMember', module: 'ActiveDirectory', parameterSets: [
    { name: 'Default', parameters: [{ name: 'Identity', type: 'object', position: 0, mandatory: true }, { name: 'Recursive', type: 'switch' }] },
  ], inputTypes: [], outputType: MEMBER, defaultDisplay: ['Name','ObjectClass','SamAccountName'], supportsWhatIf: false, confirmImpact: 'none',
  help: { synopsis: 'Gets direct or recursively nested members of a simulated group.', examples: [{ code: 'Get-ADGroupMember -Identity GG-Pharmacy-Staff -Recursive', explain: 'Lists simulated members through nested groups.' }] },
  *run(inv, rt) {
    const roots = identityObjects(rt.state, inv.params.Identity, ['group']), found = new Set<Guid>(), visit = (guid: Guid): void => {
      for (const member of rt.state.indexes.membersByGroup[String(guid)] ?? []) if (!found.has(member)) { found.add(member); if (inv.params.Recursive) { const o = rt.state.objects[member]; if (o?.objectClass === 'group') visit(member) } }
    }
    roots.forEach((o) => visit(o.guid))
    for (const guid of found) {
      const object = rt.state.objects[guid]
      if (inv.params.Recursive && object.objectClass === 'group') continue
      yield adValue(rt.state, object, MEMBER, ['Name','ObjectClass','ObjectGUID','SamAccountName','SID'])
    }
  },
}

const principalGroups: CmdletSpec = {
  name: 'Get-ADPrincipalGroupMembership', module: 'ActiveDirectory', parameterSets: [{ name: 'Default', parameters: [{ name: 'Identity', type: 'object', position: 0, mandatory: true }] }], inputTypes: [], outputType: GROUP, defaultDisplay: ['Name','SamAccountName','GroupScope','GroupCategory'], supportsWhatIf: false, confirmImpact: 'none',
  help: { synopsis: 'Gets simulated groups that directly contain a principal.', examples: [{ code: 'Get-ADPrincipalGroupMembership -Identity mali', explain: 'Lists the principal’s direct simulated group memberships.' }] },
  *run(inv, rt) {
    for (const o of identityObjects(rt.state, inv.params.Identity, classes.object)) {
      const groups = new Set(rt.state.indexes.groupsByMember[String(o.guid)] ?? [])
      const primaryGroupId = o.attrs.primaryGroupID
      if (typeof primaryGroupId === 'number') for (const group of Object.values(rt.state.objects)) {
        if (group.objectClass === 'group' && group.sid?.endsWith(`-${primaryGroupId}`)) groups.add(group.guid)
      }
      for (const group of groups) yield adValue(rt.state, rt.state.objects[group], GROUP)
    }
  },
}

const searchAccount: CmdletSpec = {
  name: 'Search-ADAccount', module: 'ActiveDirectory', parameterSets: [{ name: 'Default', parameters: [
    { name: 'AccountInactive', type: 'switch' }, { name: 'TimeSpan', type: 'string' }, { name: 'DateTime', type: 'string' }, { name: 'LockedOut', type: 'switch' }, { name: 'AccountDisabled', type: 'switch' }, { name: 'UsersOnly', type: 'switch' },
  ] }], inputTypes: [], outputType: OBJECT, defaultDisplay: ['Name','ObjectClass','SamAccountName','Enabled'], supportsWhatIf: false, confirmImpact: 'none',
  help: { synopsis: 'Searches simulated accounts by inactive, locked, or disabled status.', examples: [{ code: 'Search-ADAccount -AccountInactive -TimeSpan 90.00:00:00 -UsersOnly', explain: 'Finds users inactive for at least 90 days.' }, { code: 'Search-ADAccount -LockedOut', explain: 'Finds locked simulated accounts.' }] },
  *run(inv, rt) {
    const inactive = inv.params.AccountInactive === true
    if (inactive && (inv.params.TimeSpan === undefined) === (inv.params.DateTime === undefined)) throw new PsError('Search-ADAccount -AccountInactive requires exactly one of -TimeSpan or -DateTime.')
    const duration = inv.params.TimeSpan === undefined ? undefined : parseTimeSpan(String(inv.params.TimeSpan))
    const cutoff = inv.params.DateTime !== undefined ? parseUtcDateTime(String(inv.params.DateTime)) : rt.state.now - (duration ?? 0)
    for (const o of Object.values(rt.state.objects)) {
      if (!['user','computer','serviceAccount'].includes(o.objectClass)) continue
      if (inv.params.UsersOnly && o.objectClass !== 'user') continue
      if (inv.params.LockedOut && o.attrs.lockedOut !== true) continue
      if (inv.params.AccountDisabled && o.attrs.enabled !== false) continue
      if (inactive && (typeof o.attrs.lastLogonTimestamp !== 'number' || o.attrs.lastLogonTimestamp > cutoff)) continue
      yield adValue(rt.state, o, OBJECT, ['Name','ObjectClass','ObjectGUID','SamAccountName','Enabled'])
    }
  },
}

function parseTimeSpan(value: string): number {
  const bareDays = /^(\d+)$/u.exec(value)
  if (bareDays) return Number(bareDays[1]) * 86400000
  const days = /^(\d+)\.(\d{2}):(\d{2}):(\d{2})$/u.exec(value)
  if (days && Number(days[2]) < 24 && Number(days[3]) < 60 && Number(days[4]) < 60) return Number(days[1]) * 86400000 + Number(days[2]) * 3600000 + Number(days[3]) * 60000 + Number(days[4]) * 1000
  const clock = /^(\d{1,2}):(\d{2}):(\d{2})$/u.exec(value)
  if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60 && Number(clock[3]) < 60) return Number(clock[1]) * 3600000 + Number(clock[2]) * 60000 + Number(clock[3]) * 1000
  throw new PsError('TimeSpan must be days, d.hh:mm:ss, or hh:mm:ss. Try: Get-Help Search-ADAccount -Examples', { help: 'Get-Help Search-ADAccount -Examples' })
}

function parseUtcDateTime(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/u.exec(value)
  if (!match) throw new PsError('DateTime must be YYYY-MM-DD or an ISO timestamp with an explicit timezone. Try: Get-Help Search-ADAccount -Examples', { help: 'Get-Help Search-ADAccount -Examples' })
  const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0', msText = '0', zone = 'Z'] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText), hour = Number(hourText), minute = Number(minuteText), second = Number(secondText)
  const millis = Number(msText.padEnd(3, '0'))
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) throw new PsError('DateTime is outside the supported range. Try: Get-Help Search-ADAccount -Examples', { help: 'Get-Help Search-ADAccount -Examples' })
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (day > daysInMonth) throw new PsError('DateTime is not a valid calendar date. Try: Get-Help Search-ADAccount -Examples', { help: 'Get-Help Search-ADAccount -Examples' })
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millis)
  if (zone === 'Z') return utc
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/u.exec(zone) as RegExpExecArray
  if (Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59) throw new PsError('DateTime timezone offset is invalid. Try: Get-Help Search-ADAccount -Examples', { help: 'Get-Help Search-ADAccount -Examples' })
  const offset = (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3])) * 60000 * (offsetMatch[1] === '+' ? 1 : -1)
  return utc - offset
}

export const adGetCmdlets: CmdletSpec[] = [getUser, getGroup, getObject, getGroupMember, principalGroups, searchAccount]
