import { findBySamAccountName } from '../../../../domain/indexes'
import type { AttrValue, DomainState, Guid } from '../../../../domain/types'
import type { CmdletSpec, Invocation, ParameterSpec } from '../../../registry'
import type { Runtime } from '../../../runtime'
import { PsError, isHashtable, isSecure, toText, type PsValue } from '../../../values'
import { resolveIdentity } from '../identity'
import { CONTAINER_CLASSES, USER, apply, childDn, dnOf, identityLabel, passThru, passThruValue, resolveTarget, targetsOf, usersContainer, AD_INPUT } from './common'

/** Named parameters that map one to one onto a directory attribute. */
const ATTRIBUTE_PARAMS: Record<string, string> = {
  GivenName: 'givenName',
  Surname: 'sn',
  DisplayName: 'displayName',
  Description: 'description',
  Department: 'department',
  Title: 'title',
  Office: 'physicalDeliveryOfficeName',
  EmailAddress: 'mail',
  UserPrincipalName: 'userPrincipalName',
}

const attributeParams: ParameterSpec[] = Object.keys(ATTRIBUTE_PARAMS).map((name) => ({ name, type: 'string' as const }))
const changeAtLogon: ParameterSpec = { name: 'ChangePasswordAtLogon', type: 'bool', help: 'With $true the user must choose a new password at the next simulated sign-in.' }

function attributesFrom(inv: Invocation): Record<string, AttrValue> {
  const attrs: Record<string, AttrValue> = {}
  for (const [param, attr] of Object.entries(ATTRIBUTE_PARAMS)) {
    const value = inv.params[param]
    if (typeof value === 'string') attrs[attr] = value
  }
  // Simplification recorded in SUPPORT.md: the flag is its own attribute instead of pwdLastSet = 0.
  if (typeof inv.params.ChangePasswordAtLogon === 'boolean') attrs.changePasswordAtLogon = inv.params.ChangePasswordAtLogon
  return attrs
}

/** Where a new account goes: -Path, else the current AD: drive location, else CN=Users. */
export function newUserContainer(rt: Runtime, path: PsValue | undefined): Guid {
  const state: DomainState = rt.state
  if (typeof path === 'string') {
    const found = resolveIdentity(state, path, CONTAINER_CLASSES)
    if (typeof found !== 'string') throw new PsError(`New-ADUser: the -Path container '${path}' was not found. Nothing was created.`, { identity: path, help: 'Get-Help New-ADUser -Examples' })
    return found
  }
  const here = /^AD:\\(.+)$/i.exec(rt.location)
  if (here) {
    const found = resolveIdentity(state, here[1], CONTAINER_CLASSES)
    if (typeof found === 'string') return found
  }
  const users = usersContainer(state)
  if (!users) throw new PsError('New-ADUser: the default CN=Users container is missing from the simulated domain. Use -Path.')
  return users.guid
}

export const newUser: CmdletSpec = {
  name: 'New-ADUser',
  module: 'ActiveDirectory',
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Name', type: 'string', position: 0, mandatory: true, help: 'The name (CN) of the new account.' },
      { name: 'SamAccountName', type: 'string', help: 'The sign-in name. Defaults to -Name in this lab.' },
      ...attributeParams,
      { name: 'Path', type: 'string', help: 'Distinguished name of the container. Defaults to the current AD: location, else CN=Users.' },
      { name: 'AccountPassword', type: 'secure', help: 'A secure string from Read-Host -AsSecureString. The lab keeps a policy verdict only.' },
      { name: 'Enabled', type: 'bool', help: 'With $true and a valid simulated password, the account starts enabled.' },
      changeAtLogon,
      passThru,
    ],
  }],
  inputTypes: [],
  outputType: USER,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Creates a simulated user account. Without a valid simulated password it starts disabled. Records event 4720.',
    examples: [
      { code: "New-ADUser -Name 'Jordan Pike' -SamAccountName jpike -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local' -WhatIf", explain: 'Previews the new account in the Pharmacy OU.' },
      { code: "$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString; New-ADUser -Name 'Jordan Pike' -SamAccountName jpike -GivenName Jordan -Surname Pike -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local' -AccountPassword $pw -Enabled $true -PassThru", explain: 'Creates an enabled account with a masked simulated password and returns it.' },
      { code: "$params = @{ Name = 'Jordan Pike'; SamAccountName = 'jpike' }; New-ADUser @params", explain: 'Splatting. With no -Path the account goes to CN=Users, or to the current AD: location.' },
    ],
  },
  *run(inv, rt) {
    const name = toText(inv.params.Name as PsValue).trim()
    const sam = typeof inv.params.SamAccountName === 'string' ? inv.params.SamAccountName : name
    const parent = newUserContainer(rt, inv.params.Path)
    const secure = isSecure(inv.params.AccountPassword) ? inv.params.AccountPassword : undefined
    const attrs = attributesFrom(inv)
    const enabled = typeof inv.params.Enabled === 'boolean' ? inv.params.Enabled : undefined
    const action = {
      type: 'user.create' as const, name, samAccountName: sam, parent, attrs,
      ...(enabled === undefined ? {} : { enabled }),
      ...(secure ? { credential: { policy: secure.credential.policy } } : {}),
    }
    const result = apply(rt, inv, action, 'New', childDn(rt.state, parent, name), sam)
    if (!result || inv.whatIf) return
    const created = findBySamAccountName(rt.state, sam)
    if (created !== undefined && inv.params.PassThru === true) yield passThruValue(rt, created)
  },
}

export const setUser: CmdletSpec = {
  name: 'Set-ADUser',
  module: 'ActiveDirectory',
  parameterSets: [{
    name: 'Identity',
    parameters: [
      { name: 'Identity', type: 'object', position: 0, mandatory: true, pipeline: true, help: 'sAMAccountName, distinguished name, GUID, or SID. Accepts pipeline input from Get-ADUser.' },
      ...attributeParams,
      changeAtLogon,
      { name: 'Replace', type: 'hashtable', help: 'Attribute names and new values, for example @{ title = "Pharmacist" }.' },
      passThru,
    ],
  }],
  inputTypes: AD_INPUT,
  outputType: USER,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Changes attributes of a simulated user account. Records event 4738.',
    examples: [
      { code: "Set-ADUser -Identity pnair -Title 'Senior Pharmacy Technician'", explain: 'Changes the job title.' },
      { code: 'Set-ADUser -Identity pnair -ChangePasswordAtLogon $true', explain: 'Requires a new password at the next simulated sign-in.' },
      { code: "Get-ADUser -Identity pnair | Set-ADUser -Replace @{ department = 'Pharmacy' } -WhatIf", explain: 'Previews a change from the pipeline.' },
    ],
  },
  *run(inv, rt) {
    const attrs = attributesFrom(inv)
    const replace = inv.params.Replace
    if (isHashtable(replace)) {
      for (const [key, value] of Object.entries(replace.properties)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) throw new PsError(`Set-ADUser: the value for '${key}' in -Replace must be text, a number, or a boolean.`)
        attrs[key] = Array.isArray(value) ? value.map((item) => toText(item)) : value
      }
    }
    if (Object.keys(attrs).length === 0) throw new PsError('Set-ADUser: name at least one attribute to change. Nothing was changed.', { help: 'Get-Help Set-ADUser -Examples' })
    for (const value of targetsOf(inv)) {
      const identity = identityLabel(value)
      const target = resolveTarget(rt.state, value, ['user'])
      if (!('guid' in target)) { rt.writeError({ message: `Set-ADUser: ${target.message}`, identity }); continue }
      const result = apply(rt, inv, { type: 'user.setAttrs', target: target.guid, attrs }, 'Set', dnOf(rt.state, target.guid), identity)
      if (result && !inv.whatIf && inv.params.PassThru === true) yield passThruValue(rt, target.guid)
    }
  },
}

export const userCmdlets: CmdletSpec[] = [newUser, setUser]
