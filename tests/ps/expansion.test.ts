import { describe, expect, it } from 'vitest'
import { lab, run } from './fakeModule'

const refs = (values: unknown[]) => values.map((value) => (value as { ref: string }).ref)
const sams = (values: unknown[]) => values.map((value) => (value as { properties: { SamAccountName: string } }).properties.SamAccountName)

describe('double-quoted string expansion of automatic constants (T03 D10)', () => {
  it('expands $true, $false, and $null as PowerShell does, in any letter case', () => {
    const { rt } = lab()
    expect(run('Write-Output "x $true y"', rt).values).toEqual(['x True y'])
    expect(run('Write-Output "$false"', rt).values).toEqual(['False'])
    expect(run('Write-Output "[$null]"', rt).values).toEqual(['[]'])
    expect(run('Write-Output "$TRUE/$False"', rt).values).toEqual(['True/False'])
  })

  it('keeps ordinary variable expansion and single-quoted text unchanged', () => {
    const { rt } = lab()
    expect(run('$a = 7; Write-Output "a=$a"', rt).values).toEqual(['a=7'])
    expect(run("Write-Output 'x $true y'", rt).values).toEqual(['x $true y'])
    expect(run('Write-Output "$constructor"', rt).values).toEqual([''])
  })

  it('makes -Filter "Enabled -eq $true" match the script-block and single-quoted forms', () => {
    const { rt } = lab()
    const doubleQuoted = run('Get-ADUser -Filter "Enabled -eq $true"', rt)
    const block = run('Get-ADUser -Filter { Enabled -eq $true }', rt)
    const singleQuoted = run("Get-ADUser -Filter 'Enabled -eq $true'", rt)
    expect(doubleQuoted.errors).toEqual([])
    expect(doubleQuoted.values.length).toBeGreaterThan(0)
    expect(refs(doubleQuoted.values)).toEqual(refs(block.values))
    expect(refs(doubleQuoted.values)).toEqual(refs(singleQuoted.values))
  })

  it('makes the compound double-quoted filter match its script-block form', () => {
    const { rt } = lab()
    const doubleQuoted = run("Get-ADUser -Filter \"Name -like 'M*' -and Enabled -eq $true\"", rt)
    const block = run("Get-ADUser -Filter { Name -like 'M*' -and Enabled -eq $true }", rt)
    expect(doubleQuoted.errors).toEqual([])
    expect(refs(doubleQuoted.values)).toEqual(refs(block.values))
    expect(sams(doubleQuoted.values)).toEqual(['mali'])
  })

  it('finds the disabled account with -Filter "Enabled -eq $false"', () => {
    const { rt } = lab()
    const result = run('Get-ADUser -Filter "Enabled -eq $false"', rt)
    expect(result.errors).toEqual([])
    expect(sams(result.values)).toEqual(['sold'])
  })
})
