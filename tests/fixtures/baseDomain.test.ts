import { describe, expect, it } from 'vitest'
import { deriveDn } from '../../src/domain/dn'
import { getObjectByDn } from '../../src/domain/graph'
import { buildIndexes } from '../../src/domain/indexes'
import { canNest, groupScope, isAuthorized, isPrimaryGroupOf, memberKind, recordingHost, ridOf } from '../../src/engine'
import { buildBaseDomain, DOMAIN_DNS_NAME, LAB_START, OPERATOR_ID } from '../../src/fixtures/baseDomain'

describe('base domain fixture', () => {
  const { state, ids } = buildBaseDomain()

  it('loads corp.contoso.local with the default containers and required objects', () => {
    expect(state.now).toBe(LAB_START)
    expect(state.objects[ids.domain]).toMatchObject({ objectClass: 'domain', rdn: DOMAIN_DNS_NAME, parent: null })
    expect(deriveDn(state, ids.domain)).toBe('DC=corp,DC=contoso,DC=local')
    expect(deriveDn(state, ids['cn.users'])).toBe('CN=Users,DC=corp,DC=contoso,DC=local')
    expect(deriveDn(state, ids['cn.computers'])).toBe('CN=Computers,DC=corp,DC=contoso,DC=local')
    expect(deriveDn(state, ids['ou.pharmacy'])).toBe('OU=Pharmacy,DC=corp,DC=contoso,DC=local')
    expect(deriveDn(state, ids['ou.finance'])).toBe('OU=Finance,DC=corp,DC=contoso,DC=local')
    for (const id of ['ou.workstations', 'ou.servers', 'computer.dc01', 'computer.fs01', 'user.svcPharmRx', 'group.allStaff', OPERATOR_ID]) expect(state.objects[ids[id]], id).toBeDefined()
    expect(recordingHost(state)).toBe('DC01.corp.contoso.local')
    expect(groupScope(state.objects[ids['group.pharmacyStaff']])).toBe('Global')
    expect(groupScope(state.objects[ids['group.pharmacyShareRead']])).toBe('DomainLocal')
    expect(groupScope(state.objects[ids['group.allStaff']])).toBe('Universal')
    expect(ridOf(state.objects[ids['group.domainAdmins']])).toBe(512)
    expect(ridOf(state.objects[ids['group.domainUsers']])).toBe(513)
  })

  it('keeps every index consistent', () => {
    expect(state.indexes).toEqual(buildIndexes(state))
    const objects = Object.values(state.objects)
    expect(Object.keys(state.indexes.byDn).length).toBe(objects.length)
    for (const object of objects) {
      expect(getObjectByDn(state, deriveDn(state, object))?.guid).toBe(object.guid)
      expect(object.rev).toBeLessThanOrEqual(state.revision)
      if (object.parent !== null) expect(state.indexes.childrenByParent[object.parent]).toContain(object.guid)
    }
    const sids = objects.flatMap((object) => (object.sid ? [object.sid] : []))
    expect(new Set(sids).size).toBe(sids.length)
  })

  it('holds only valid memberships and never a primary group row', () => {
    expect(state.memberships.length).toBeGreaterThan(0)
    for (const row of state.memberships) {
      const group = state.objects[row.group]
      const member = state.objects[row.member]
      const scope = groupScope(group)
      const kind = memberKind(member)
      expect(scope && kind && canNest(scope, kind), `${member.rdn} in ${group.rdn}`).toBe(true)
      expect(isPrimaryGroupOf(group, member)).toBe(false)
    }
    for (const object of Object.values(state.objects)) {
      const primary = object.attrs.primaryGroupID
      if (typeof primary === 'number') expect(Object.values(state.objects).some((group) => group.objectClass === 'group' && ridOf(group) === primary), object.rdn).toBe(true)
    }
  })

  it('gives every object a fixture ID that is stable across builds', () => {
    const again = buildBaseDomain()
    expect(again.ids).toEqual(ids)
    expect(again.state).toEqual(state)
    expect(buildBaseDomain(99).ids).toEqual(ids)
    expect(new Set(Object.values(ids)).size).toBe(Object.keys(ids).length)
    expect(Object.keys(ids).length).toBe(Object.keys(state.objects).length)
  })

  it('limits the operator to the delegated department scope', () => {
    const operator = ids[OPERATOR_ID]
    expect(isAuthorized(state, operator, { within: ids['ou.pharmacy'], objectClass: 'user' })).toBe(true)
    expect(isAuthorized(state, operator, { within: ids['ou.resourceGroups'], objectClass: 'group' })).toBe(true)
    expect(isAuthorized(state, operator, { within: ids['cn.users'], objectClass: 'user' })).toBe(true)
    expect(isAuthorized(state, operator, { within: ids['cn.users'], objectClass: 'group' })).toBe(false)
    expect(isAuthorized(state, operator, { within: ids['ou.executive'], objectClass: 'user' })).toBe(false)
    expect(isAuthorized(state, operator, { within: ids['ou.it'], objectClass: 'group' })).toBe(false)
    expect(isAuthorized(state, ids['user.pnair'], { within: ids['ou.pharmacy'], objectClass: 'user' })).toBe(false)
  })

  it('stores no password value', () => {
    const text = JSON.stringify(state).toLowerCase()
    expect(text).not.toContain('password')
    expect(text).not.toContain('secret')
  })
})
