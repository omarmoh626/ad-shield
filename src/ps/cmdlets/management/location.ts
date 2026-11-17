import { deriveDn } from '../../../domain/dn'
import { getObjectByDn } from '../../../domain/graph'
import type { DirObject, DomainState } from '../../../domain/types'
import type { CmdletSpec } from '../../registry'
import { PsError, toText, type PsValue } from '../../values'

export const LAB_HOME = 'C:\\Lab'
export const AD_ROOT = 'AD:\\'
const PATH_INFO = 'System.Management.Automation.PathInfo'
const CONTAINERS = new Set(['domain', 'organizationalUnit', 'container'])

const adPath = (state: DomainState, object: DirObject): string => `${AD_ROOT}${deriveDn(state, object)}`

function containerAt(state: DomainState, dn: string): DirObject {
  const object = getObjectByDn(state, dn)
  if (!object) throw new PsError(`Set-Location: cannot find path '${AD_ROOT}${dn}' because it does not exist in the simulated directory.`, { identity: dn, help: 'Get-Help Set-Location -Examples' })
  if (!CONTAINERS.has(object.objectClass)) throw new PsError(`Set-Location: '${dn}' is a ${object.objectClass}, not a container. Change to a domain, OU, or container.`, { identity: dn })
  return object
}

/**
 * Resolves a Set-Location target from the current location. Supported forms:
 * C:\Lab (the only simulated file system location), AD: or AD:\, AD:\<DN>,
 * `..`, and a relative RDN or DN while inside the AD: drive.
 */
export function resolveLocation(state: DomainState, current: string, typed: string): string {
  const target = typed.trim()
  if (/^(?:c:\\lab\\?|c:\\?|~)$/i.test(target)) return LAB_HOME
  if (/^ad:\\?$/i.test(target)) return AD_ROOT
  const absolute = /^ad:\\(.+)$/i.exec(target)
  if (absolute) return adPath(state, containerAt(state, absolute[1]))
  const inAd = /^ad:\\(.*)$/i.exec(current)
  if (!inAd) {
    throw new PsError(`Set-Location: cannot find path '${target}'. The simulated file system has only ${LAB_HOME}. Use AD: for the directory.`, { identity: target, help: 'Get-Help Set-Location -Examples' })
  }
  const here = inAd[1]
  if (target === '..' || target === '..\\') {
    if (!here) return AD_ROOT
    const parent = containerAt(state, here).parent
    return parent === null ? AD_ROOT : adPath(state, state.objects[parent])
  }
  // Inside the drive a name is relative to the current container; at the drive root it is a full DN.
  const relative = here ? `${target},${here}` : target
  const child = getObjectByDn(state, relative)
  if (child) return adPath(state, containerAt(state, relative))
  return adPath(state, containerAt(state, target))
}

export const setLocation: CmdletSpec = {
  name: 'Set-Location',
  module: 'Microsoft.PowerShell.Management',
  aliases: ['cd', 'sl', 'chdir'],
  parameterSets: [{ name: 'Path', parameters: [{ name: 'Path', type: 'string', position: 0, help: 'C:\\Lab, AD:, AD:\\<distinguished name>, .., or a container name relative to the current AD: location.' }] }],
  inputTypes: [],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Changes the console location between C:\\Lab and the simulated AD: drive. New-ADUser without -Path uses the current AD: container.',
    examples: [
      { code: "Set-Location 'AD:\\OU=Pharmacy,DC=corp,DC=contoso,DC=local'", explain: 'Moves into the Pharmacy OU of the simulated directory.' },
      { code: "Set-Location AD:; Set-Location 'DC=corp,DC=contoso,DC=local'; Set-Location OU=Finance", explain: 'Walks down the AD: drive one container at a time. Quote a DN that contains commas.' },
      { code: 'Set-Location C:\\Lab', explain: 'Returns to the startup location.' },
    ],
  },
  *run(inv, rt) {
    const typed = inv.params.Path === undefined ? '~' : toText(inv.params.Path as PsValue)
    rt.setLocation(resolveLocation(rt.state, rt.location, typed))
  },
}

export const getLocation: CmdletSpec = {
  name: 'Get-Location',
  module: 'Microsoft.PowerShell.Management',
  aliases: ['gl', 'pwd'],
  parameterSets: [{ name: 'Default', parameters: [] }],
  inputTypes: [],
  outputType: PATH_INFO,
  defaultDisplay: ['Path'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Shows the current console location: C:\\Lab or a path on the simulated AD: drive.',
    examples: [{ code: 'Get-Location', explain: 'Shows where the console is.' }],
  },
  *run(_inv, rt) {
    yield { typeName: PATH_INFO, text: rt.location, properties: { Path: rt.location } }
  },
}
