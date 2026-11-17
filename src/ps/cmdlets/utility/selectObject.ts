import type { CmdletSpec } from '../../registry'
import { PsError, getProperty, isObject, propertyNames, typeNameOf, wildcardMatch, type PsObject, type PsValue } from '../../values'

export const selectObject: CmdletSpec = {
  name: 'Select-Object',
  module: 'Microsoft.PowerShell.Utility',
  aliases: ['select'],
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Property', type: 'object[]', position: 0, help: 'Property names to keep. Wildcards are allowed.' },
      { name: 'ExpandProperty', type: 'string', help: 'Returns the value of one property instead of an object.' },
      { name: 'First', type: 'int', help: 'Keeps this many objects from the start.' },
      { name: 'Last', type: 'int', help: 'Keeps this many objects from the end.' },
    ],
  }],
  inputTypes: ['System.Object'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Keeps named properties of pipeline objects, or the first or last objects.',
    examples: [
      { code: 'Get-Command | Select-Object -Property Name, Source', explain: 'Keeps two properties of each object.' },
      { code: 'Get-Command | Select-Object -First 2', explain: 'Keeps the first two objects.' },
      { code: 'Get-Command | Select-Object -ExpandProperty Name', explain: 'Returns the names as plain strings.' },
    ],
  },
  *run(inv) {
    const first = inv.params.First as number | undefined, last = inv.params.Last as number | undefined
    if ((first ?? 0) < 0 || (last ?? 0) < 0) throw new PsError('Select-Object: -First and -Last cannot be negative.')
    let items = inv.input
    if (first !== undefined) items = items.slice(0, first)
    if (last !== undefined) items = last === 0 ? [] : items.slice(-last)
    const expand = inv.params.ExpandProperty as string | undefined
    const wanted = inv.params.Property as PsValue[] | undefined
    if (wanted?.some((entry) => typeof entry !== 'string')) {
      throw new PsError('Select-Object: only property names are supported in this lab. Calculated properties are not available.', { help: 'Get-Help Select-Object -Examples' })
    }
    for (const item of items) {
      if (expand !== undefined) {
        const value = getProperty(item, expand)
        if (value === undefined) throw new PsError(`Select-Object: the property '${expand}' cannot be found.`, { identity: isObject(item) ? item.text : undefined })
        if (Array.isArray(value)) yield* value
        else yield value
        continue
      }
      if (!wanted) { yield item; continue }
      const properties: Record<string, PsValue> = {}
      const available = propertyNames(item)
      for (const pattern of wanted as string[]) {
        const matches = available.filter((name) => wildcardMatch(pattern, name))
        // A name that matches nothing still becomes a column, with an empty value. PowerShell does the same.
        if (!matches.length && !/[*?]/.test(pattern)) properties[pattern] = null
        for (const name of matches) properties[name] = getProperty(item, name) ?? null
      }
      const selected: PsObject = { typeName: `Selected.${typeNameOf(item)}`, properties, ...(isObject(item) && item.text !== undefined ? { text: item.text } : {}) }
      yield selected
    }
  },
}
