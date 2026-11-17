import type { Argument, Assignment, Command, Expr, Parameter, Pipeline, Script, Statement } from './ast'
import { parseError, type ParseError } from './errors'
import { tokenize, type Token, type TokenizeResult } from './tokenizer'

export interface ParseResult { script?: Script; errors: ParseError[] }
const unsupported = 'Unsupported syntax: subexpressions, loops, if, functions, method calls, redirection, call operators.'

class Parser {
  private i = 0
  readonly errors: ParseError[]
  constructor(private readonly tokens: Token[], initial: ParseError[] = []) { this.errors = [...initial] }
  private get t(): Token { return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1] }
  private take(): Token { const t = this.t; if (this.i < this.tokens.length - 1) this.i++; return t }
  private accept(value: string): Token | undefined { const kind = '|{}(),;.:='.includes(value) ? 'punctuation' : 'word'; if (value === ';') { if (this.t.kind === 'separator') return this.take() } else if (this.t.kind === kind && this.t.value.toLowerCase() === value.toLowerCase()) return this.take(); return undefined }
  private fail(message: string, t = this.t, extra?: string): void { this.errors.push(parseError(extra ? `${message} ${extra}` : message, t.line, t.column, extra)) }
  parse(): ParseResult {
    const start = this.t, statements: Statement[] = []
    while (this.t.kind !== 'eof') {
      if (this.t.kind === 'separator') { this.take(); continue }
      const before = this.i, statement = this.statement()
      if (statement) statements.push(statement)
      if (this.i === before) { this.fail(`Unexpected token '${this.t.value}'.`); this.take() }
      if ((this.t as Token).kind !== 'separator' && (this.t as Token).kind !== 'eof') { this.fail(`Expected statement separator before '${this.t.value}'.`); while ((this.t as Token).kind !== 'separator' && (this.t as Token).kind !== 'eof') this.take() }
    }
    if (this.errors.length) return { errors: this.errors }
    return { script: { kind: 'script', statements, line: start.line, column: start.column }, errors: [] }
  }
  private statement(): Statement | undefined {
    const start = this.t
    if (start.kind === 'word' && ['if', 'while', 'for', 'foreach', 'do', 'function'].includes(start.value.toLowerCase())) {
      this.fail(`Unsupported syntax near '${start.value}'. ${unsupported}`, start, unsupported)
      while (this.t.kind !== 'separator' && this.t.kind !== 'eof' && this.t.value !== '}') this.take()
      return undefined
    }
    let pipeline: Pipeline | Assignment
    if (this.t.kind === 'variable' && this.tokens[this.i + 1]?.kind === 'punctuation' && this.tokens[this.i + 1]?.value === '=') {
      const targetToken = this.take(); this.take()
      const value = this.pipeline()
      pipeline = { kind: 'assignment', target: { kind: 'variable', name: targetToken.value.slice(1), line: targetToken.line, column: targetToken.column }, value, line: start.line, column: start.column }
    } else pipeline = this.pipeline()
    return { kind: 'statement', pipeline, line: start.line, column: start.column }
  }
  private pipeline(): Pipeline {
    const start = this.t, commands: Command[] = []
    commands.push(this.command())
    while (this.accept('|')) {
      if (this.t.kind === 'separator' || this.t.kind === 'eof') { this.fail('A pipeline cannot end without a command.'); break }
      commands.push(this.command())
    }
    return { kind: 'pipeline', commands, line: start.line, column: start.column }
  }
  private command(): Command {
    const start = this.t
    if (this.t.kind === 'punctuation' && this.t.value === '(') { this.fail(`Subexpressions are not supported. ${unsupported}`, start, unsupported); this.skipGroup('(', ')') }
    if (this.t.kind === 'punctuation' && this.t.value === '&') this.fail(`Call operators are not supported. ${unsupported}`, start, unsupported)
    if (this.t.kind !== 'word' && this.startsValue(this.t)) {
      const expression = this.expression()
      return { kind: 'command', name: '', expression, parameters: [], arguments: [], line: start.line, column: start.column }
    }
    if ((this.t as Token).kind !== 'word') { this.fail(`Expected command name, got '${this.t.value}'.`); if ((this.t as Token).kind !== 'eof') this.take(); return { kind: 'command', name: '', parameters: [], arguments: [], line: start.line, column: start.column } }
    const name = this.take().value, parameters: Parameter[] = [], args: Argument[] = []
    while ((this.t as Token).kind !== 'eof' && (this.t as Token).kind !== 'separator' && !(this.t.kind === 'punctuation' && this.t.value === '|')) {
      if (this.t.kind === 'parameter' && this.t.value.startsWith('-')) {
        const p = this.take(), pname = p.value.slice(1)
        if ((this.t as Token).kind === 'punctuation' && this.t.value === ':') { this.take(); const value = this.expression(); parameters.push({ kind: 'parameter', name: pname, value, switch: false, colon: true, line: p.line, column: p.column }) }
        else if ((this.t as Token).kind === 'punctuation' && this.t.value === '=' && !args.length && !parameters.length) { this.fail(`Assignment operators are not valid here. ${unsupported}`, this.t, unsupported); this.take() }
        else if (this.startsValue(this.t)) { const value = this.expression(); parameters.push({ kind: 'parameter', name: pname, value, switch: false, colon: false, line: p.line, column: p.column }) }
        else parameters.push({ kind: 'parameter', name: pname, switch: true, colon: false, line: p.line, column: p.column })
      } else if ((this.t as Token).kind === 'parameter' && this.t.value.startsWith('@')) {
        const t = this.take(), variable = { kind: 'variable' as const, name: t.value.slice(1), line: t.line, column: t.column }
        args.push({ kind: 'argument', value: { kind: 'splat', variable, line: t.line, column: t.column }, line: t.line, column: t.column })
      } else if (this.startsValue(this.t)) { const t = this.t, value = this.expression(); args.push({ kind: 'argument', value, line: t.line, column: t.column }) }
      else { this.fail(`Unsupported syntax near '${this.t.value}'. ${unsupported}`, this.t, unsupported); this.take() }
    }
    return { kind: 'command', name, parameters, arguments: args, line: start.line, column: start.column }
  }
  private startsValue(t: Token): boolean { return ['word', 'string', 'number', 'variable'].includes(t.kind) || (t.kind === 'operator' && t.value.toLowerCase() === '-not') || (t.kind === 'punctuation' && ['{', '@'].includes(t.value)) }
  private expression(min = 0): Expr {
    if (this.t.kind === 'operator' && this.t.value.toLowerCase() === '-not') {
      const op = this.take(), operand = this.expression(4)
      let left: Expr = { kind: 'unary', operator: op.value.toLowerCase(), operand, line: op.line, column: op.column }
      return this.binaryTail(left, min)
    }
    const token = this.take(); let left: Expr
    if (token.kind === 'number') left = { kind: 'literal', value: Number(token.value), line: token.line, column: token.column }
    else if (token.kind === 'string') {
      const raw = token.value.replace(/^\u0001/, ''), parts: NonNullable<Extract<Expr, {kind:'literal'}>['parts']> = []
      if (token.quote === 'double' && /\$\(/.test(raw)) this.fail(`Subexpressions are not supported. ${unsupported}`, token, unsupported)
      if (token.quote === 'double') {
        const re = /\u0000.|\$[\w:?]+/gu; let offset = 0, match: RegExpExecArray | null
        while ((match = re.exec(raw))) { if (match.index > offset) parts.push({kind:'text', value:raw.slice(offset, match.index), line:token.line, column:token.column + offset + 1}); const escaped = match[0][0] === '\u0000'; const value = escaped ? match[0].slice(1) : match[0]; if (escaped) parts.push({kind:'text', value, line:token.line, column:token.column + match.index + 1}); else parts.push({kind:'variable', name:value.slice(1), line:token.line, column:token.column + match.index + 1}); offset = re.lastIndex }
        if (offset < raw.length) parts.push({kind:'text', value:raw.slice(offset), line:token.line, column:token.column + offset + 1})
        for (let j = parts.length - 1; j > 0; j--) { const current = parts[j], previous = parts[j - 1]; if (current.kind === 'text' && previous.kind === 'text') { previous.value += current.value; parts.splice(j, 1) } }
      }
      left = { kind: 'literal', value: raw.replace(/\u0000/g, ''), quote: token.quote, expandable: token.quote === 'double', ...(token.quote === 'double' ? {parts} : {}), line: token.line, column: token.column }
    }
    else if (token.kind === 'variable') {
      const automatic = token.value === '$_'
      const lower = token.value.toLowerCase()
      if (lower === '$true' || lower === '$false' || lower === '$null') left = { kind: 'literal', value: lower === '$null' ? null : lower === '$true', line: token.line, column: token.column }
      else {
        left = { kind: 'variable', name: token.value.slice(1), ...(automatic ? { automatic: true } : {}), line: token.line, column: token.column }
        while (this.accept('.')) { const prop = this.take(); if (prop.kind !== 'word') { this.fail('Expected property name after dot.', prop); break }; left = { kind: 'property', target: left, name: prop.value, line: prop.line, column: prop.column } }
        if (this.t.kind === 'punctuation' && this.t.value === '(') { this.fail(`Method calls are not supported. ${unsupported}`, this.t, unsupported); this.skipGroup('(', ')') }
      }
    } else if (token.kind === 'word') {
      const lower = token.value.toLowerCase()
      left = { kind: 'literal', value: lower === '$true' ? true : lower === '$false' ? false : lower === '$null' ? null : token.value, line: token.line, column: token.column }
      if (lower === 'true' || lower === '$true') left = { kind: 'literal', value: true, line: token.line, column: token.column }
      if (lower === 'false' || lower === '$false') left = { kind: 'literal', value: false, line: token.line, column: token.column }
      if (lower === 'null' || lower === '$null') left = { kind: 'literal', value: null, line: token.line, column: token.column }
    } else if (token.kind === 'punctuation' && token.value === '{') left = this.scriptBlock(token)
    else if (token.kind === 'punctuation' && token.value === '@' && this.accept('{')) left = this.hashtable(token)
    else if (token.kind === 'punctuation' && token.value === '(') { this.fail(`Subexpressions are not supported. ${unsupported}`, token, unsupported); this.skipGroup('(', ')'); left = { kind: 'literal', value: null, line: token.line, column: token.column } }
    else if (token.kind === 'punctuation' && (token.value === '>' || token.value === '<')) { this.fail(`Redirection is not supported. ${unsupported}`, token, unsupported); left = { kind: 'literal', value: null, line: token.line, column: token.column } }
    else { this.fail(`Expected expression, got '${token.value}'.`, token); left = { kind: 'literal', value: token.value, line: token.line, column: token.column } }
    if (this.accept(',')) {
      const items = [left]
      do { items.push(this.expression(2)) } while (this.accept(','))
      left = { kind: 'array', items, line: token.line, column: token.column }
    }
    return this.binaryTail(left, min)
  }
  private binaryTail(initial: Expr, min: number): Expr {
    let left = initial
    const precedence: Record<string, number> = { '-or': 1, '-and': 2, '-eq': 3, '-ne': 3, '-like': 3, '-notlike': 3, '-gt': 3, '-ge': 3, '-lt': 3, '-le': 3 }
    while (this.t.kind === 'operator' && (precedence[this.t.value.toLowerCase()] ?? -1) >= min) {
      const op = this.take(), prec = precedence[op.value.toLowerCase()], right = this.expression(prec + 1)
      left = { kind: 'binary', operator: op.value.toLowerCase(), left, right, line: op.line, column: op.column }
    }
    return left
  }
  private scriptBlock(open: Token): Expr {
    const statements: Statement[] = []
    while ((this.t as Token).kind !== 'eof' && !(this.t.kind === 'punctuation' && this.t.value === '}')) {
      if (this.t.kind === 'separator') { this.take(); continue }
      const before = this.i, stmt = this.statement(); if (stmt) statements.push(stmt)
      if (this.i === before) { this.fail(`Unexpected token '${this.t.value}'.`); this.take() }
      if ((this.t as Token).kind !== 'separator' && !(this.t.kind === 'punctuation' && this.t.value === '}') && (this.t as Token).kind !== 'eof') this.fail(`Expected statement separator before '${this.t.value}'.`)
    }
    if (!this.accept('}')) this.fail('Unbalanced brace: expected }.', open)
    return { kind: 'scriptBlock', statements, line: open.line, column: open.column }
  }
  private hashtable(open: Token): Expr {
    const entries: { key: string; value: Expr; line: number; column: number }[] = []
    while (this.t.kind !== 'eof' && !(this.t.kind === 'punctuation' && this.t.value === '}')) {
      if (this.t.kind === 'separator') { this.take(); continue }
      const key = this.take()
      if (!this.accept('=')) { this.fail('Expected = after hashtable key.', key); break }
      const value = this.expression(0); entries.push({ key: key.value, value, line: key.line, column: key.column })
      if (!(this.t.kind === 'punctuation' && this.t.value === '}') && (this.t as Token).kind !== 'separator') this.fail('Expected separator between hashtable entries.')
    }
    if (!this.accept('}')) this.fail('Unbalanced brace: expected }.', open)
    return { kind: 'hashtable', entries, line: open.line, column: open.column }
  }
  private skipGroup(open: string, close: string): void { let depth = 1; while (this.t.kind !== 'eof' && depth) { const t = this.take(); if (t.value === open) depth++; if (t.value === close) depth-- } }
}

export function parse(source: string): { script?: Script; errors: ParseError[] } {
  const lexed: TokenizeResult = tokenize(source)
  return new Parser(lexed.tokens, lexed.errors).parse()
}
