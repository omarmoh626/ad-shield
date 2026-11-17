import { syntaxOf, type CmdletSpec } from '../../registry'
import { PsError } from '../../values'

const indent = (text: string) => text.split('\n').map((line) => `    ${line}`).join('\n')

export const getHelp: CmdletSpec = {
  name: 'Get-Help',
  module: 'Microsoft.PowerShell.Core',
  aliases: ['help', 'man'],
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Name', type: 'string', position: 0, help: 'The cmdlet or alias to describe.' },
      { name: 'Examples', type: 'switch', help: 'Shows the examples only.' },
    ],
  }],
  inputTypes: [],
  outputType: 'System.String',
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Shows what a cmdlet does, its syntax, and examples you can run in this lab.',
    examples: [
      { code: 'Get-Help Get-Command', explain: 'Shows the synopsis and syntax of Get-Command.' },
      { code: 'Get-Help Get-Command -Examples', explain: 'Shows examples for Get-Command. Every example runs in this lab.' },
      { code: 'Get-Help', explain: 'Explains how to find commands in this lab.' },
    ],
  },
  *run(inv, rt) {
    const name = inv.params.Name
    if (typeof name !== 'string') {
      yield [
        'This console is a simulated PowerShell subset. Nothing here reaches a real system.',
        '',
        'Get-Command                      lists every cmdlet in this lab',
        'Get-Command -Module <module>     lists the cmdlets of one module',
        'Get-Help <cmdlet>                shows the synopsis and syntax',
        'Get-Help <cmdlet> -Examples      shows examples that run in this lab',
        '',
        `Modules: ${rt.registry.modules().join(', ')}`,
      ].join('\n')
      return
    }
    const spec = rt.registry.resolve(name)
    if (!spec) throw new PsError(`Get-Help cannot find '${name}' in this lab. Run Get-Command to list what is available.`, { help: 'Get-Help Get-Command -Examples' })
    const sections = [`NAME\n${indent(spec.name)}`, `SYNOPSIS\n${indent(spec.help.synopsis)}`]
    if (inv.params.Examples === true) {
      spec.help.examples.forEach((example, index) => {
        sections.push(indent(`-------------------------- EXAMPLE ${index + 1} --------------------------\nPS> ${example.code}\n\n${example.explain}`))
      })
      if (!spec.help.examples.length) sections.push(indent('This cmdlet has no examples yet.'))
    } else {
      sections.push(`SYNTAX\n${indent(syntaxOf(spec).join('\n\n'))}`)
      if (spec.aliases?.length) sections.push(`ALIASES\n${indent(spec.aliases.join(', '))}`)
      sections.push(`MODULE\n${indent(spec.module)}`, `REMARKS\n${indent(`To see examples, run: Get-Help ${spec.name} -Examples`)}`)
    }
    yield sections.join('\n\n')
  },
}
