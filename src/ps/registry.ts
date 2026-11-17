import type { Runtime } from './runtime'
import type { PsValue } from './values'

export type ParamType = 'string' | 'string[]' | 'int' | 'bool' | 'switch' | 'object' | 'object[]' | 'scriptblock' | 'hashtable' | 'secure'

export interface ParameterSpec {
  name: string
  type: ParamType
  /** Zero-based position for binding without a name. */
  position?: number
  mandatory?: boolean
  aliases?: string[]
  /** The parameter can take its value from pipeline input. A mandatory one is then satisfied by the pipeline. */
  pipeline?: boolean
  /** A positional parameter that takes every remaining positional argument. */
  remaining?: boolean
  /** Allowed values. Matching ignores case. */
  values?: string[]
  help?: string
  /** The directory attribute this parameter sets one to one. GUI console equivalents use it (T07 D7). */
  attribute?: string
}

export interface ParameterSet {
  name: string
  parameters: ParameterSpec[]
}

/** One bound call of a cmdlet. `params` is keyed by the canonical parameter name. */
export interface Invocation {
  spec: CmdletSpec
  /** The command name as the learner typed it. */
  commandName: string
  parameterSet: string
  params: Record<string, PsValue>
  /** Pipeline input that passed the `inputTypes` check. Empty for the first command. */
  input: PsValue[]
  whatIf: boolean
  /** `true` for -Confirm, `false` for -Confirm:$false, `undefined` when not given. */
  confirm?: boolean
  line: number
  column: number
}

export interface CmdletSpec {
  name: string
  module: string
  aliases?: string[]
  parameterSets: ParameterSet[]
  /** The set tried first. Defaults to the first set. */
  defaultParameterSet?: string
  /** Accepted pipeline type names. 'System.Object' accepts any value. Empty means no pipeline input. */
  inputTypes: string[]
  outputType?: string
  defaultDisplay?: string[]
  supportsWhatIf: boolean
  confirmImpact: 'none' | 'low' | 'medium' | 'high'
  help: { synopsis: string; examples: { code: string; explain: string }[] }
  run(inv: Invocation, rt: Runtime): Iterable<PsValue>
}

/** Common parameters every cmdlet with `supportsWhatIf` accepts. */
export const COMMON_PARAMETERS: readonly ParameterSpec[] = [
  { name: 'WhatIf', type: 'switch', help: 'Shows what the command would change. Changes nothing.' },
  { name: 'Confirm', type: 'switch', help: 'Asks before each change. Use -Confirm:$false to skip the question.' },
]

/** Every parameter a cmdlet accepts across its parameter sets, without duplicates, plus common parameters. */
export function parametersOf(spec: CmdletSpec): ParameterSpec[] {
  const seen = new Map<string, ParameterSpec>()
  for (const set of spec.parameterSets) for (const parameter of set.parameters) if (!seen.has(parameter.name.toLowerCase())) seen.set(parameter.name.toLowerCase(), parameter)
  if (spec.supportsWhatIf) for (const parameter of COMMON_PARAMETERS) if (!seen.has(parameter.name.toLowerCase())) seen.set(parameter.name.toLowerCase(), parameter)
  return [...seen.values()]
}

const TYPE_LABEL: Record<ParamType, string> = {
  'string': 'string', 'string[]': 'string[]', 'int': 'int', 'bool': 'bool', 'switch': '', 'object': 'Object', 'object[]': 'Object[]',
  'scriptblock': 'scriptblock', 'hashtable': 'hashtable', 'secure': 'securestring',
}

/** One syntax line per parameter set, in the layout Get-Help uses. */
export function syntaxOf(spec: CmdletSpec): string[] {
  return spec.parameterSets.map((set) => {
    const ordered = [...set.parameters].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    const parts = ordered.map((parameter) => {
      if (parameter.type === 'switch') return `[-${parameter.name}]`
      const value = `<${TYPE_LABEL[parameter.type]}>`
      const name = parameter.position === undefined ? `-${parameter.name}` : `[-${parameter.name}]`
      return parameter.mandatory ? `${name} ${value}` : `[${name} ${value}]`
    })
    if (spec.supportsWhatIf) parts.push('[-WhatIf]', '[-Confirm]')
    return [spec.name, ...parts].join(' ')
  })
}

/**
 * The one list of cmdlets. Help, tab completion, syntax highlighting and
 * the binder all read from here.
 */
export class Registry {
  private readonly byName = new Map<string, CmdletSpec>()
  private readonly specs: CmdletSpec[] = []

  register(...specs: CmdletSpec[]): this {
    for (const spec of specs) {
      for (const name of [spec.name, ...(spec.aliases ?? [])]) {
        const key = name.toLowerCase()
        if (this.byName.has(key)) throw new Error(`The command name ${name} is registered twice.`)
        this.byName.set(key, spec)
      }
      this.specs.push(spec)
    }
    return this
  }

  /** Finds a cmdlet by name or alias. Matching ignores case. */
  resolve(name: string): CmdletSpec | undefined {
    return this.byName.get(name.toLowerCase())
  }

  /** All cmdlets sorted by name, or the cmdlets of one module. */
  list(module?: string): CmdletSpec[] {
    const wanted = module?.toLowerCase()
    return this.specs.filter((spec) => wanted === undefined || spec.module.toLowerCase() === wanted).sort((a, b) => a.name.localeCompare(b.name))
  }

  modules(): string[] {
    return [...new Set(this.specs.map((spec) => spec.module))].sort()
  }

  /** Default display columns for a pipeline type, taken from the cmdlet that declares it as output. */
  displayFor(typeName: string): string[] | undefined {
    const wanted = typeName.toLowerCase()
    return this.specs.find((spec) => spec.outputType?.toLowerCase() === wanted && spec.defaultDisplay)?.defaultDisplay
  }
}
