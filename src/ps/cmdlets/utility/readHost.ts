import type { CmdletSpec } from '../../registry'

export const readHost: CmdletSpec = {
  name: 'Read-Host',
  module: 'Microsoft.PowerShell.Utility',
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Prompt', type: 'string', position: 0, help: 'The text shown before the input.' },
      { name: 'AsSecureString', type: 'switch', help: 'Masks the simulated input. The lab keeps a policy verdict only, never the characters.' },
    ],
  }],
  inputTypes: [],
  outputType: 'System.String',
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Asks for one line of input. With -AsSecureString the simulated input is masked and never stored.',
    examples: [
      { code: "Read-Host -Prompt 'Ticket note'", explain: 'Asks for a line of text and returns it.' },
      { code: "$secret = Read-Host -Prompt 'New password (simulated)' -AsSecureString", explain: 'Asks for a simulated password. The lab checks it against policy and discards the characters.' },
    ],
  },
  *run(inv, rt) {
    const prompt = typeof inv.params.Prompt === 'string' ? inv.params.Prompt : 'Input'
    if (inv.params.AsSecureString === true) yield rt.readSecure(prompt)
    else yield rt.readLine(prompt)
  },
}
