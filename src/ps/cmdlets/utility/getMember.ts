import type { CmdletSpec } from '../../registry'
import { PsError, getProperty, propertyNames, typeNameOf, wildcardMatch, type PsObject, type PsValue } from '../../values'

const MEMBER = 'Microsoft.PowerShell.Commands.MemberDefinition'
const SHORT: Record<string, string> = { 'System.String': 'string', 'System.Int32': 'int', 'System.Double': 'double', 'System.Boolean': 'bool' }

export const getMember: CmdletSpec = {
  name: 'Get-Member',
  module: 'Microsoft.PowerShell.Utility',
  aliases: ['gm'],
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Name', type: 'string[]', position: 0, help: 'Member names to show. Wildcards are allowed.' },
      { name: 'InputObject', type: 'object', pipeline: true, help: 'The object to inspect.' },
    ],
  }],
  inputTypes: ['System.Object'],
  outputType: MEMBER,
  defaultDisplay: ['Name', 'MemberType', 'Definition'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Shows the type name and the properties of pipeline objects.',
    examples: [
      { code: 'Get-Command | Get-Member', explain: 'Shows the type and properties of the objects that Get-Command returns.' },
      { code: "$c = Get-Command -Name Get-Help\n$c | Get-Member -Name Name", explain: 'Stores an object in a variable, then shows one of its properties.' },
    ],
  },
  *run(inv) {
    const names = inv.params.Name as string[] | undefined
    const direct = inv.params.InputObject as PsValue | undefined
    const items = direct !== undefined && direct !== null ? [direct] : inv.input
    if (!items.length) throw new PsError('Get-Member needs an object. Pipe one to it, for example: Get-Command | Get-Member', { help: 'Get-Help Get-Member -Examples' })
    const seen = new Set<string>()
    for (const item of items) {
      const typeName = typeNameOf(item)
      if (seen.has(typeName)) continue
      seen.add(typeName)
      for (const name of propertyNames(item).sort((a, b) => a.localeCompare(b))) {
        if (names && !names.some((pattern) => wildcardMatch(pattern, name))) continue
        const value = getProperty(item, name) ?? null
        const type = typeNameOf(value)
        const member: PsObject = { typeName: MEMBER, text: name, properties: { TypeName: typeName, Name: name, MemberType: 'Property', Definition: `${SHORT[type] ?? type} ${name} {get;}` } }
        yield member
      }
    }
  },
}
