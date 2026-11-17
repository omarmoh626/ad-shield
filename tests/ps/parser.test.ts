import { describe, expect, it } from 'vitest'
import { parse } from '../../src/ps/parser'

describe('PowerShell parser', () => {
  it('parses assignments, typed expressions, splatting, and pipelines', () => {
    const result = parse("$u = Get-ADUser -Identity mali -Properties LockedOut\n$u | Get-Member\nGet-X -Filter { $_.Name -like 'A*' -and $_.Age -ge 2 } -Enabled:$false @params")
    expect(result.errors).toEqual([])
    expect(result.script?.statements).toHaveLength(3)
    expect(result.script?.statements[0].pipeline.kind).toBe('assignment')
    const cmd = result.script?.statements[2].pipeline
    expect(cmd?.kind).toBe('pipeline')
    if (cmd?.kind === 'pipeline') {
      expect(cmd.commands[0].parameters.map(p => p.name)).toEqual(['Filter', 'Enabled'])
      expect(cmd.commands[0].arguments[0].value.kind).toBe('splat')
    }
  })

  it('preserves source casing in command and parameter names', () => {
    const canonical = parse('Get-Item -Name value')
    const mixed = parse('gEt-iTeM -nAmE value')
    expect(mixed.errors).toEqual([])
    const canon = canonical.script?.statements[0].pipeline, mix = mixed.script?.statements[0].pipeline
    if (canon?.kind === 'pipeline' && mix?.kind === 'pipeline') {
      expect(mix.commands[0].name.toLowerCase()).toBe(canon.commands[0].name.toLowerCase())
      expect(mix.commands[0].parameters.map(p => p.name.toLowerCase())).toEqual(canon.commands[0].parameters.map(p => p.name.toLowerCase()))
    }
  })

  it('parses all supported comparison operators inside script blocks', () => {
    const result = parse("Get-X { $_.a -eq 1 -or $_.b -ne 2 -and $_.c -notlike 'x*' -gt 0 -ge 0 -lt 4 -le 5 }")
    expect(result.errors).toEqual([])
    expect(result.script?.statements[0].pipeline.kind).toBe('pipeline')
  })

  it.each(['if ($true) { Get-X }', 'while ($true) { Get-X }', 'function x { }', 'Get-X (1 + 2)', 'Get-X > out.txt', '& Get-X', '$x.ToString()'])('rejects unsupported syntax: %s', source => {
    const result = parse(source)
    expect(result.script).toBeUndefined()
    expect(result.errors[0]).toMatchObject({ line: 1, column: expect.any(Number) })
    expect(result.errors[0].message).toContain('Unsupported syntax:')
  })

  it('reports unterminated strings and unbalanced braces with positions', () => {
    expect(parse("Get-X 'open").errors[0]).toMatchObject({ line: 1, column: 7 })
    expect(parse('Get-X { $_.Name -eq x').errors[0].message).toContain('Unbalanced brace')
  })

  it('parses comma lists, hashtables, switches, and literal booleans', () => {
    const result = parse('Get-X -Names a,b -Enabled -Options @{ Name = x; Count = 2 } -Flag:$false')
    expect(result.errors).toEqual([])
    const pipeline = result.script?.statements[0].pipeline
    expect(pipeline?.kind).toBe('pipeline')
    if (pipeline?.kind === 'pipeline') expect(pipeline.commands[0].parameters.map(p => [p.name, p.switch, p.colon, p.value?.kind === 'literal' ? p.value.value : undefined])).toEqual([['Names', false, false, undefined], ['Enabled', true, false, undefined], ['Options', false, false, undefined], ['Flag', false, true, false]])
  })

  it('rejects unparsed script-block tokens instead of dropping them', () => {
    const result = parse('Get-X { $_.a -eq 1 -not $false }')
    expect(result.script).toBeUndefined()
    expect(result.errors[0]).toMatchObject({line:1, column:expect.any(Number)})
  })

  it('treats quoted syntax spellings as values', () => {
    for (const source of ["Write-Output a '|' Get-Member", "Write-Output '|'\nGet-X", "Get-X -Name ':' foo", "Get-X a ',' b", "'if' | Write-Output"]) {
      expect(parse(source).errors, source).toEqual([])
    }
  })

  it('keeps newline after quoted pipe as a statement boundary', () => {
    const result = parse("Write-Output '|'\nGet-X")
    expect(result.errors).toEqual([])
    expect(result.script?.statements).toHaveLength(2)
    expect(result.script?.statements.map(s => s.pipeline.kind)).toEqual(['pipeline', 'pipeline'])
  })

  it('rejects adjacent redirection forms with source positions', () => {
    for (const source of ['Get-X a>out.txt', 'Get-X 2>&1']) {
      const result = parse(source)
      expect(result.script).toBeUndefined()
      expect(result.errors[0]).toMatchObject({line:1, column:expect.any(Number)})
    }
  })

  it('preserves colon parameter form separately from space form', () => {
    const colon = parse('Get-X -Force:$false'), spaced = parse('Get-X -Force $false')
    expect(colon.errors).toEqual([]); expect(spaced.errors).toEqual([])
    const a = colon.script?.statements[0].pipeline, b = spaced.script?.statements[0].pipeline
    if (a?.kind === 'pipeline' && b?.kind === 'pipeline') expect(a.commands[0].parameters[0].colon).not.toBe(b.commands[0].parameters[0].colon)
  })

  it('parses unary not as a binary expression operand', () => {
    expect(parse('Get-X { -not $_.Enabled -and $_.x -eq 1 }').errors).toEqual([])
  })

  it('parses assignment and hashtable equals without splitting DN words', () => {
    for (const source of ['$x=1', '$u=Get-X mali', "Get-X @{Name='x'}", 'Get-X CN=a']) expect(parse(source).errors, source).toEqual([])
  })

  it('keeps hashtable equals active across a nested calculated script block', () => {
    const result = parse('Get-X @{ a = { $_.x }; b=2 }')
    expect(result.errors).toEqual([])
    const pipeline = result.script?.statements[0].pipeline
    if (pipeline?.kind === 'pipeline') {
      const table = pipeline.commands[0].arguments[0].value
      expect(table).toMatchObject({kind:'hashtable', entries:[{key:'a', value:{kind:'scriptBlock'}},{key:'b', value:{kind:'literal', value:2}}]})
      if (table.kind === 'hashtable') expect(table.entries).toHaveLength(2)
    }
  })

  it('parses negative numbers as values', () => {
    expect(parse('Get-X -Count -1').errors).toEqual([])
    expect(parse('Get-X { $_.n -gt -1 }').errors).toEqual([])
  })

  it('parses nested property access as nested nodes', () => {
    const result = parse('Get-ADUser -Identity maya.ali -Server dc01.corp.local mali@corp.local file.txt; Get-X $u.Manager.Name')
    expect(result.errors).toEqual([])
    const first = result.script?.statements[0].pipeline, second = result.script?.statements[1].pipeline
    if (first?.kind === 'pipeline') {
      expect(first.commands[0].parameters.map(p => p.value)).toMatchObject([{kind:'literal', value:'maya.ali'},{kind:'literal', value:'dc01.corp.local'}])
      expect(first.commands[0].arguments.map(a => a.value)).toMatchObject([{kind:'literal', value:'mali@corp.local'},{kind:'literal', value:'file.txt'}])
      expect(first.commands[0].arguments).toHaveLength(2)
    }
    if (second?.kind === 'pipeline') expect(second.commands[0].arguments[0].value).toMatchObject({kind:'property', name:'Name', target:{kind:'property', name:'Manager'}})
  })

  it('splits double-quoted variable expansions and rejects subexpressions', () => {
    const result = parse('Get-X "a `$x $($u.Name) $y"')
    expect(result.script).toBeUndefined()
    expect(result.errors[0]).toMatchObject({line:1, column:expect.any(Number)})
    const valid = parse('Get-X "a $x `$x $y"')
    const pipe = valid.script?.statements[0].pipeline
    if (pipe?.kind === 'pipeline') expect(pipe.commands[0].arguments[0].value).toMatchObject({kind:'literal', parts:[{kind:'text',value:'a '},{kind:'variable',name:'x'},{kind:'text',value:' $x '},{kind:'variable',name:'y'}]})
  })

  it('parses a comma list of three or more items as one flat array', () => {
    const result = parse('Get-X -Names a, b, c 1, 2, 3, 4')
    expect(result.errors).toEqual([])
    const pipe = result.script?.statements[0].pipeline
    expect(pipe?.kind).toBe('pipeline')
    if (pipe?.kind === 'pipeline') {
      expect(pipe.commands[0].parameters[0].value).toMatchObject({ kind: 'array', items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] })
      expect(pipe.commands[0].arguments[0].value).toMatchObject({ kind: 'array', items: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }] })
    }
    expect.assertions(4)
  })

  it('keeps command and parameter spelling as typed', () => {
    const result = parse('gEt-X -nAmE value'), pipe = result.script?.statements[0].pipeline
    if (pipe?.kind === 'pipeline') expect([pipe.commands[0].name, pipe.commands[0].parameters[0].name]).toEqual(['gEt-X','nAmE'])
  })
})
