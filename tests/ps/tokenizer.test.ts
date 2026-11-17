import { describe, expect, it } from 'vitest'
import { tokenize } from '../../src/ps/tokenizer'

describe('PowerShell tokenizer', () => {
  it('keeps quoted DNs and bare words intact', () => {
    const { tokens, errors } = tokenize("Get-ADUser -Identity 'CN=Ali\\, Maya,OU=People,DC=corp,DC=local' -Age 90.00:00:00 -User corp\\mali")
    expect(errors).toEqual([])
    expect(tokens.filter(t => t.kind === 'string').map(t => t.value)).toEqual(['CN=Ali\\, Maya,OU=People,DC=corp,DC=local'])
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toContain('90.00:00:00')
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toContain('corp\\mali')
  })

  it('handles comments and both line continuation forms', () => {
    const { tokens, errors } = tokenize('Get-A x `\n | Get-B\n<# note\nmore #>\nGet-C # tail')
    expect(errors).toEqual([])
    expect(tokens.filter(t => t.kind === 'word').map(t => t.value)).toEqual(['Get-A', 'x', 'Get-B', 'Get-C'])
    expect(tokens.filter(t => t.kind === 'separator')).toHaveLength(2)
  })

  it('retains source positions and quote kinds', () => {
    const { tokens } = tokenize("Get-A\n  -Name \"$x\" -Text 'it''s'")
    expect(tokens.find(t => t.value === '-Name')).toMatchObject({ line: 2, column: 3 })
    expect(tokens.filter(t => t.kind === 'string').map(t => [t.value, t.quote])).toEqual([['$x', 'double'], ["it's", 'single']])
  })

  it('tokenizes mixed-case names identically and splits redirection punctuation', () => {
    const canonical = tokenize('Get-X -Name value'), mixed = tokenize('gEt-X -nAmE value')
    expect(mixed.tokens.map(t => t.kind)).toEqual(canonical.tokens.map(t => t.kind))
    for (const source of ['Get-X a>out.txt', 'Get-X 2>&1']) {
      const result = tokenize(source)
      expect(result.tokens.some(t => t.kind === 'punctuation' && t.value === '>')).toBe(true)
    }
  })
})
