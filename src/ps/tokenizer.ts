import { parseError, type ParseError, type SourcePosition } from './errors'

export type TokenKind = 'word' | 'string' | 'number' | 'variable' | 'parameter' | 'operator' | 'punctuation' | 'separator' | 'eof'
export interface Token extends SourcePosition { kind: TokenKind; value: string; quote?: 'single' | 'double' }
export interface TokenizeResult { tokens: Token[]; errors: ParseError[] }

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\r'
const isBoundary = (c: string) => !c || isSpace(c) || c === '\n' || ';,|{}()<>'.includes(c)

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [], errors: ParseError[] = []
  let i = 0, line = 1, column = 1
  const braceKinds: ('hashtable' | 'block')[] = []
  const pos = (): SourcePosition => ({ line, column })
  const advance = () => { const c = source[i++]; if (c === '\n') { line++; column = 1 } else column++; return c }
  const add = (kind: TokenKind, value: string, start: SourcePosition, quote?: Token['quote']) => tokens.push({ kind, value, ...start, ...(quote ? { quote } : {}) })
  const isPropertyDot = (at: number): boolean => {
    if (source[at] !== '.') return false
    let start = at - 1
    while (start >= 0 && !isSpace(source[start]) && !';,|{}()'.includes(source[start]) && source[start] !== '\n') start--
    return /^\$[\w:?]+(?:\.[\w:?]+)*$/u.test(source.slice(start + 1, at))
  }
  while (i < source.length) {
    const c = source[i]
    if (isSpace(c)) { advance(); continue }
    if (c === '\n') { const p = pos(); advance(); if (!(tokens[tokens.length - 1]?.kind === 'punctuation' && tokens[tokens.length - 1]?.value === '|')) add('separator', ';', p); continue }
    if (c === '`') {
      const p = pos(); advance()
      if (source[i] === '\n') { advance(); continue }
      if (source[i] === '\r' && source[i + 1] === '\n') { advance(); advance(); continue }
      if (i < source.length) { const escaped = advance(); add('word', escaped, p); continue }
      errors.push(parseError('Backtick has no character to escape.', p.line, p.column)); continue
    }
    if (c === '<' && source[i + 1] === '#') {
      const p = pos(); advance(); advance(); let closed = false
      while (i < source.length) { if (source[i] === '#' && source[i + 1] === '>') { advance(); advance(); closed = true; break } advance() }
      if (!closed) errors.push(parseError('Unterminated block comment.', p.line, p.column))
      continue
    }
    if (c === '#') {
      if (source[i + 1] === '<') {
        const p = pos(); advance(); advance(); let closed = false
        while (i < source.length) { if (source[i] === '#' && source[i + 1] === '>') { advance(); advance(); closed = true; break } advance() }
        if (!closed) errors.push(parseError('Unterminated block comment.', p.line, p.column))
      } else while (i < source.length && source[i] !== '\n') advance()
      continue
    }
    if (c === '"' || c === "'") {
      const p = pos(), quote = c === '"' ? 'double' : 'single'; advance(); let value = '', closed = false
      let escaped = false
      while (i < source.length) {
        const ch = advance()
        if (ch === c) { if (source[i] === c) { value += advance(); continue } closed = true; break }
        if (ch === '`' && quote === 'double' && i < source.length) { escaped = true; value += '\u0000' + advance() }
        else if (ch === "'" && quote === 'single' && source[i] === "'") { advance(); value += "'" }
        else value += ch
      }
      if (!closed) errors.push(parseError('Unterminated string.', p.line, p.column))
      else add('string', (escaped ? '\u0001' : '') + value, p, quote)
      continue
    }
    const p = pos()
    if (c === '$' || c === '@') {
      const splat = c === '@'; advance(); let name = ''
      if (!splat && source[i] === '{') { advance(); while (i < source.length && source[i] !== '}') name += advance(); if (source[i] === '}') advance() }
      else while (i < source.length && /[\w:?]/u.test(source[i])) name += advance()
      if (!splat && source[i] === '=' && name) { add('variable', '$' + name, p); const eq = pos(); advance(); add('punctuation', '=', eq); continue }
      if (name) add(splat ? 'parameter' : 'variable', (splat ? '@' : '$') + name, p)
      else add('punctuation', c, p)
      continue
    }
    if (c === '-' && /\d/.test(source[i + 1] ?? '') && (i === 0 || isBoundary(source[i - 1]) || source[i - 1] === '(')) {
      let value = advance(); while (i < source.length && /[\d.]/.test(source[i])) value += advance(); add('number', value, p); continue
    }
    if (c === '-' && /[A-Za-z]/.test(source[i + 1] ?? '')) {
      advance(); let value = '-'; while (i < source.length && /[\w-]/u.test(source[i])) value += advance()
      add(/^-(?:eq|ne|like|notlike|gt|ge|lt|le|and|or|not)$/i.test(value) ? 'operator' : 'parameter', value, p); continue
    }
    if (';,|{}()><&'.includes(c)) { advance(); if (c === '{') braceKinds.push(tokens[tokens.length - 1]?.kind === 'punctuation' && tokens[tokens.length - 1]?.value === '@' ? 'hashtable' : 'block'); if (c === '}' && braceKinds.length) braceKinds.pop(); add(c === ';' ? 'separator' : 'punctuation', c, p); continue }
    if (c === ':' || (c === '=' && braceKinds[braceKinds.length - 1] === 'hashtable')) { advance(); add('punctuation', c, p); continue }
    if (c === '=' && tokens[tokens.length - 1]?.kind === 'variable') { advance(); add('punctuation', c, p); continue }
    if (isPropertyDot(i)) { advance(); add('punctuation', c, p); continue }
    let value = ''
    while (i < source.length && !isBoundary(source[i]) && !'()'.includes(source[i]) && !isPropertyDot(i) && !(braceKinds[braceKinds.length - 1] === 'hashtable' && source[i] === '=')) {
      if (source[i] === '`' && i + 1 < source.length) { advance(); value += advance() } else value += advance()
    }
    if (value) {
      if (/^-\w+$/i.test(value)) add('parameter', value, p)
      else if (/^-(?:eq|ne|like|notlike|gt|ge|lt|le|and|or|not)$/i.test(value)) add('operator', value, p)
      else if (/^\d+(?:\.\d+)?$/.test(value)) add('number', value, p)
      else add('word', value, p)
    }
  }
  tokens.push({ kind: 'eof', value: '', line, column })
  return { tokens, errors }
}
