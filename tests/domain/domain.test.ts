import { describe, expect, it } from 'vitest'
import { deriveDn, parseDn, unescapeRdn } from '../../src/domain/dn'
import { createObject, createDomainState, getChildren, getDn, moveObject, renameObject } from '../../src/domain/graph'
import { findByDn, findBySamAccountName } from '../../src/domain/indexes'
import { allocateGuid, allocateSid } from '../../src/domain/ids'
import { randomSequence } from '../../src/domain/random'

function base() {
  let state = createDomainState(77)
  const domain = createObject(state, { objectClass: 'domain', rdn: 'corp.contoso.local', parent: null })
  state = domain.state
  const pharmacy = createObject(state, { objectClass: 'organizationalUnit', rdn: 'Pharmacy', parent: domain.object.guid })
  state = pharmacy.state
  const user = createObject(state, { objectClass: 'user', rdn: 'Ali, Maya', parent: pharmacy.object.guid, attrs: { sAMAccountName: 'mali' }, securityPrincipal: true })
  return { state: user.state, domain: domain.object, pharmacy: pharmacy.object, user: user.object }
}

describe('domain graph', () => {
  it('round trips escaped commas and backslashes in distinguished names', () => {
    const parts = parseDn('CN=Ali\\, Maya,OU=Pharmacy,DC=corp,DC=contoso,DC=local')
    expect(parts).toEqual(['CN=Ali\\, Maya', 'OU=Pharmacy', 'DC=corp', 'DC=contoso', 'DC=local'])
    const { state, user, pharmacy } = base()
    expect(deriveDn(state, user)).toBe('CN=Ali\\, Maya,OU=Pharmacy,DC=corp,DC=contoso,DC=local')
    expect(parseDn('CN=path\\\\name,DC=local')[0]).toBe('CN=path\\\\name')
    const slash = createObject(state, { objectClass: 'user', rdn: 'path\\name', parent: pharmacy.guid })
    const slashDn = deriveDn(slash.state, slash.object)
    expect(slashDn).toBe('CN=path\\\\name,OU=Pharmacy,DC=corp,DC=contoso,DC=local')
    expect(unescapeRdn(parseDn(slashDn)[0].slice(3))).toBe('path\\name')
    expect(parseDn('CN=Ali\\, Maya,OU=Pharmacy,DC=corp,DC=contoso,DC=local').map((part) => unescapeRdn(part.slice(part.indexOf('=') + 1)))).toEqual(['Ali, Maya', 'Pharmacy', 'corp', 'contoso', 'local'])
  })

  it('looks up account names and DNs without case sensitivity', () => {
    const { state, user } = base()
    expect(findBySamAccountName(state, 'MALI')).toBe(user.guid)
    expect(findByDn(state, 'cn=ali\\, maya,ou=pharmacy,dc=corp,dc=contoso,dc=local')).toBe(user.guid)
  })

  it('keeps identity and memberships across moves and renames', () => {
    let { state, user, pharmacy } = base()
    const target = createObject(state, { objectClass: 'organizationalUnit', rdn: 'Finance', parent: pharmacy.parent })
    state = target.state
    state = { ...state, memberships: [{ group: pharmacy.guid, member: user.guid }] }
    state = moveObject(state, user.guid, target.object.guid)
    expect(state.objects[user.guid].guid).toBe(user.guid)
    expect(state.objects[user.guid].sid).toBe(user.sid)
    expect(state.memberships).toEqual([{ group: pharmacy.guid, member: user.guid }])
    expect(getDn(state, user.guid)).toContain('OU=Finance')
    expect(state.indexes.byDn['cn=ali\\, maya,ou=pharmacy,dc=corp,dc=contoso,dc=local']).toBeUndefined()
    state = renameObject(state, user.guid, 'Ali Maya')
    expect(state.objects[user.guid].sid).toBe(user.sid)
    expect(state.memberships).toEqual([{ group: pharmacy.guid, member: user.guid }])
    expect(getDn(state, user.guid)).toContain('CN=Ali Maya')
    expect(state.indexes.byDn['cn=ali\\, maya,ou=finance,dc=corp,dc=contoso,dc=local']).toBeUndefined()
    expect(state.indexes.byDn['cn=ali maya,ou=finance,dc=corp,dc=contoso,dc=local']).toBe(user.guid)
  })

  it('updates child indexes on create and move', () => {
    const { state, pharmacy, user } = base()
    expect(getChildren(state, pharmacy.guid).map((child) => child.guid)).toContain(user.guid)
    const target = createObject(state, { objectClass: 'organizationalUnit', rdn: 'Finance', parent: pharmacy.parent })
    const moved = moveObject(target.state, user.guid, target.object.guid)
    expect(getChildren(moved, pharmacy.guid)).toEqual([])
    expect(getChildren(moved, target.object.guid).map((child) => child.guid)).toEqual([user.guid])
  })

  it('allocates IDs and seeded random sequences deterministically', () => {
    const first = createDomainState(42)
    const a = allocateGuid(first)
    const b = allocateGuid(createDomainState(42))
    const sidA = allocateSid(first)
    const sidB = allocateSid(createDomainState(42))
    expect(a.id).toBe(b.id)
    expect(sidA.id).toBe(sidB.id)
    expect(randomSequence(first, 8).values).toEqual(randomSequence(createDomainState(42), 8).values)
  })

  it('produces a changing random sequence for a zero seed', () => {
    expect(new Set(randomSequence(createDomainState(0), 8).values).size).toBeGreaterThan(1)
  })

  it('rejects duplicate sibling names and sAMAccountNames case-insensitively', () => {
    const { state, pharmacy } = base()
    expect(() => createObject(state, { objectClass: 'user', rdn: 'ali, maya', parent: pharmacy.guid })).toThrow(/sibling/)
    const created = createObject(state, { objectClass: 'user', rdn: 'Other', parent: pharmacy.guid, attrs: { sAMAccountName: 'newuser' } })
    expect(() => createObject(created.state, { objectClass: 'user', rdn: 'Another', parent: pharmacy.guid, attrs: { sAMAccountName: 'NEWUSER' } })).toThrow(/sAMAccountName/)
    const sibling = createObject(state, { objectClass: 'organizationalUnit', rdn: 'Elsewhere', parent: pharmacy.parent })
    const namedChild = createObject(sibling.state, { objectClass: 'container', rdn: 'Users', parent: sibling.object.guid })
    const renamedChild = createObject(namedChild.state, { objectClass: 'container', rdn: 'Renamed', parent: pharmacy.parent })
    const sameNameChild = createObject(renamedChild.state, { objectClass: 'container', rdn: 'Pharmacy', parent: sibling.object.guid })
    expect(() => moveObject(sameNameChild.state, pharmacy.guid, sibling.object.guid)).toThrow(/sibling/)
    expect(() => renameObject(renamedChild.state, pharmacy.guid, 'Renamed')).toThrow(/sibling/)
  })
})
