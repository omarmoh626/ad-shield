import { describe, expect, it } from 'vitest'
import { lab, run } from '../../fakeModule'
import { createObject } from '../../../../src/domain/graph'
import { deriveDn } from '../../../../src/domain/dn'
import { buildIndexes } from '../../../../src/domain/indexes'
import type { DomainState, Guid } from '../../../../src/domain/types'
import { run as runAtState } from '../../../../src/ps/runtime'

function objectBySam(state: DomainState, sam: string) {
  return Object.values(state.objects).find((object) => object.attrs.sAMAccountName === sam)
}

function addUser(state: DomainState, parent: Guid, sam: string, name: string, attrs: Record<string, string | number | boolean> = {}): DomainState {
  return createObject(state, { objectClass: 'user', rdn: name, parent, securityPrincipal: true, attrs: { sAMAccountName: sam, displayName: attrs.displayName ?? name, enabled: true, ...attrs } }).state
}

describe('ActiveDirectory read cmdlets', () => {
  it('resolves identity and adds LockedOut only when requested', () => {
    const { rt } = lab()
    const standard = run('Get-ADUser -Identity mali', rt)
    expect(standard.errors).toEqual([])
    expect(standard.values[0]).toMatchObject({ typeName: 'Microsoft.ActiveDirectory.Management.ADUser' })
    expect(Object.keys((standard.values[0] as { properties: object }).properties)).not.toContain('LockedOut')
    const requested = run('Get-ADUser -Identity mali -Properties LockedOut', rt)
    expect(requested.values[0]).toMatchObject({ properties: { LockedOut: true } })
  })

  it('matches quoted and script block filters equally', () => {
    const { rt } = lab()
    const quoted = run("Get-ADUser -Filter \"Department -eq 'Pharmacy'\"", rt)
    const block = run("Get-ADUser -Filter { $_.Department -eq 'Pharmacy' }", rt)
    expect(quoted.errors).toEqual([])
    expect(block.errors).toEqual([])
    expect(block.values.map((v) => (v as unknown as { ref: string }).ref)).toEqual(quoted.values.map((v) => (v as unknown as { ref: string }).ref))
    const bareBlock = run("Get-ADUser -Filter { Department -eq 'Pharmacy' }", rt)
    expect(bareBlock.errors).toEqual([])
    expect(bareBlock.values.map((v) => (v as unknown as { ref: string }).ref)).toEqual(quoted.values.map((v) => (v as unknown as { ref: string }).ref))

    const multiQuoted = run("Get-ADUser -Filter 'Name -like ''M*'' -and Enabled -eq $true'", rt)
    const multiBlock = run("Get-ADUser -Filter { Name -like 'M*' -and Enabled -eq $true }", rt)
    expect(multiQuoted.errors).toEqual([])
    expect(multiBlock.errors).toEqual([])
    expect(multiBlock.values.map((v) => (v as unknown as { ref: string }).ref)).toEqual(multiQuoted.values.map((v) => (v as unknown as { ref: string }).ref))
  })

  it('resolves escaped DN, case-insensitive braced GUID, and SID; rejects display names', () => {
    const { rt, initial } = lab()
    const pharmacy = Object.values(initial.objects).find((o) => o.objectClass === 'organizationalUnit' && o.rdn === 'Pharmacy')!
    const created = createObject(initial, { objectClass: 'user', rdn: 'Escaped, User', parent: pharmacy.guid, securityPrincipal: true, attrs: { sAMAccountName: 'escaped' } })
    const user = created.object
    const dn = deriveDn(created.state, user.guid)
    expect(runAtState(`Get-ADUser -Identity '${dn}'`, rt, created.state).values).toHaveLength(1)
    expect(runAtState(`Get-ADUser -Identity '{${user.guid.toUpperCase()}}'`, rt, created.state).values).toHaveLength(1)
    expect(runAtState(`Get-ADUser -Identity '${user.sid}'`, rt, created.state).values).toHaveLength(1)
    const display = runAtState("Get-ADUser -Identity 'Maya Ali'", rt, created.state)
    expect(display.errors[0]?.message).toContain('display names are not identities')
    expect(display.errors[0]?.help).toContain('Get-Help')
  })

  it('applies Base, OneLevel, and Subtree search scopes', () => {
    const { rt, initial } = lab()
    const pharmacy = Object.values(initial.objects).find((o) => o.objectClass === 'organizationalUnit' && o.rdn === 'Pharmacy')!
    const childResult = createObject(initial, { objectClass: 'organizationalUnit', rdn: 'Subteam', parent: pharmacy.guid })
    const childOu = childResult.object
    const nested = addUser(childResult.state, childOu.guid, 'scopechild', 'Scope Child')
    const base = deriveDn(nested, pharmacy.guid)
    const query = (scope: string) => runAtState(`Get-ADUser -Filter '*' -SearchBase '${base}' -SearchScope ${scope}`, rt, nested)
    expect(query('Base').values).toHaveLength(0)
    expect(query('OneLevel').values).toHaveLength(3)
    expect(query('Subtree').values).toHaveLength(4)
  })

  it('returns duplicate display names across OUs and includes the exact inactivity boundary', () => {
    const { rt, initial } = lab()
    const finance = Object.values(initial.objects).find((o) => o.objectClass === 'organizationalUnit' && o.rdn === 'Finance')!
    const nursing = Object.values(initial.objects).find((o) => o.objectClass === 'organizationalUnit' && o.rdn === 'Nursing')!
    let state = addUser(initial, finance.guid, 'samefinance', 'Finance Copy', { displayName: 'Shared Display' })
    state = addUser(state, nursing.guid, 'samenursing', 'Nursing Copy', { displayName: 'Shared Display' })
    const found = runAtState("Get-ADUser -Filter \"DisplayName -eq 'Shared Display'\"", rt, state)
    expect(found.values).toHaveLength(2)

    const mali = objectBySam(state, 'mali')!
    const atBoundary = { ...state, objects: { ...state.objects, [mali.guid]: { ...mali, attrs: { ...mali.attrs, lastLogonTimestamp: state.now - 90 * 86400000 } } } }
    const inactive = runAtState('Search-ADAccount -AccountInactive -TimeSpan 90.00:00:00 -UsersOnly', rt, atBoundary)
    expect(inactive.errors).toEqual([])
    expect(inactive.values.some((value) => (value as unknown as { ref: Guid }).ref === mali.guid)).toBe(true)
    const bareDays = runAtState('Search-ADAccount -AccountInactive -TimeSpan 90 -UsersOnly', rt, atBoundary)
    expect(bareDays.values.some((value) => (value as unknown as { ref: Guid }).ref === mali.guid)).toBe(true)
    const explicitUtc = runAtState("Search-ADAccount -AccountInactive -DateTime '1970-01-01' -UsersOnly", rt, atBoundary)
    expect(explicitUtc.errors).toEqual([])
    const invalidDate = runAtState("Search-ADAccount -AccountInactive -DateTime '2026-02-30' -UsersOnly", rt, atBoundary)
    expect(invalidDate.errors[0]?.help).toContain('Get-Help Search-ADAccount -Examples')
  })

  it('flattens nested groups in recursive membership results and exposes AD type through Get-Member', () => {
    const { rt, initial } = lab()
    const root = Object.values(initial.objects).find((o) => o.attrs.sAMAccountName === 'GG-Pharmacy-Staff')!
    const nestedCreated = createObject(initial, { objectClass: 'group', rdn: 'Nested Pharmacy', parent: root.parent, securityPrincipal: true, attrs: { sAMAccountName: 'Nested-Pharmacy', groupScope: 'Global', groupCategory: 'Security' } })
    const mali = objectBySam(nestedCreated.state, 'mali')!
    const memberships = [...nestedCreated.state.memberships, { group: root.guid, member: nestedCreated.object.guid }, { group: nestedCreated.object.guid, member: mali.guid }]
    const state = { ...nestedCreated.state, memberships }
    state.indexes = buildIndexes(state)
    const recursive = runAtState("Get-ADGroupMember -Identity 'GG-Pharmacy-Staff' -Recursive", rt, state)
    expect(recursive.errors).toEqual([])
    expect(recursive.values.every((value) => (value as { properties: Record<string, unknown> }).properties.ObjectClass !== 'group')).toBe(true)
    const direct = runAtState("Get-ADGroupMember -Identity 'GG-Pharmacy-Staff'", rt, state)
    expect(direct.values.some((value) => (value as { properties: Record<string, unknown> }).properties.ObjectClass === 'group')).toBe(true)

    expect(runAtState('$u = Get-ADUser -Identity mali -Properties LockedOut', rt, state).errors).toEqual([])
    const members = runAtState('$u | Get-Member', rt, state)
    expect(members.errors).toEqual([])
    expect(members.output).toContain('Microsoft.ActiveDirectory.Management.ADUser')

    const primary = runAtState('Get-ADPrincipalGroupMembership -Identity mali', rt, state)
    expect(primary.values.some((value) => (value as { properties: Record<string, unknown> }).properties.SamAccountName === 'Domain Users')).toBe(true)
  })
})
