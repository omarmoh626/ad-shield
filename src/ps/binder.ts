import { parametersOf, type CmdletSpec, type ParameterSet, type ParameterSpec, type ParamType } from './registry'
import { PsError, isHashtable, isObject, isScriptBlock, isSecure, toText, type PsValue } from './values'

/** One argument after evaluation, in source order. */
export type RawItem =
  | { kind: 'named'; name: string; hasValue: boolean; value: PsValue; colon: boolean; line: number; column: number }
  | { kind: 'positional'; value: PsValue; line: number; column: number }

export interface Bound {
  parameterSet: string
  params: Record<string, PsValue>
  whatIf: boolean
  confirm?: boolean
}

const TYPE_NAME: Record<ParamType, string> = {
  'string': 'System.String', 'string[]': 'System.String[]', 'int': 'System.Int32', 'bool': 'System.Boolean', 'switch': 'System.Management.Automation.SwitchParameter',
  'object': 'System.Object', 'object[]': 'System.Object[]', 'scriptblock': 'System.Management.Automation.ScriptBlock', 'hashtable': 'System.Collections.Hashtable',
  'secure': 'System.Security.SecureString',
}

const isCommon = (name: string) => name === 'WhatIf' || name === 'Confirm'

/**
 * Finds the parameter a typed name means. An exact name or alias wins.
 * Otherwise a prefix must match exactly one parameter.
 */
export function resolveParameter(spec: CmdletSpec, typed: string): ParameterSpec {
  const wanted = typed.toLowerCase(), all = parametersOf(spec)
  const exact = all.find((parameter) => [parameter.name, ...(parameter.aliases ?? [])].some((name) => name.toLowerCase() === wanted))
  if (exact) return exact
  const matches = all.filter((parameter) => [parameter.name, ...(parameter.aliases ?? [])].some((name) => name.toLowerCase().startsWith(wanted)))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new PsError(`${spec.name}: the parameter name '-${typed}' is ambiguous. Possible matches: ${matches.map((parameter) => `-${parameter.name}`).join(', ')}.`, { help: `Get-Help ${spec.name}` })
  }
  throw new PsError(`${spec.name}: a parameter cannot be found that matches the name '-${typed}'.`, { help: `Get-Help ${spec.name}` })
}

function fail(parameter: ParameterSpec, value: PsValue): never {
  throw new PsError(`Cannot bind parameter '-${parameter.name}'. Cannot convert value "${toText(value)}" to type "${TYPE_NAME[parameter.type]}".`)
}

function toBool(parameter: ParameterSpec, value: PsValue): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string' && /^(?:true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  return fail(parameter, value)
}

function toStringValue(parameter: ParameterSpec, value: PsValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return toText(value)
  if (Array.isArray(value) && value.length === 1) return toStringValue(parameter, value[0])
  if (isObject(value) && value.text !== undefined) return value.text
  return fail(parameter, value)
}

function convert(parameter: ParameterSpec, value: PsValue): PsValue {
  let result: PsValue
  switch (parameter.type) {
    case 'string': result = toStringValue(parameter, value); break
    case 'string[]': result = (Array.isArray(value) ? value : [value]).map((item) => toStringValue(parameter, item)); break
    case 'int': {
      const scalar = Array.isArray(value) && value.length === 1 ? value[0] : value
      if (typeof scalar === 'number' && Number.isInteger(scalar)) result = scalar
      else if (typeof scalar === 'string' && /^-?\d+$/.test(scalar.trim())) result = Number(scalar)
      else return fail(parameter, value)
      break
    }
    case 'bool': case 'switch': result = toBool(parameter, value); break
    case 'object': result = value; break
    case 'object[]': result = Array.isArray(value) ? value : [value]; break
    case 'scriptblock': if (!isScriptBlock(value)) return fail(parameter, value); result = value; break
    case 'hashtable': if (!isHashtable(value)) return fail(parameter, value); result = value; break
    case 'secure': if (!isSecure(value)) return fail(parameter, value); result = value; break
  }
  if (parameter.values) {
    const allowed = parameter.values
    const check = (item: PsValue): PsValue => {
      const match = allowed.find((candidate) => candidate.toLowerCase() === toText(item).toLowerCase())
      if (match === undefined) throw new PsError(`Cannot bind parameter '-${parameter.name}'. The value "${toText(item)}" is not one of: ${allowed.join(', ')}.`)
      return match
    }
    result = Array.isArray(result) ? result.map(check) : check(result)
  }
  return result
}

function orderedSets(spec: CmdletSpec): ParameterSet[] {
  const first = spec.parameterSets.find((set) => set.name === spec.defaultParameterSet) ?? spec.parameterSets[0]
  return first ? [first, ...spec.parameterSets.filter((set) => set !== first)] : []
}

/**
 * Binds evaluated arguments to one parameter set of a cmdlet.
 * Throws a PsError and binds nothing when a name is unknown or ambiguous,
 * a value cannot be converted, or no parameter set fits.
 */
export function bind(spec: CmdletSpec, items: RawItem[], options: { pipelineInput: boolean }): Bound {
  const named = new Map<string, PsValue>()
  const positional: PsValue[] = []
  for (const item of items) {
    if (item.kind === 'positional') { positional.push(item.value); continue }
    try {
      const parameter = resolveParameter(spec, item.name)
      if (named.has(parameter.name)) throw new PsError(`${spec.name}: the parameter '-${parameter.name}' is given more than once.`)
      if (parameter.type === 'switch') {
        // `-Switch:$false` sets the switch. `-Switch value` turns the switch on and leaves the value as a positional argument.
        if (item.hasValue && item.colon) named.set(parameter.name, toBool(parameter, item.value))
        else { named.set(parameter.name, true); if (item.hasValue) positional.push(item.value) }
      } else {
        if (!item.hasValue) throw new PsError(`${spec.name}: the parameter '-${parameter.name}' needs a value.`, { help: `Get-Help ${spec.name}` })
        named.set(parameter.name, item.value)
      }
    } catch (error) {
      if (error instanceof PsError) { error.line ??= item.line; error.column ??= item.column }
      throw error
    }
  }

  const whatIf = named.get('WhatIf') === true
  const confirm = named.has('Confirm') ? named.get('Confirm') === true : undefined
  const given = [...named.keys()].filter((name) => !isCommon(name))
  const candidates = orderedSets(spec).filter((set) => given.every((name) => set.parameters.some((parameter) => parameter.name === name)))
  if (!candidates.length) throw new PsError(`${spec.name}: these parameters cannot be used together.`, { help: `Get-Help ${spec.name}` })

  const attempt = (set: ParameterSet): Bound => {
    const params: Record<string, PsValue> = {}
    for (const name of given) {
      const parameter = set.parameters.find((candidate) => candidate.name === name) as ParameterSpec
      params[name] = convert(parameter, named.get(name) as PsValue)
    }
    const slots = set.parameters.filter((parameter) => parameter.position !== undefined && !(parameter.name in params)).sort((a, b) => (a.position as number) - (b.position as number))
    let next = 0
    for (const slot of slots) {
      if (next >= positional.length) break
      if (slot.remaining) { params[slot.name] = convert(slot, positional.slice(next)); next = positional.length }
      else params[slot.name] = convert(slot, positional[next++])
    }
    if (next < positional.length) throw new PsError(`${spec.name}: a positional parameter cannot be found that accepts the argument '${toText(positional[next])}'.`, { help: `Get-Help ${spec.name}` })
    const missing = set.parameters.find((parameter) => parameter.mandatory && !(parameter.name in params) && !(parameter.pipeline && options.pipelineInput))
    if (missing) throw new PsError(`${spec.name}: the mandatory parameter '-${missing.name}' has no value.`, { help: `Get-Help ${spec.name}` })
    return { parameterSet: set.name, params, whatIf, ...(confirm === undefined ? {} : { confirm }) }
  }

  let first: PsError | undefined
  for (const set of candidates) {
    try { return attempt(set) } catch (error) {
      if (!(error instanceof PsError)) throw error
      first ??= error
    }
  }
  throw first as PsError
}
