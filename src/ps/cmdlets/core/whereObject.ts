import type { CmdletSpec } from '../../registry'
import { isTruthy, type PsScriptBlock } from '../../values'

export const whereObject: CmdletSpec = {
  name: 'Where-Object',
  module: 'Microsoft.PowerShell.Core',
  aliases: ['where', '?'],
  parameterSets: [{
    name: 'ScriptBlock',
    parameters: [{ name: 'FilterScript', type: 'scriptblock', position: 0, mandatory: true, help: 'A comparison in braces. $_ is the current object.' }],
  }],
  inputTypes: ['System.Object'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Keeps the pipeline objects for which a comparison is true.',
    examples: [
      { code: "Get-Command | Where-Object { $_.Name -like 'Get-*' }", explain: 'Keeps the cmdlets whose name starts with Get-.' },
      { code: "Get-Command | Where-Object { $_.Source -eq 'Microsoft.PowerShell.Core' -and $_.Name -ne 'Get-Help' }", explain: 'Combines two comparisons with -and.' },
    ],
  },
  *run(inv, rt) {
    const filter = inv.params.FilterScript as PsScriptBlock
    for (const item of inv.input) if (isTruthy(rt.invokeBlock(filter, item))) yield item
  },
}
