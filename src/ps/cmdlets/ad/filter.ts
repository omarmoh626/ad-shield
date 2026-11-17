import { PsError, wildcardMatch, type PsValue } from '../../values'

type Token = { value: string; quoted?: boolean }
const TOKEN = /\s*(\(|\)|\*|-and\b|-or\b|-not\b|-eq\b|-ne\b|-like\b|-notlike\b|-gt\b|-ge\b|-lt\b|-le\b|'(?:''|[^'])*'|"(?:""|[^"])*"|[^\s()]+)/gi

/** Parse a constrained AD filter expression. It never evaluates learner text as code. */
export function compileFilter(source: string): (read: (name: string) => PsValue) => boolean {
  const tokens: Token[] = []
  let offset = 0
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break
    TOKEN.lastIndex = offset
    const match = TOKEN.exec(source)
    if (!match || match.index !== offset) throw new PsError('Filter syntax is invalid. Use comparisons joined by -and or -or.')
    const raw = match[1]
    tokens.push({ value: raw, quoted: raw.startsWith("'") || raw.startsWith('"') })
    offset = TOKEN.lastIndex
  }
  let at = 0
  const peek = () => tokens[at]?.value.toLowerCase()
  const take = () => tokens[at++]
  const scalar = (token: Token): string | boolean => {
    if (token.quoted) return token.value.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"')
    if (/^\$?true$/i.test(token.value)) return true
    if (/^\$?false$/i.test(token.value)) return false
    return token.value
  }
  const atom = (read: (name: string) => PsValue): boolean => {
    if (peek() === '-not') { take(); return !atom(read) }
    if (peek() === '(') { take(); const v = or(read); if (take()?.value !== ')') throw new PsError('Filter syntax is missing a closing parenthesis.'); return v }
    if (peek() === '*') { take(); return true }
    const property = take(), operator = take(), target = take()
    if (!property || !operator || !target || property.value.startsWith('-') || !/^-(eq|ne|like|notlike|gt|ge|lt|le)$/i.test(operator.value)) throw new PsError('Filter syntax is invalid. Use Property -eq/-ne/-like/-gt/-ge/-lt/-le Value.')
    const propertyName = property.value.replace(/^(?:\$_|\$PSItem)\./i, '')
    const left = read(propertyName), right = scalar(target), a = String(left ?? '').toLocaleLowerCase('en-US'), b = String(right).toLocaleLowerCase('en-US')
    switch (operator.value.toLowerCase()) {
      case '-eq': return typeof left === 'boolean' ? left === right : a === b
      case '-ne': return typeof left === 'boolean' ? left !== right : a !== b
      case '-like': return wildcardMatch(String(right), String(left ?? ''))
      case '-notlike': return !wildcardMatch(String(right), String(left ?? ''))
      case '-gt': return Number(left) > Number(right)
      case '-ge': return Number(left) >= Number(right)
      case '-lt': return Number(left) < Number(right)
      default: return Number(left) <= Number(right)
    }
  }
  const and = (read: (name: string) => PsValue): boolean => { let v = atom(read); while (peek() === '-and') { take(); const next = atom(read); v = v && next } return v }
  const or = (read: (name: string) => PsValue): boolean => { let v = and(read); while (peek() === '-or') { take(); const next = and(read); v = v || next } return v }
  return (read) => { at = 0; const result = or(read); if (at !== tokens.length) throw new PsError('Filter has unsupported trailing syntax.'); return result }
}
