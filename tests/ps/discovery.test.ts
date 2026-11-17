import { describe, expect, it } from 'vitest'
import { lab, run } from './fakeModule'

const prop = (values: unknown[], name: string) => values.map((value) => (value as { properties: Record<string, unknown> }).properties[name])

describe('discovery cmdlets', () => {
  it('shows the type name and members of a stored object', () => {
    const { rt } = lab()
    expect(run('$x = Fake-Get -Identity mali -Properties LockedOut', rt)).toMatchObject({ errors: [], output: '' })
    const result = run('$x | Get-Member', rt)
    expect(result.errors).toEqual([])
    expect(result.output).toContain('TypeName: Fake.User')
    expect(prop(result.values, 'Name')).toEqual(['Department', 'Enabled', 'LockedOut', 'Name', 'SamAccountName'])
    expect(result.output).toContain('bool LockedOut {get;}')
    expect(result.output).toMatch(/Name\s+MemberType\s+Definition/)
  })

  it('selects named properties', () => {
    const { rt } = lab()
    const result = run('Fake-Get | Select-Object -Property Name, enabled, Missing', rt)
    expect(result.errors).toEqual([])
    expect(result.values[0]).toEqual({ typeName: 'Selected.Fake.User', text: 'CN=Maya Ali,DC=corp,DC=local', properties: { Name: 'Maya Ali', Enabled: true, Missing: null } })
    expect(result.output.split('\n')[0]).toMatch(/^Name\s+Enabled\s+Missing$/)
    expect(run('Fake-Get | select -First 1 -ExpandProperty SamAccountName', rt).values).toEqual(['mali'])
    expect(run('Fake-Get | Select-Object -Last 1', rt).values).toHaveLength(1)
  })

  it('filters with Where-Object and $_', () => {
    const { rt } = lab()
    expect(prop(run("Fake-Get | Where-Object { $_.Department -eq 'sales' }", rt).values, 'SamAccountName')).toEqual(['jdoe', 'sold'])
    expect(prop(run("Fake-Get | where { $_.Name -like 'm*' -or -not $_.Enabled }", rt).values, 'SamAccountName')).toEqual(['mali', 'sold'])
    expect(prop(run("Fake-Get | ? { $_.Department -eq 'Sales' -and $_.Enabled -eq $true } | Select-Object Name", rt).values, 'Name')).toEqual(['John Doe'])
    expect(run("Write-Output 3, 10, 25 | Where-Object { $_ -gt 5 -and $_ -le 25 }", rt).values).toEqual([10, 25])
  })

  it('lists commands by module and by wildcard', () => {
    const { rt } = lab()
    expect(prop(run('Get-Command -Module Fake', rt).values, 'Name')).toEqual(['Fake-Get', 'Fake-Remove', 'Fake-Set'])
    expect(prop(run('Get-Command *-Object', rt).values, 'Name')).toEqual(['Select-Object', 'Where-Object'])
    expect(prop(run('gcm -Module microsoft.powershell.core', rt).values, 'Source')).toEqual(['Microsoft.PowerShell.Core', 'Microsoft.PowerShell.Core', 'Microsoft.PowerShell.Core'])
    expect(run('Get-Command', rt).output).toMatch(/CommandType\s+Name\s+Source/)
  })

  it('shows help with syntax, and examples with -Examples', () => {
    const { rt } = lab()
    const help = run('Get-Help Fake-Set', rt).output
    expect(help).toContain('Fake-Set [-Identity] <Object[]> [[-Department] <string>] [-Path <string>] [-PassThru] [-Level <int>] [-WhatIf] [-Confirm]')
    expect(run('Get-Help fake-get', rt).output).toContain("Fake-Get -Filter <string> [-Properties <string[]>]")
    const examples = run('help Fake-Get -Examples', rt).output
    expect(examples).toContain('PS> Fake-Get -Identity mali')
    expect(examples).not.toContain('SYNTAX')
    expect(run('Get-Help', rt).output).toContain('simulated')
    expect(run('Get-Help Nope-Thing', rt).errors[0].message).toContain("cannot find 'Nope-Thing'")
  })

  it('formats after the pipeline: tables for up to four properties, lists for more', () => {
    const { rt } = lab()
    const table = run('Fake-Get', rt).output.split('\n')
    expect(table[0]).toMatch(/^Name\s+SamAccountName\s+Enabled$/)
    expect(table[1]).toMatch(/^-+ -+ -+$/)
    expect(table).toHaveLength(5)
    const list = run('Fake-Get mali | Select-Object *', rt).output
    expect(list).toContain('SamAccountName : mali')
    expect(list).toContain('LockedOut      : True')
    expect(run("@{ Name = 'x'; Count = 2 }", rt).output).toMatch(/Name\s+Value\n-+ -+\nName\s+x\nCount\s+2/)
  })
})
