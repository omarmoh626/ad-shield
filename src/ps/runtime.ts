import type { DomainState, Guid } from '../domain/types'
import { dispatch } from '../engine/dispatch'
import type { Action, ActionResult } from '../engine/types'
import type { Command, Expr, Pipeline, Script, Statement } from './ast'
import { bind, resolveParameter, type RawItem } from './binder'
import { coreCmdlets } from './cmdlets/core'
import { utilityCmdlets } from './cmdlets/utility'
import { adCmdlets } from './cmdlets/ad'
import { managementCmdlets } from './cmdlets/management'
import { simCmdlets } from './cmdlets/sim'
import { diagnosticsCmdlets } from './cmdlets/diagnostics'
import { LAB_HOME } from './cmdlets/management/location'
import { formatValues } from './format'
import { parse } from './parser'
import { Registry, type CmdletSpec, type Invocation } from './registry'
import { HASHTABLE, PsError, SCRIPTBLOCK, SECURE, getProperty, isHashtable, isTruthy, psCompare, psEquals, toText, typeNameOf, wildcardMatch, type PsScriptBlock, type PsSecure, type PsValue } from './values'

export interface TranscriptEntry {
  kind: 'input' | 'output' | 'error' | 'prompt'
  text: string
}

export interface ConsoleResult {
  /** Display text, formatted after each pipeline finished. */
  output: string
  /** The pipeline values behind `output`. */
  values: PsValue[]
  errors: PsError[]
  /**
   * The domain state after the run. It is the input reference, unchanged, when the run is
   * pending, when the input has a parse or name error, and when no action changed anything.
   */
  state: DomainState
  /** Results of actions that changed the simulated domain during this run, in order. Empty when `pending` is set. */
  committed: ActionResult[]
  /**
   * Set when the run stopped because a hook had no answer yet. The run changed nothing.
   * The host asks the learner, stores the answer, and runs the same input again with the same state.
   */
  pending?: PendingInput
}

/** The question a run is waiting on. */
export interface PendingInput {
  kind: 'line' | 'secure' | 'confirm'
  prompt: string
}

export interface RuntimeOptions {
  registry: Registry
  /** The analyst's operator account. Every action of this console runs as this account. */
  actor: Guid
  /**
   * The three input hooks are synchronous. A hook returns `undefined` when the learner has not
   * answered yet. The run then stops with `pending` set and leaves no trace in the runtime.
   * The host shows the prompt, stores the answer, and runs the same input again.
   */
  /** Asks the learner for a line of text. */
  readLine?: (prompt: string) => string | undefined
  /**
   * Asks the learner for simulated secure input and returns the policy verdict only.
   * The host checks the typed characters and discards them. They never reach the runtime.
   */
  readSecure?: (prompt: string) => { policy: 'pass' | 'fail' } | undefined
  /** Asks the learner to confirm a change. Without this hook, a change that needs confirmation is cancelled. */
  confirm?: (message: string) => boolean | undefined
}

/** What a cmdlet may use while it runs. */
export interface Runtime {
  readonly registry: Registry
  readonly transcript: TranscriptEntry[]
  readonly history: string[]
  /** The domain state as the current run sees it. It includes the changes of earlier commands in the same run. */
  readonly state: DomainState
  /** The console location: `C:\Lab` at startup, or a path on the simulated `AD:` drive (T03 D2). */
  readonly location: string
  /** The prompt the terminal shows before input, for example `PS C:\Lab>`. */
  readonly prompt: string
  /** Sets the console location. Set-Location validates the path before it calls this. */
  setLocation(path: string): void
  getVariable(name: string): PsValue
  setVariable(name: string, value: PsValue): void
  /**
   * Sends an action through the engine's pure `dispatch` against the state of the current run.
   * Honors -WhatIf and -Confirm from the invocation. The change lasts only if the run finishes without `pending`.
   */
  dispatch(action: Action, inv: Invocation): ActionResult
  /** Reports a failed record. The pipeline continues with the next record. */
  writeError(error: { message: string; identity?: string }): void
  /** Shows a line of text that is not pipeline output. */
  writeHost(text: string): void
  readLine(prompt: string): string
  readSecure(prompt: string): PsSecure
  /** Runs a script block with `$_` set to `item` and returns its last value. */
  invokeBlock(block: PsScriptBlock, item: PsValue): PsValue
  execute(source: string, state: DomainState): ConsoleResult
}

interface Frame {
  errors: PsError[]
  committed: ActionResult[]
  values: PsValue[]
  chunks: string[]
}

/** Thrown inside a run when a hook has no answer yet. It unwinds the whole run. */
class Pending extends Error {
  constructor(readonly input: PendingInput) { super('pending input') }
}

/** Automatic constants inside an expandable string. `null` maps to the PowerShell null value, which expands to empty text. */
const EXPANDED_CONSTANTS = new Map<string, PsValue>([['true', true], ['false', false], ['null', null]])
const RESERVED = new Set(['_', 'psitem', 'true', 'false', 'null', 'pwd'])
const BLOCK_RULE = 'Only one comparison expression is supported inside a script block in this lab.'

class ConsoleRuntime implements Runtime {
  readonly registry: Registry
  readonly transcript: TranscriptEntry[] = []
  readonly history: string[] = []
  private readonly variables = new Map<string, PsValue>()
  private frame: Frame = { errors: [], committed: [], values: [], chunks: [] }
  /** The working state of the run in progress. The caller's state object is never changed. */
  private draft: DomainState | undefined

  constructor(private readonly options: RuntimeOptions) { this.registry = options.registry }

  get state(): DomainState {
    if (!this.draft) throw new PsError('No simulated domain is attached to this console yet.')
    return this.draft
  }

  // The location lives in the variable table as $PWD, so a pending run restores it with the other variables.
  get location(): string { const value = this.variables.get('pwd'); return typeof value === 'string' ? value : LAB_HOME }
  get prompt(): string { return `PS ${this.location}>` }
  setLocation(path: string): void { this.variables.set('pwd', path) }

  getVariable(name: string): PsValue { const key = name.toLowerCase(); return key === 'pwd' ? this.location : this.variables.get(key) ?? null }
  setVariable(name: string, value: PsValue): void { this.variables.set(name.toLowerCase(), value) }

  private helpHint(preferred?: CmdletSpec): string | undefined {
    if (!this.registry.resolve('Get-Help')) return undefined
    const target = preferred ?? this.registry.resolve('Get-Command')
    return target ? `Get-Help ${target.name} -Examples` : 'Get-Help'
  }

  dispatch(action: Action, inv: Invocation): ActionResult {
    const mustConfirm = inv.confirm === true || (inv.confirm === undefined && inv.spec.confirmImpact === 'high')
    if (!inv.whatIf && mustConfirm) {
      const prompt = `Confirm: run ${inv.spec.name} against the simulated domain?`
      const ask = this.options.confirm
      const answer = ask ? ask(prompt) : false
      if (answer === undefined) throw new Pending({ kind: 'confirm', prompt })
      if (!answer) throw new PsError(`${inv.spec.name} was cancelled because the change was not confirmed. Nothing changed. Add -Confirm:$false to run it without the question.`)
      this.transcript.push({ kind: 'prompt', text: `${prompt}: yes` })
    }
    const current = this.state
    const result = dispatch(current, action, { actor: this.options.actor, source: 'console', whatIf: inv.whatIf })
    // The draft moves forward only for a real change. A preview and a failed action leave it alone.
    if (!inv.whatIf && result.ok && result.state !== current) {
      this.draft = result.state
      this.frame.committed.push(result)
    }
    return result
  }

  writeError(error: { message: string; identity?: string }): void {
    this.frame.errors.push(new PsError(error.message, error.identity === undefined ? {} : { identity: error.identity }))
  }

  writeHost(text: string): void { this.frame.chunks.push(text) }

  readLine(prompt: string): string {
    const hook = this.options.readLine
    if (!hook) throw new PsError('Read-Host: this console cannot ask for input right now.')
    const answer = hook(prompt)
    if (answer === undefined) throw new Pending({ kind: 'line', prompt })
    this.transcript.push({ kind: 'prompt', text: `${prompt}: ${answer}` })
    return answer
  }

  readSecure(prompt: string): PsSecure {
    const hook = this.options.readSecure
    if (!hook) throw new PsError('Read-Host: this console cannot ask for simulated secure input right now.')
    // Copy the verdict field only. Anything else a host returns by mistake is dropped here.
    const verdict = hook(prompt)
    if (verdict === undefined) throw new Pending({ kind: 'secure', prompt })
    const policy = verdict.policy === 'pass' ? 'pass' : 'fail'
    this.transcript.push({ kind: 'prompt', text: `${prompt}: ******** (simulated secure input, not stored)` })
    return { typeName: SECURE, properties: {}, text: SECURE, credential: { policy } }
  }

  invokeBlock(block: PsScriptBlock, item: PsValue): PsValue {
    let last: PsValue = null
    for (const statement of block.block.statements) {
      const expression = statement.pipeline.kind === 'pipeline' && statement.pipeline.commands.length === 1 ? statement.pipeline.commands[0].expression : undefined
      if (!expression) throw new PsError(BLOCK_RULE, { line: statement.line, column: statement.column })
      last = this.evaluate(expression, item)
    }
    return last
  }

  private evaluate(expr: Expr, item: PsValue): PsValue {
    switch (expr.kind) {
      case 'literal':
        if (!expr.parts) return expr.value
        // Inside double quotes $true, $false, and $null expand as in PowerShell: "True", "False", and "" (T03 D10).
        return expr.parts.map((part) => (part.kind === 'text' ? part.value : toText(EXPANDED_CONSTANTS.has(part.name.toLowerCase()) ? EXPANDED_CONSTANTS.get(part.name.toLowerCase()) as PsValue : this.variable(part.name, item)))).join('')
      case 'variable': return this.variable(expr.name, item)
      case 'property': return getProperty(this.evaluate(expr.target, item), expr.name) ?? null
      case 'array': return expr.items.map((entry) => this.evaluate(entry, item))
      case 'hashtable': return { typeName: HASHTABLE, properties: Object.fromEntries(expr.entries.map((entry) => [entry.key, this.evaluate(entry.value, item)])) }
      case 'scriptBlock': return { typeName: SCRIPTBLOCK, properties: {}, text: '{ ... }', block: expr } as PsScriptBlock
      case 'splat': throw new PsError(`Splatting with @${expr.variable.name} is only valid as a command argument.`, { line: expr.line, column: expr.column })
      case 'unary': return !isTruthy(this.evaluate(expr.operand, item))
      case 'binary': return this.binary(expr.operator, this.evaluate(expr.left, item), () => this.evaluate(expr.right, item))
    }
  }

  private variable(name: string, item: PsValue): PsValue {
    const key = name.toLowerCase()
    return key === '_' || key === 'psitem' ? item : this.getVariable(key)
  }

  private binary(operator: string, left: PsValue, right: () => PsValue): PsValue {
    if (operator === '-and') return isTruthy(left) && isTruthy(right())
    if (operator === '-or') return isTruthy(left) || isTruthy(right())
    const other = right()
    const test = (value: PsValue): boolean => {
      switch (operator) {
        case '-eq': return psEquals(value, other)
        case '-ne': return !psEquals(value, other)
        case '-like': return wildcardMatch(toText(other), toText(value))
        case '-notlike': return !wildcardMatch(toText(other), toText(value))
        case '-gt': return psCompare(value, other) > 0
        case '-ge': return psCompare(value, other) >= 0
        case '-lt': return psCompare(value, other) < 0
        case '-le': return psCompare(value, other) <= 0
        default: throw new PsError(`The operator ${operator} is not supported in this lab.`)
      }
    }
    // A list on the left filters: the result is the items that pass the comparison.
    return Array.isArray(left) ? left.filter(test) : test(left)
  }

  /**
   * Checks every command and parameter name in the script before anything runs.
   * One bad name anywhere means the whole input changes nothing.
   */
  private validate(script: Script): PsError[] {
    const errors: PsError[] = []
    const at = (node: { line: number; column: number }) => ({ line: node.line, column: node.column })
    const walkExpr = (expr: Expr | undefined): void => {
      if (!expr) return
      switch (expr.kind) {
        case 'property': walkExpr(expr.target); break
        case 'array': expr.items.forEach(walkExpr); break
        case 'hashtable': expr.entries.forEach((entry) => walkExpr(entry.value)); break
        case 'unary': walkExpr(expr.operand); break
        case 'binary': walkExpr(expr.left); walkExpr(expr.right); break
        case 'scriptBlock':
          for (const statement of expr.statements) {
            const only = statement.pipeline.kind === 'pipeline' && statement.pipeline.commands.length === 1 ? statement.pipeline.commands[0] : undefined
            if (!only?.expression) errors.push(new PsError(BLOCK_RULE, { ...at(statement), help: this.helpHint(this.registry.resolve('Where-Object')) }))
            else walkExpr(only.expression)
          }
          break
        default: break
      }
    }
    const walkCommand = (command: Command, index: number): void => {
      if (command.name === '') {
        if (index > 0) errors.push(new PsError('An expression is only allowed as the first item of a pipeline.', at(command)))
        walkExpr(command.expression)
        return
      }
      const spec = this.registry.resolve(command.name)
      if (!spec) { errors.push(this.unknownCommand(command)); return }
      for (const parameter of command.parameters) {
        try { resolveParameter(spec, parameter.name) } catch (error) {
          if (!(error instanceof PsError)) throw error
          Object.assign(error, at(parameter))
          errors.push(error)
        }
        walkExpr(parameter.value)
      }
      for (const argument of command.arguments) if (argument.value.kind !== 'splat') walkExpr(argument.value)
    }
    for (const statement of script.statements) {
      const pipeline = statement.pipeline.kind === 'assignment' ? statement.pipeline.value : statement.pipeline
      if (statement.pipeline.kind === 'assignment' && RESERVED.has(statement.pipeline.target.name.toLowerCase())) {
        errors.push(new PsError(`The variable $${statement.pipeline.target.name} is read-only in this lab.`, at(statement)))
      }
      pipeline.commands.forEach(walkCommand)
    }
    return errors
  }

  private unknownCommand(command: Command): PsError {
    const typed = command.name.toLowerCase()
    const noun = typed.includes('-') ? typed.slice(typed.indexOf('-') + 1) : ''
    const near = this.registry.list().find((spec) => noun !== '' && spec.name.toLowerCase().endsWith(`-${noun}`))
    const listing = this.registry.resolve('Get-Command') ? ' Run Get-Command to list what is available.' : ''
    return new PsError(`The term '${command.name}' is not a command in this lab. Nothing was run.${listing}`, { line: command.line, column: command.column, help: this.helpHint(near) })
  }

  private rawItems(command: Command): RawItem[] {
    const ordered = [
      ...command.parameters.map((parameter) => ({ parameter, argument: undefined, line: parameter.line, column: parameter.column })),
      ...command.arguments.map((argument) => ({ parameter: undefined, argument, line: argument.line, column: argument.column })),
    ].sort((a, b) => a.line - b.line || a.column - b.column)
    const items: RawItem[] = []
    for (const { parameter, argument, line, column } of ordered) {
      if (parameter) {
        items.push({ kind: 'named', name: parameter.name, hasValue: parameter.value !== undefined, value: parameter.value ? this.evaluate(parameter.value, null) : null, colon: parameter.colon, line, column })
      } else if (argument && argument.value.kind === 'splat') {
        const name = argument.value.variable.name, value = this.getVariable(name)
        if (isHashtable(value)) for (const [key, entry] of Object.entries(value.properties)) items.push({ kind: 'named', name: key, hasValue: true, value: entry, colon: true, line, column })
        else if (Array.isArray(value)) for (const entry of value) items.push({ kind: 'positional', value: entry, line, column })
        else throw new PsError(`The variable $${name} must hold a hashtable or a list before it can be splatted with @${name}.`, { line, column })
      } else if (argument) items.push({ kind: 'positional', value: this.evaluate(argument.value, null), line, column })
    }
    return items
  }

  private report(error: unknown, command?: Command, spec?: CmdletSpec): void {
    if (error instanceof Pending) throw error
    const reported = error instanceof PsError ? error : new PsError(`${spec?.name ?? 'The command'} failed inside the simulator: ${error instanceof Error ? error.message : 'unknown error'}.`)
    if (command) { reported.line ??= command.line; reported.column ??= command.column }
    this.frame.errors.push(reported)
  }

  private runCommand(command: Command, input: PsValue[], piped: boolean): PsValue[] {
    const spec = this.registry.resolve(command.name)
    if (!spec) throw this.unknownCommand(command)
    const bound = bind(spec, this.rawItems(command), { pipelineInput: piped })
    if (piped && !spec.inputTypes.length) throw new PsError(`${spec.name} does not take pipeline input.`, { help: this.helpHint(spec) })
    const accepts = (value: PsValue) => spec.inputTypes.some((type) => type === 'System.Object' || type.toLowerCase() === typeNameOf(value).toLowerCase())
    const accepted = input.filter((value) => {
      if (accepts(value)) return true
      this.frame.errors.push(new PsError(`${spec.name} cannot use pipeline input of type ${typeNameOf(value)}.`, { identity: toText(value), line: command.line, column: command.column }))
      return false
    })
    const inv: Invocation = { spec, commandName: command.name, ...bound, input: accepted, line: command.line, column: command.column }
    const output: PsValue[] = []
    // Results a cmdlet returned before it failed are kept and flow to the next command.
    try { for (const value of spec.run(inv, this)) output.push(value) } catch (error) { this.report(error, command, spec) }
    return output
  }

  private runPipeline(pipeline: Pipeline): PsValue[] {
    let values: PsValue[] = []
    pipeline.commands.forEach((command, index) => {
      if (command.name === '') {
        if (index > 0 || !command.expression) throw new PsError('An expression is only allowed as the first item of a pipeline.', { line: command.line, column: command.column })
        const value = this.evaluate(command.expression, null)
        values = Array.isArray(value) ? value : value === null ? [] : [value]
      } else values = this.runCommand(command, values, index > 0)
    })
    return values
  }

  private runStatement(statement: Statement): void {
    const target = statement.pipeline.kind === 'assignment' ? statement.pipeline.target : undefined
    let values: PsValue[]
    try { values = this.runPipeline(statement.pipeline.kind === 'assignment' ? statement.pipeline.value : statement.pipeline) } catch (error) { this.report(error); return }
    if (target) { this.setVariable(target.name, values.length === 0 ? null : values.length === 1 ? values[0] : values); return }
    this.frame.values.push(...values)
    // Formatting happens here, after the whole pipeline of the statement has finished.
    const text = formatValues(values, this.registry)
    if (text) this.frame.chunks.push(text)
  }

  execute(source: string, state: DomainState): ConsoleResult {
    this.draft = state
    const before = { variables: new Map(this.variables), history: this.history.length, transcript: this.transcript.length }
    this.history.push(source)
    this.transcript.push({ kind: 'input', text: source })
    const frame: Frame = this.frame = { errors: [], committed: [], values: [], chunks: [] }
    let parsed: ReturnType<typeof parse>
    try { parsed = parse(source) } catch { parsed = { errors: [{ message: 'The input is nested too deeply to read.', line: 1, column: 1 }] } }
    if (parsed.errors.length || !parsed.script) {
      frame.errors.push(...parsed.errors.map((error) => new PsError(error.message, { line: error.line, column: error.column, help: this.helpHint() })))
    } else {
      const invalid = this.validate(parsed.script)
      if (invalid.length) frame.errors.push(...invalid)
      else {
        try { for (const statement of parsed.script.statements) this.runStatement(statement) } catch (error) {
          // Drop the draft first. Nothing from a run that did not finish may last.
          this.draft = state
          if (!(error instanceof Pending)) throw error
          // Undo everything this run recorded. The host runs the same input again once it has the answer.
          this.variables.clear()
          for (const [name, value] of before.variables) this.variables.set(name, value)
          this.history.length = before.history
          this.transcript.length = before.transcript
          return { output: '', values: [], errors: [], state, committed: [], pending: error.input }
        }
      }
    }
    const output = frame.chunks.join('\n')
    if (output) this.transcript.push({ kind: 'output', text: output })
    for (const error of frame.errors) this.transcript.push({ kind: 'error', text: error.help ? `${error.message} Try: ${error.help}` : error.message })
    return { output, values: frame.values, errors: frame.errors, state: this.draft, committed: frame.committed }
  }
}

export function createRuntime(options: RuntimeOptions): Runtime {
  return new ConsoleRuntime(options)
}

/** A registry with the discovery cmdlets of this slice. Later tasks register more modules on it. */
export function createDefaultRegistry(): Registry {
  return new Registry().register(...coreCmdlets, ...utilityCmdlets, ...managementCmdlets, ...adCmdlets, ...diagnosticsCmdlets, ...simCmdlets)
}

/**
 * Runs learner input against a domain state and returns the new state.
 * The runtime owns the transaction: it threads the state through the engine's pure
 * `dispatch`, and the caller's state object is never changed. A syntax error, an unknown
 * command, an unknown parameter name, or a pending prompt returns the input state reference.
 */
export function run(source: string, rt: Runtime, state: DomainState): ConsoleResult {
  return rt.execute(source, state)
}
