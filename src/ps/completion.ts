import { parametersOf, type Registry } from './registry'
import { tokenize, type Token } from './tokenizer'

export interface Completion {
  /** Start of the text to replace, as a zero-based offset into the source. */
  start: number
  /** End of the text to replace. This is the cursor offset. */
  end: number
  candidates: string[]
}

const BREAKS = ' \t\r\n|;{}(),='

/**
 * Tab completion. It offers cmdlet names where a command starts and parameter
 * names after a known cmdlet. Every candidate comes from the registry.
 */
export function complete(source: string, cursor: number, registry: Registry): Completion {
  const end = Math.max(0, Math.min(cursor, source.length))
  let start = end
  while (start > 0 && !BREAKS.includes(source[start - 1])) start--
  const word = source.slice(start, end)
  const none: Completion = { start, end, candidates: [] }

  // An open string or comment before the cursor means the cursor is inside it.
  const before = tokenize(source.slice(0, start))
  if (before.errors.length) return none
  const tokens = before.tokens.filter((token) => token.kind !== 'eof')
  let from = 0
  tokens.forEach((token: Token, index) => {
    const opensCommand = token.kind === 'separator' || (token.kind === 'punctuation' && (token.value === '|' || token.value === '{' || token.value === '='))
    if (opensCommand) from = index + 1
  })
  const segment = tokens.slice(from)
  const prefix = word.toLowerCase()

  if (!segment.length) {
    if (word.startsWith('-') || word.startsWith('$') || word.startsWith('@')) return none
    const names = registry.list().map((spec) => spec.name).filter((name) => name.toLowerCase().startsWith(prefix))
    return { start, end, candidates: names }
  }
  const spec = segment[0].kind === 'word' ? registry.resolve(segment[0].value) : undefined
  if (!spec || !word.startsWith('-')) return none
  const candidates = parametersOf(spec).map((parameter) => `-${parameter.name}`).filter((name) => name.toLowerCase().startsWith(prefix)).sort((a, b) => a.localeCompare(b))
  return { start, end, candidates }
}
