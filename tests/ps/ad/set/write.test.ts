import { describe, expect, it } from 'vitest'
import { deriveDn } from '../../../../src/domain/dn'
import { findBySamAccountName } from '../../../../src/domain/indexes'
import type { DomainState } from '../../../../src/domain/types'
import { getProperty } from '../../../../src/ps/values'
import { SECRET, lab, run, stateOf } from '../../fakeModule'

const PHARMACY = 'OU=Pharmacy,DC=corp,DC=contoso,DC=local'
const USERS = 'CN=Users,DC=corp,DC=contoso,DC=local'

const userBySam = (state: DomainState, sam: string) => {
  const guid = findBySamAccountName(state, sam)
  return guid === undefined ? undefined : state.objects[guid]
}
const dnOfSam = (state: DomainState, sam: string): string | undefined => {
  const guid = findBySamAccountName(state, sam)
  return guid === undefined ? undefined : deriveDn(state, guid)
}
const isMember = (state: DomainState, groupSam: string, memberSam: string): boolean => {
  const group = findBySamAccountName(state, groupSam), member = findBySamAccountName(state, memberSam)
  return state.memberships.some((row) => row.group === group && row.member === member)
}
const newEventIds = (before: DomainState, after: DomainState) => after.events.slice(before.events.length).map((event) => event.eventId)

describe('New-ADUser container resolution', () => {
  it('resolves the same container for splatted and named parameters', () => {
    const named = lab()
    expect(run(`New-ADUser -Name 'Jordan Pike' -SamAccountName jpike -Path '${PHARMACY}'`, named.rt).errors).toEqual([])
    const splat = lab()
    expect(run(`$p = @{ Name = 'Jordan Pike'; SamAccountName = 'jpike'; Path = '${PHARMACY}' }; New-ADUser @p`, splat.rt).errors).toEqual([])
    expect(dnOfSam(stateOf(splat.rt), 'jpike')).toBe(`CN=Jordan Pike,${PHARMACY}`)
    expect(dnOfSam(stateOf(splat.rt), 'jpike')).toBe(dnOfSam(stateOf(named.rt), 'jpike'))

    const namedDefault = lab(), splatDefault = lab()
    run("New-ADUser -Name 'Jordan Pike' -SamAccountName jpike", namedDefault.rt)
    run("$p = @{ Name = 'Jordan Pike'; SamAccountName = 'jpike' }; New-ADUser @p", splatDefault.rt)
    expect(dnOfSam(stateOf(splatDefault.rt), 'jpike')).toBe(dnOfSam(stateOf(namedDefault.rt), 'jpike'))
  })

  it('uses CN=Users from C:\\Lab and the current container inside the AD: drive', () => {
    const { rt } = lab()
    expect(run("New-ADUser -Name 'Ada One' -SamAccountName aone", rt).errors).toEqual([])
    expect(dnOfSam(stateOf(rt), 'aone')).toBe(`CN=Ada One,${USERS}`)

    expect(run(`Set-Location 'AD:\\${PHARMACY}'`, rt).errors).toEqual([])
    expect(rt.prompt).toBe(`PS AD:\\${PHARMACY}>`)
    expect(run("New-ADUser -Name 'Ada Two' -SamAccountName atwo", rt).errors).toEqual([])
    expect(dnOfSam(stateOf(rt), 'atwo')).toBe(`CN=Ada Two,${PHARMACY}`)

    // -Path still wins inside the drive.
    expect(run(`New-ADUser -Name 'Ada Three' -SamAccountName athree -Path '${USERS}'`, rt).errors).toEqual([])
    expect(dnOfSam(stateOf(rt), 'athree')).toBe(`CN=Ada Three,${USERS}`)
  })
})

describe('New-ADUser credential outcomes', () => {
  it('leaves a disabled object and explains the partial result when the password fails policy', () => {
    const { rt, initial } = lab({ readSecure: () => ({ policy: 'fail' }) })
    const result = run("$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString; New-ADUser -Name 'Weak Pass' -SamAccountName wpass -AccountPassword $pw -Enabled $true", rt)
    const created = userBySam(result.state, 'wpass')
    expect(created).toBeDefined()
    expect(created?.attrs.enabled).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toMatch(/password policy.*disabled/i)
    expect(result.errors[0].identity).toBe('wpass')
    expect(newEventIds(initial, result.state)).toEqual([4720])
  })

  it('creates a disabled account with an error for -Enabled $true without a password', () => {
    const { rt } = lab()
    const result = run("New-ADUser -Name 'No Pass' -SamAccountName npass -Enabled $true", rt)
    expect(userBySam(result.state, 'npass')?.attrs.enabled).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toMatch(/created disabled/i)
  })

  it('creates an enabled account with a passing password and -Enabled $true', () => {
    const { rt, initial } = lab()
    const result = run("$pw = Read-Host -Prompt 'pw' -AsSecureString; New-ADUser -Name 'Good Pass' -SamAccountName gpass -AccountPassword $pw -Enabled $true -PassThru", rt)
    expect(result.errors).toEqual([])
    expect(userBySam(result.state, 'gpass')?.attrs.enabled).toBe(true)
    expect(newEventIds(initial, result.state)).toEqual([4720, 4722])
    expect(result.values[0]).toMatchObject({ typeName: 'Microsoft.ActiveDirectory.Management.ADUser' })
  })
})

describe('Remove-ADGroupMember confirmation', () => {
  it('asks without -Confirm:$false and removes with it', () => {
    const asking = lab({ confirm: () => undefined })
    const pending = run('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair', asking.rt)
    expect(pending.pending?.kind).toBe('confirm')
    expect(pending.state).toBe(asking.initial)

    const noHook = lab()
    const cancelled = run('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair', noHook.rt)
    expect(cancelled.errors[0].message).toContain('-Confirm:$false')
    expect(isMember(cancelled.state, 'GG-Pharmacy-Staff', 'pnair')).toBe(true)

    const declined = lab({ confirm: () => false })
    expect(isMember(run('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair', declined.rt).state, 'GG-Pharmacy-Staff', 'pnair')).toBe(true)

    const forced = lab()
    const removed = run('Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false', forced.rt)
    expect(removed.errors).toEqual([])
    expect(isMember(removed.state, 'GG-Pharmacy-Staff', 'pnair')).toBe(false)
    expect(newEventIds(forced.initial, removed.state)).toEqual([4729])
  })
})

describe('pipelines and partial failure', () => {
  it('commits earlier and later records and names the identity of the failed one', () => {
    const { rt, initial } = lab()
    // Order: two Nursing users, the Executive user (outside the operator's delegation), then two Sales users.
    const result = run("Get-ADUser -Filter \"Department -eq 'Nursing' -or Department -eq 'Executive' -or Department -eq 'Sales'\" | Disable-ADAccount", rt)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].identity).toBe('CN=Evelyn Hartmann,OU=Executive,DC=corp,DC=contoso,DC=local')
    expect(result.errors[0].message).toContain('Evelyn Hartmann')
    for (const sam of ['aokoye', 'bcastillo', 'jdoe', 'sold']) expect(userBySam(result.state, sam)?.attrs.enabled).toBe(false)
    expect(userBySam(result.state, 'ehartmann')?.attrs.enabled).toBe(true)
    // sold was already disabled: no change and no event for it.
    expect(newEventIds(initial, result.state)).toEqual([4725, 4725, 4725])
  })

  it('unlocks from the pipeline and returns objects only with -PassThru', () => {
    const { rt } = lab()
    const quiet = run('Get-ADUser -Identity mali | Unlock-ADAccount', rt)
    expect(quiet.errors).toEqual([])
    expect(quiet.values).toEqual([])
    expect(userBySam(quiet.state, 'mali')?.attrs.lockedOut).toBe(false)
    const loud = run('Disable-ADAccount -Identity mali -PassThru', rt)
    expect(loud.values[0]).toMatchObject({ typeName: 'Microsoft.ActiveDirectory.Management.ADUser' })
  })

  it('accepts objects from Select-Object by their DistinguishedName or SamAccountName', () => {
    const { rt } = lab()
    const result = run('Get-ADUser -Identity mali | Select-Object SamAccountName | Unlock-ADAccount', rt)
    expect(result.errors).toEqual([])
    expect(userBySam(result.state, 'mali')?.attrs.lockedOut).toBe(false)
  })
})

describe('group membership parameter direction', () => {
  it('Add-ADGroupMember takes the group in -Identity and principals in -Members', () => {
    const { rt, initial } = lab()
    const result = run('Add-ADGroupMember -Identity GG-Pharmacy-Staff -Members bcastillo,aokoye', rt)
    expect(result.errors).toEqual([])
    expect(isMember(result.state, 'GG-Pharmacy-Staff', 'bcastillo')).toBe(true)
    expect(isMember(result.state, 'GG-Pharmacy-Staff', 'aokoye')).toBe(true)
    expect(newEventIds(initial, result.state)).toEqual([4728, 4728])

    const reversed = run('Add-ADGroupMember -Identity kmorita -Members GG-Finance-Managers', lab().rt)
    expect(reversed.errors).toHaveLength(1)
    expect(reversed.errors[0].message).toMatch(/not a group/i)
    expect(reversed.committed).toEqual([])
  })

  it('Add-ADPrincipalGroupMembership takes the principal in -Identity and groups in -MemberOf', () => {
    const { rt, initial } = lab()
    const result = run('Add-ADPrincipalGroupMembership -Identity bcastillo -MemberOf GG-Pharmacy-Staff,DL-Pharmacy-Share-Read', rt)
    expect(result.errors).toEqual([])
    expect(isMember(result.state, 'GG-Pharmacy-Staff', 'bcastillo')).toBe(true)
    expect(isMember(result.state, 'DL-Pharmacy-Share-Read', 'bcastillo')).toBe(true)
    expect(newEventIds(initial, result.state)).toEqual([4728, 4732])

    const reversed = run('Add-ADPrincipalGroupMembership -Identity GG-Pharmacy-Staff -MemberOf bcastillo', lab().rt)
    expect(reversed.errors).toHaveLength(1)
    expect(reversed.committed).toEqual([])
  })
})

describe('events per write cmdlet (CONTRACTS 6, DECISIONS D3)', () => {
  const cases: [string, number[]][] = [
    ["New-ADUser -Name 'Ev User' -SamAccountName evuser", [4720]],
    ["Set-ADUser -Identity pnair -Title 'Senior Pharmacy Technician'", [4738]],
    ['Set-ADUser -Identity pnair -ChangePasswordAtLogon $true', [4738]],
    ['Disable-ADAccount -Identity kmorita', [4725]],
    ['Disable-ADAccount -Identity kmorita; Enable-ADAccount -Identity kmorita', [4725, 4722]],
    ['Unlock-ADAccount -Identity mali', [4767]],
    ['$pw = Read-Host -Prompt pw -AsSecureString; Set-ADAccountPassword -Identity pnair -Reset -NewPassword $pw', [4724]],
    ['Add-ADGroupMember -Identity GG-Nursing-Staff -Members pnair', [4728]],
    ['Add-ADGroupMember -Identity DL-Finance-Share-Read -Members pnair', [4732]],
    ['Add-ADGroupMember -Identity UG-All-Staff -Members pnair', [4756]],
    ['Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -Confirm:$false', [4729]],
    ['Remove-ADGroupMember -Identity DL-Pharmacy-Share-Read -Members GG-Pharmacy-Staff -Confirm:$false', [4733]],
    ['Remove-ADGroupMember -Identity UG-All-Staff -Members GG-Pharmacy-Staff -Confirm:$false', [4757]],
    ['Add-ADPrincipalGroupMembership -Identity pnair -MemberOf GG-Nursing-Staff', [4728]],
  ]
  it.each(cases)('%s', (source, ids) => {
    const { rt, initial } = lab()
    const result = run(source, rt)
    expect(result.errors).toEqual([])
    expect(newEventIds(initial, result.state)).toEqual(ids)
  })

  it('Move-ADObject keeps GUID, SID, and memberships', () => {
    const { rt, initial } = lab()
    const before = userBySam(initial, 'mali')
    const result = run(`Move-ADObject -Identity mali -TargetPath 'OU=Finance,DC=corp,DC=contoso,DC=local' -PassThru`, rt)
    expect(result.errors).toEqual([])
    const after = userBySam(result.state, 'mali')
    expect(after?.guid).toBe(before?.guid)
    expect(after?.sid).toBe(before?.sid)
    expect(dnOfSam(result.state, 'mali')).toBe('CN=Maya Ali,OU=Finance,DC=corp,DC=contoso,DC=local')
    expect(isMember(result.state, 'GG-Pharmacy-Staff', 'mali')).toBe(true)
    expect(getProperty(result.values[0], 'DistinguishedName')).toBe('CN=Maya Ali,OU=Finance,DC=corp,DC=contoso,DC=local')
  })
})

describe('-WhatIf purity', () => {
  const previews = [
    "New-ADUser -Name 'Jordan Pike' -SamAccountName jpike -WhatIf",
    "Set-ADUser -Identity pnair -Title 'X' -WhatIf",
    'Enable-ADAccount -Identity sold -WhatIf',
    'Disable-ADAccount -Identity kmorita -WhatIf',
    'Unlock-ADAccount -Identity mali -WhatIf',
    'Set-ADAccountPassword -Identity pnair -Reset -WhatIf',
    "Move-ADObject -Identity mali -TargetPath 'OU=Finance,DC=corp,DC=contoso,DC=local' -WhatIf",
    'Add-ADGroupMember -Identity GG-Nursing-Staff -Members pnair -WhatIf',
    'Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members pnair -WhatIf',
    'Add-ADPrincipalGroupMembership -Identity pnair -MemberOf GG-Nursing-Staff -WhatIf',
    'Get-ADUser -Filter "Department -eq \'Pharmacy\'" | Disable-ADAccount -WhatIf',
  ]
  it.each(previews)('%s', (source) => {
    // No confirm hook and no secure hook: a preview must not need either.
    const { rt, initial } = lab({ confirm: undefined, readSecure: undefined })
    const result = run(source, rt)
    expect(result.errors).toEqual([])
    expect(result.state).toBe(initial)
    expect(result.committed).toEqual([])
    expect(result.output).toMatch(/^What if: Performing the operation/m)
    expect(result.output).toContain('simulated')
  })
})

describe('secure password input', () => {
  it('never puts the typed password into transcript, history, state, or events', () => {
    const { rt } = lab()
    const result = run("$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity pnair -Reset -NewPassword $pw; New-ADUser -Name 'Sec User' -SamAccountName secuser -AccountPassword $pw -Enabled $true", rt)
    expect(result.errors).toEqual([])
    expect(userBySam(result.state, 'secuser')?.attrs.enabled).toBe(true)
    const haystack = JSON.stringify({ transcript: rt.transcript, history: rt.history, state: result.state, committed: result.committed, values: result.values, output: result.output })
    expect(haystack).not.toContain(SECRET)
    expect(rt.transcript.some((entry) => entry.text.includes('simulated secure input, not stored'))).toBe(true)
  })

  it('asks for a masked password when -NewPassword is missing, and pends until answered', () => {
    const { rt, initial } = lab({ readSecure: () => undefined })
    const pending = run('Set-ADAccountPassword -Identity pnair -Reset', rt)
    expect(pending.pending?.kind).toBe('secure')
    expect(pending.state).toBe(initial)
  })

  it('rejects a password change without -Reset', () => {
    const result = run('Set-ADAccountPassword -Identity pnair', lab().rt)
    expect(result.errors[0].message).toContain('-Reset')
    expect(result.committed).toEqual([])
  })
})

describe('Set-Location and Get-Location', () => {
  it('walks the AD: drive and returns to C:\\Lab', () => {
    const { rt } = lab()
    for (const step of ['Set-Location AD:', "Set-Location 'DC=corp,DC=contoso,DC=local'", 'Set-Location OU=Finance']) expect(run(step, rt).errors).toEqual([])
    expect(getProperty(run('Get-Location', rt).values[0], 'Path')).toBe('AD:\\OU=Finance,DC=corp,DC=contoso,DC=local')
    run('cd ..', rt)
    expect(rt.location).toBe('AD:\\DC=corp,DC=contoso,DC=local')
    run('cd ..', rt)
    expect(rt.location).toBe('AD:\\')
    run('Set-Location C:\\Lab', rt)
    expect(rt.prompt).toBe('PS C:\\Lab>')
  })

  it('rejects unknown paths and leaves the location unchanged', () => {
    const { rt } = lab()
    expect(run("Set-Location 'AD:\\OU=Nowhere,DC=corp,DC=contoso,DC=local'", rt).errors).toHaveLength(1)
    expect(run('Set-Location D:\\Temp', rt).errors).toHaveLength(1)
    expect(run("Set-Location 'AD:\\CN=Maya Ali,OU=Pharmacy,DC=corp,DC=contoso,DC=local'", rt).errors[0].message).toMatch(/not a container/)
    expect(rt.location).toBe('C:\\Lab')
  })

  it('restores the location when a later prompt in the same input is pending', () => {
    const { rt } = lab({ readSecure: () => undefined })
    const result = run("Set-Location AD:; $pw = Read-Host -Prompt pw -AsSecureString", rt)
    expect(result.pending?.kind).toBe('secure')
    expect(rt.location).toBe('C:\\Lab')
  })
})
