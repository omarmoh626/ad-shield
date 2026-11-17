import type { CmdletSpec } from '../../registry'
import { wildcardMatch, type PsObject } from '../../values'

const COMMAND_INFO = 'System.Management.Automation.CmdletInfo'

export const getCommand: CmdletSpec = {
  name: 'Get-Command',
  module: 'Microsoft.PowerShell.Core',
  aliases: ['gcm'],
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Name', type: 'string[]', position: 0, help: 'Cmdlet names or aliases. Wildcards are allowed.' },
      { name: 'Module', type: 'string[]', help: 'Lists the cmdlets of these modules only.' },
    ],
  }],
  inputTypes: [],
  outputType: COMMAND_INFO,
  defaultDisplay: ['CommandType', 'Name', 'Source'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Lists the cmdlets that exist in this lab.',
    examples: [
      { code: 'Get-Command', explain: 'Lists every cmdlet in this lab.' },
      { code: 'Get-Command -Module Microsoft.PowerShell.Utility', explain: 'Lists the cmdlets of one module.' },
      { code: 'Get-Command -Name Get-*', explain: 'Lists the cmdlets whose name starts with Get-.' },
      { code: 'Get-Command | Select-Object -Property Name, Source', explain: 'Shows two properties of each cmdlet.' },
    ],
  },
  *run(inv, rt) {
    const names = inv.params.Name as string[] | undefined
    const modules = (inv.params.Module as string[] | undefined)?.map((module) => module.toLowerCase())
    for (const spec of rt.registry.list()) {
      if (modules && !modules.some((module) => wildcardMatch(module, spec.module))) continue
      if (names && !names.some((name) => [spec.name, ...(spec.aliases ?? [])].some((candidate) => wildcardMatch(name, candidate)))) continue
      const info: PsObject = { typeName: COMMAND_INFO, text: spec.name, properties: { CommandType: 'Cmdlet', Name: spec.name, Source: spec.module, Module: spec.module } }
      yield info
    }
  },
}
