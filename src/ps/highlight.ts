import type { Registry } from './registry'
import { tokenize, type Token } from './tokenizer'

export type SpanKind = 'command' | 'unknownCommand' | 'parameter' | 'string' | 'number' | 'variable' | 'operator' | 'punctuation' | 'comment' | 'text'

export interface Span {
  /** Zero-based offsets into the source. `end` is exclusive. */
  start: number
  end: number
  kind: SpanKind
}

function offsets(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1)
  return starts
}

/** Finds where a token ends in the source. Token values differ from source text for strings and escapes. */
function endOf(source: string, start: number, token: Token): number {
  if (token.kind === 'string') {
    const quote = source[start]
    let i = start + 1
    while (i < source.length) {
      if (quote === '"' && source[i] === '`') { i += 2; continue }
      if (source[i] === quote) { if (source[i + 1] === quote) { i += 2; continue } return i + 1 }
      i++
    }
    return source.length
  }
  if (token.kind === 'variable' && source[start + 1] === '{') {
    const close = source.indexOf('}', start)
    return close === -1 ? source.length : close + 1
  }
  if (token.kind === 'word') {
    let i = start, taken = 0
    while (i < source.length && taken < token.value.length) { if (source[i] === '`') i++; i++; taken++ }
    return Math.min(i, source.length)
  }
  return Math.min(start + token.value.length, source.length)
}

/**
 * Colors learner input for the terminal. Positions come from the tokenizer.
 * A word in command position is checked against the registry, so an unknown
 * command looks different before it is run.
 */
export function highlight(source: string, registry: Registry): Span[] {
  const lineStarts = offsets(source)
  const spans: Span[] = []
  let commandNext = true
  for (const token of tokenize(source).tokens) {
    if (token.kind === 'eof') break
    const start = (lineStarts[token.line - 1] ?? 0) + token.column - 1
    // A newline separator has no text of its own.
    if (token.kind === 'separator' && source[start] !== ';') { commandNext = true; continue }
    let kind: SpanKind
    switch (token.kind) {
      case 'word': kind = commandNext ? (registry.resolve(token.value) ? 'command' : 'unknownCommand') : 'text'; break
      case 'parameter': kind = token.value.startsWith('@') ? 'variable' : 'parameter'; break
      case 'string': case 'number': case 'variable': case 'operator': kind = token.kind; break
      default: kind = 'punctuation'
    }
    spans.push({ start, end: endOf(source, start, token), kind })
    commandNext = token.kind === 'separator' || (token.kind === 'punctuation' && (token.value === '|' || token.value === '{' || token.value === '='))
  }
  // Text the tokenizer skipped and that is not white space is a comment.
  const result: Span[] = []
  let cursor = 0
  const gap = (to: number) => {
    const text = source.slice(cursor, to)
    const lead = text.length - text.trimStart().length, body = text.trim()
    if (body) result.push({ start: cursor + lead, end: cursor + lead + body.length, kind: body.startsWith('#') || body.startsWith('<#') ? 'comment' : 'text' })
  }
  for (const span of spans) {
    if (span.start > cursor) gap(span.start)
    result.push(span)
    cursor = Math.max(cursor, span.end)
  }
  gap(source.length)
  return result
}
