import type { AclLayer } from '../../../engine/types'
import type { CmdletSpec, Invocation, ParameterSpec } from '../../registry'
import type { Runtime } from '../../runtime'
import { PsError, toText } from '../../values'
import { PRINCIPAL_CLASSES, apply, identityLabel, resolveTarget } from '../ad/set/common'
import { RIGHT_NAMES, RIGHT_VALUES, SIM_MODULE, labelOf, parseRight, resolveShare } from './common'

const parameters: ParameterSpec[] = [
  { name: 'Resource', type: 'string', position: 0, mandatory: true, help: 'The simulated share: Pharmacy or Finance, its ID, or its UNC path.' },
  { name: 'Identity', type: 'object', position: 1, mandatory: true, help: 'The user, computer, or security group that holds the entry.' },
  { name: 'Right', type: 'string', mandatory: true, values: RIGHT_VALUES, help: 'Read, Write, Modify, or FullControl.' },
  { name: 'Layer', type: 'string', values: ['Share', 'File', 'Both'], help: 'Which permission layer to change. Defaults to Both.' },
]

const layerText = (layer: AclLayer): string => layer === 'both' ? 'share and file layers' : `${layer} layer`

function change(inv: Invocation, rt: Runtime, kind: 'acl.addEntry' | 'acl.removeEntry'): void {
  const share = resolveShare(rt.state, inv.params.Resource)
  const right = parseRight(inv.params.Right)
  const layer = (inv.params.Layer === undefined ? 'both' : toText(inv.params.Layer).toLowerCase()) as AclLayer
  const identity = identityLabel(inv.params.Identity)
  const target = resolveTarget(rt.state, inv.params.Identity, PRINCIPAL_CLASSES)
  if (!('guid' in target)) throw new PsError(`${inv.spec.name}: ${target.message}`, { identity })
  const result = apply(rt, inv, { type: kind, resource: share.id, trustee: target.guid, right, layer }, inv.spec.name, `${share.name} (${layerText(layer)})`, identity)
  if (!result || inv.whatIf) return
  if (result.warnings.some((warning) => warning.code === 'noChange')) {
    rt.writeHost(`No change: the simulated share ${share.name} already has this entry.`)
    return
  }
  const verb = kind === 'acl.addEntry' ? 'Added' : 'Removed'
  rt.writeHost(`${verb} simulated entry: Allow ${RIGHT_NAMES[right]} for ${labelOf(rt.state, target.guid)} on ${share.name} (${layerText(layer)}).`)
}

export const addSimResourcePermission: CmdletSpec = {
  name: 'Add-SimResourcePermission',
  module: SIM_MODULE,
  parameterSets: [{ name: 'Default', parameters }],
  inputTypes: [],
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Adds an explicit allow entry to a simulated share. A direct user entry works, but the lab expects access through a role group and a resource group.',
    examples: [
      { code: 'Add-SimResourcePermission -Resource Finance -Identity mali -Right Read -WhatIf', explain: 'Previews a direct grant for Maya on both layers. Nothing changes.' },
      { code: 'Add-SimResourcePermission -Resource Finance -Identity DL-Finance-Share-Read -Right Read -Layer File', explain: 'Adds the entry on the file layer only. It already exists here, so nothing changes.' },
    ],
  },
  *run(inv, rt) { change(inv, rt, 'acl.addEntry') },
}

export const removeSimResourcePermission: CmdletSpec = {
  name: 'Remove-SimResourcePermission',
  module: SIM_MODULE,
  parameterSets: [{ name: 'Default', parameters }],
  inputTypes: [],
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Removes an explicit allow entry from a simulated share. Inherited entries are not changed. A session that is already issued keeps its snapshot, but the next access check reads the new entries.',
    examples: [
      { code: 'Remove-SimResourcePermission -Resource Pharmacy -Identity DL-Pharmacy-Share-Read -Right Read -WhatIf', explain: 'Previews removing the read entry from both layers.' },
      { code: 'Add-SimResourcePermission Finance mali -Right Read; Remove-SimResourcePermission Finance mali -Right Read', explain: 'Adds a direct grant for Maya, then removes it again.' },
    ],
  },
  *run(inv, rt) { change(inv, rt, 'acl.removeEntry') },
}
