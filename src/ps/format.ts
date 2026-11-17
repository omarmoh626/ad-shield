import type { Registry } from './registry'
import { HASHTABLE, getProperty, isObject, toText, type PsObject, type PsValue } from './values'

/** Objects of these types are grouped under a heading taken from one property. */
const GROUP_BY: Record<string, string> = { 'Microsoft.PowerShell.Commands.MemberDefinition': 'TypeName' }

function cell(value: PsValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return `{${value.map((item) => toText(item)).join(', ')}}`
  return toText(value)
}

function table(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)))
  const line = (cells: string[]) => cells.map((text, index) => text.padEnd(widths[index])).join(' ').trimEnd()
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)]
}

function columnsFor(objects: PsObject[], registry: Registry, groupBy: string | undefined): string[] {
  const declared = registry.displayFor(objects[0].typeName)
  if (declared) return declared
  const names: string[] = []
  for (const object of objects) for (const name of Object.keys(object.properties)) if (!names.includes(name) && name !== groupBy) names.push(name)
  return names
}

function formatObjects(objects: PsObject[], registry: Registry): string[] {
  if (objects[0].typeName === HASHTABLE) {
    return objects.flatMap((object, index) => [...(index ? [''] : []), ...table(['Name', 'Value'], Object.entries(object.properties).map(([name, value]) => [name, cell(value)]))])
  }
  const groupBy = GROUP_BY[objects[0].typeName]
  const columns = columnsFor(objects, registry, groupBy)
  const render = (group: PsObject[]): string[] => {
    if (!columns.length) return group.map((object) => toText(object))
    // PowerShell shows up to four properties as a table and more as a list.
    if (columns.length <= 4) return table(columns, group.map((object) => columns.map((name) => cell(getProperty(object, name)))))
    const width = Math.max(...columns.map((name) => name.length))
    return group.flatMap((object, index) => [...(index ? [''] : []), ...columns.map((name) => `${name.padEnd(width)} : ${cell(getProperty(object, name))}`)])
  }
  if (!groupBy) return render(objects)
  const groups = new Map<string, PsObject[]>()
  for (const object of objects) {
    const key = cell(getProperty(object, groupBy))
    groups.set(key, [...(groups.get(key) ?? []), object])
  }
  return [...groups].flatMap(([key, group], index) => [...(index ? [''] : []), `   ${groupBy}: ${key}`, '', ...render(group)])
}

/**
 * Turns finished pipeline output into display text. The runtime calls this
 * once per statement, after every command in the pipeline has run.
 */
export function formatValues(values: PsValue[], registry: Registry): string {
  const lines: string[] = []
  let run: PsObject[] = []
  const flush = () => {
    if (!run.length) return
    if (lines.length) lines.push('')
    lines.push(...formatObjects(run, registry))
    run = []
  }
  for (const value of values) {
    if (value === null) continue
    if (isObject(value)) {
      if (run.length && run[0].typeName !== value.typeName) flush()
      run.push(value)
      continue
    }
    flush()
    lines.push(Array.isArray(value) ? value.map((item) => toText(item)).join('\n') : toText(value))
  }
  flush()
  return lines.join('\n')
}
