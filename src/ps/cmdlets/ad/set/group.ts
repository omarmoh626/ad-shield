import type { Guid } from '../../../../domain/types'
import type { CmdletSpec, Invocation } from '../../../registry'
import type { Runtime } from '../../../runtime'
import { type PsValue } from '../../../values'
import { AD_INPUT, ANY_CLASS, CONTAINER_CLASSES, GROUP, OBJECT, PRINCIPAL_CLASSES, apply, dnOf, identityLabel, passThru, passThruValue, resolveTarget, targetsOf } from './common'

const listOf = (value: PsValue | undefined): PsValue[] => (value === undefined ? [] : Array.isArray(value) ? value : [value])

/**
 * Applies one membership action per (group, member) pair. `side` names which list is
 * the -Identity side, so errors and -WhatIf targets follow the real cmdlet:
 * Add-ADGroupMember reports the group, Add-ADPrincipalGroupMembership the principal.
 */
function* membership(inv: Invocation, rt: Runtime, type: 'group.addMember' | 'group.removeMember', side: 'group' | 'principal', others: PsValue[]): Generator<PsValue> {
  const otherClasses = side === 'group' ? PRINCIPAL_CLASSES : ['group' as const]
  const identityClasses = side === 'group' ? ['group' as const] : PRINCIPAL_CLASSES
  for (const value of targetsOf(inv)) {
    const identity = identityLabel(value)
    const self = resolveTarget(rt.state, value, identityClasses)
    if (!('guid' in self)) { rt.writeError({ message: `${inv.spec.name}: ${self.message}`, identity }); continue }
    let changed = false
    for (const other of others) {
      const otherLabel = identityLabel(other)
      const resolved = resolveTarget(rt.state, other, otherClasses)
      if (!('guid' in resolved)) { rt.writeError({ message: `${inv.spec.name}: ${resolved.message}`, identity: otherLabel }); continue }
      const group: Guid = side === 'group' ? self.guid : resolved.guid
      const member: Guid = side === 'group' ? resolved.guid : self.guid
      const result = apply(rt, inv, { type, group, member }, 'Set', dnOf(rt.state, self.guid), `${identity} / ${otherLabel}`)
      if (result) changed = true
    }
    if (changed && !inv.whatIf && inv.params.PassThru === true) yield passThruValue(rt, self.guid)
  }
}

const groupIdentity = { name: 'Identity', type: 'object' as const, position: 0, mandatory: true, pipeline: true, help: 'The group: sAMAccountName, distinguished name, GUID, or SID.' }
const members = { name: 'Members', type: 'object[]' as const, position: 1, mandatory: true, help: 'The users, computers, or groups to add or remove. Separate several with commas.' }

export const addGroupMember: CmdletSpec = {
  name: 'Add-ADGroupMember',
  module: 'ActiveDirectory',
  parameterSets: [{ name: 'Identity', parameters: [groupIdentity, members, passThru] }],
  inputTypes: AD_INPUT,
  outputType: GROUP,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Adds members to a simulated group. -Identity is the group; -Members are the principals. Records 4728, 4732, or 4756 for security groups.',
    examples: [
      { code: 'Add-ADGroupMember -Identity GG-Pharmacy-Staff -Members bcastillo', explain: 'Adds Ben Castillo to the Pharmacy staff group.' },
      { code: 'Add-ADGroupMember -Identity GG-Pharmacy-Staff -Members bcastillo,aokoye -WhatIf', explain: 'Previews adding two members.' },
    ],
  },
  *run(inv, rt) { yield* membership(inv, rt, 'group.addMember', 'group', listOf(inv.params.Members)) },
}

export const removeGroupMember: CmdletSpec = {
  name: 'Remove-ADGroupMember',
  module: 'ActiveDirectory',
  parameterSets: [{ name: 'Identity', parameters: [groupIdentity, members, passThru] }],
  inputTypes: AD_INPUT,
  outputType: GROUP,
  supportsWhatIf: true,
  // High impact: the console asks before each removal unless -Confirm:$false is given.
  confirmImpact: 'high',
  help: {
    synopsis: 'Removes members from a simulated group. Asks for confirmation unless -Confirm:$false. Records 4729, 4733, or 4757 for security groups.',
    examples: [
      { code: 'Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false', explain: 'Removes Priya Nair without the confirmation question.' },
      { code: 'Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -WhatIf', explain: 'Previews the removal. A preview never asks.' },
    ],
  },
  *run(inv, rt) { yield* membership(inv, rt, 'group.removeMember', 'group', listOf(inv.params.Members)) },
}

export const addPrincipalGroupMembership: CmdletSpec = {
  name: 'Add-ADPrincipalGroupMembership',
  module: 'ActiveDirectory',
  parameterSets: [{
    name: 'Identity',
    parameters: [
      { name: 'Identity', type: 'object', position: 0, mandatory: true, pipeline: true, help: 'The user, computer, or group that joins the groups.' },
      { name: 'MemberOf', type: 'object[]', position: 1, mandatory: true, help: 'The groups to join. Separate several with commas.' },
      passThru,
    ],
  }],
  inputTypes: AD_INPUT,
  outputType: OBJECT,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Adds one principal to several simulated groups. -Identity is the principal; -MemberOf are the groups.',
    examples: [
      { code: 'Add-ADPrincipalGroupMembership -Identity bcastillo -MemberOf GG-Pharmacy-Staff', explain: 'Makes Ben Castillo a member of the Pharmacy staff group.' },
      { code: 'Get-ADUser -Identity bcastillo | Add-ADPrincipalGroupMembership -MemberOf GG-Pharmacy-Staff,GG-Finance-Staff -WhatIf', explain: 'Previews joining two groups from the pipeline.' },
    ],
  },
  *run(inv, rt) { yield* membership(inv, rt, 'group.addMember', 'principal', listOf(inv.params.MemberOf)) },
}

export const moveObject: CmdletSpec = {
  name: 'Move-ADObject',
  module: 'ActiveDirectory',
  parameterSets: [{
    name: 'Identity',
    parameters: [
      { name: 'Identity', type: 'object', position: 0, mandatory: true, pipeline: true, help: 'The object to move: distinguished name or GUID (or sAMAccountName in this lab).' },
      { name: 'TargetPath', type: 'string', position: 1, mandatory: true, help: 'Distinguished name of the new container.' },
      passThru,
    ],
  }],
  inputTypes: AD_INPUT,
  outputType: OBJECT,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Moves a simulated object to another OU or container. GUID, SID, and group memberships stay the same.',
    examples: [
      { code: "Move-ADObject -Identity 'CN=Kenji Morita,OU=Finance,DC=corp,DC=contoso,DC=local' -TargetPath 'OU=Nursing,DC=corp,DC=contoso,DC=local' -WhatIf", explain: 'Previews the move.' },
      { code: "Get-ADUser -Identity kmorita | Move-ADObject -TargetPath 'OU=Nursing,DC=corp,DC=contoso,DC=local' -PassThru", explain: 'Moves the account from the pipeline and returns it.' },
    ],
  },
  *run(inv, rt) {
    const path = String(inv.params.TargetPath)
    const container = resolveTarget(rt.state, path, CONTAINER_CLASSES)
    if (!('guid' in container)) { rt.writeError({ message: `Move-ADObject: the -TargetPath container '${path}' was not found. Nothing was moved.`, identity: path }); return }
    for (const value of targetsOf(inv)) {
      const identity = identityLabel(value)
      const target = resolveTarget(rt.state, value, ANY_CLASS)
      if (!('guid' in target)) { rt.writeError({ message: `Move-ADObject: ${target.message}`, identity }); continue }
      const result = apply(rt, inv, { type: 'object.move', target: target.guid, newParent: container.guid }, 'Move', dnOf(rt.state, target.guid), identity)
      if (result && !inv.whatIf && inv.params.PassThru === true) yield passThruValue(rt, target.guid)
    }
  },
}

export const groupCmdlets: CmdletSpec[] = [addGroupMember, removeGroupMember, addPrincipalGroupMembership, moveObject]
