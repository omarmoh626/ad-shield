import type { CmdletSpec } from '../../registry'
import type { PsValue } from '../../values'

export const writeOutput: CmdletSpec = {
  name: 'Write-Output',
  module: 'Microsoft.PowerShell.Utility',
  aliases: ['echo', 'write'],
  parameterSets: [{
    name: 'Default',
    parameters: [{ name: 'InputObject', type: 'object[]', position: 0, remaining: true, pipeline: true, mandatory: true, help: 'The values to send down the pipeline.' }],
  }],
  inputTypes: ['System.Object'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Sends values to the pipeline. With nothing after it, the values are shown.',
    examples: [
      { code: "Write-Output 'Ticket reviewed'", explain: 'Shows one line of text.' },
      { code: "Write-Output 'mali', 'jdoe' | Where-Object { $_ -like 'm*' }", explain: 'Sends two strings down the pipeline and keeps one.' },
    ],
  },
  *run(inv) {
    yield* inv.input
    for (const value of (inv.params.InputObject as PsValue[] | undefined) ?? []) {
      if (Array.isArray(value)) yield* value
      else yield value
    }
  },
}
