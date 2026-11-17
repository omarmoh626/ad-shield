import { describe, expect, it } from 'vitest'
import { listSessions } from '../../../src/access/sessions'
import { findBySamAccountName } from '../../../src/domain/indexes'
import { LAB_START } from '../../../src/fixtures/baseDomain'
import { getProperty, type PsValue } from '../../../src/ps/values'
import { lab, run, stateOf } from '../fakeModule'

const prop = (value: PsValue, name: string) => getProperty(value, name)

describe('ADShield.Sim cmdlets', () => {
  it('every sim cmdlet prints the word simulated', () => {
    const { rt } = lab()
    const outputs = [
      run('Test-SimSignIn pnair PHARM-WS01', rt).output,
      run('Test-SimResourceAccess pnair Pharmacy', rt).output,
      run('Step-SimClock -Minutes 5', rt).output,
      run('Add-SimResourcePermission Finance pnair -Right Read', rt).output,
      run('Remove-SimResourcePermission Finance pnair -Right Read', rt).output,
    ]
    for (const output of outputs) expect(output).toContain('simulated')
    expect(rt.registry.list('ADShield.Sim').map((spec) => spec.name)).toEqual(['Add-SimResourcePermission', 'Remove-SimResourcePermission', 'Step-SimClock', 'Test-SimResourceAccess', 'Test-SimSignIn'])
  })

  it('Test-SimSignIn issues a session and Test-SimResourceAccess -Session uses its snapshot', () => {
    const { rt } = lab()
    const signIn = run('$s = Test-SimSignIn -Identity bcastillo -ComputerName NURS-WS01; $s', rt)
    expect(signIn.errors).toEqual([])
    expect(prop(signIn.values[0], 'Result')).toBe('Success')
    expect(prop(signIn.values[0], 'SessionId')).toBe('sess-1')
    expect(run('Add-ADGroupMember GG-Pharmacy-Staff -Members bcastillo', rt).errors).toEqual([])

    const old = run('Test-SimResourceAccess -Session $s -Resource Pharmacy', rt)
    expect(old.errors).toEqual([])
    expect(prop(old.values[0], 'Allowed')).toBe(false)
    expect(String(prop(old.values[0], 'Basis'))).toContain('existing session sess-1')

    const fresh = run('Test-SimResourceAccess -Identity bcastillo -Resource Pharmacy', rt)
    expect(prop(fresh.values[0], 'Allowed')).toBe(true)
    expect(prop(fresh.values[0], 'Via')).toBe('role')
    expect(prop(fresh.values[0], 'Paths')).toContain('bcastillo > GG-Pharmacy-Staff > DL-Pharmacy-Share-Read')
    expect(String(prop(fresh.values[0], 'Reason'))).toContain('Both layers allow Read')
  })

  it('explains a denial: which layer, which entries, and in what order', () => {
    const { rt } = lab()
    const result = run('Test-SimResourceAccess pnair Pharmacy -Right Modify', rt)
    const value = result.values[0]
    expect(prop(value, 'Allowed')).toBe(false)
    expect(prop(value, 'Via')).toBe('none')
    expect(String(prop(value, 'ShareLayer'))).toContain('no entry grants Modify')
    expect(prop(value, 'Entries')).toContain('Share 1: Allow Read DL-Pharmacy-Share-Read (explicit) - does not apply')
    expect(result.output).toContain('Reason')
  })

  it('Test-SimResourceAccess is read-only: no -WhatIf, no event, no session, same state', () => {
    const { rt } = lab()
    const before = stateOf(rt)
    expect(rt.registry.resolve('Test-SimResourceAccess')!.supportsWhatIf).toBe(false)
    const whatIf = run('Test-SimResourceAccess pnair Pharmacy -WhatIf', rt)
    expect(whatIf.errors.length).toBeGreaterThan(0)
    const result = run('Test-SimResourceAccess pnair Pharmacy', rt)
    expect(result.errors).toEqual([])
    expect(result.committed).toEqual([])
    expect(result.state).toBe(before)
    expect(stateOf(rt).events).toHaveLength(before.events.length)
  })

  it('a fresh sign-in that would fail is reported without an access check or event', () => {
    const { rt } = lab()
    const before = stateOf(rt)
    const result = run('Test-SimResourceAccess mali Pharmacy', rt)
    expect(result.state).toBe(before)
    expect(prop(result.values[0], 'Allowed')).toBe(false)
    expect(String(prop(result.values[0], 'Reason'))).toContain('locked out')
  })

  it('rejects an expired or unknown session', () => {
    const { rt } = lab()
    run('$s = Test-SimSignIn pnair PHARM-WS01', rt)
    expect(run('Test-SimResourceAccess -Session sess-9 -Resource Pharmacy', rt).errors[0].message).toContain("no simulated session 'sess-9'")
    run('Step-SimClock -Hours 11', rt)
    expect(run('Test-SimResourceAccess -Session $s -Resource Pharmacy', rt).errors[0].message).toContain('expired')
  })

  it('five bad sign-ins lock the account through the console', () => {
    const { rt } = lab()
    for (let attempt = 0; attempt < 5; attempt += 1) run('Test-SimSignIn pnair PHARM-WS01 -SimulateBadPassword', rt)
    const pnair = stateOf(rt).objects[findBySamAccountName(stateOf(rt), 'pnair')!]
    expect(pnair.attrs.lockedOut).toBe(true)
    const denied = run('Test-SimSignIn pnair PHARM-WS01', rt)
    expect(prop(denied.values[0], 'Result')).toBe('Failure')
    expect(listSessions(stateOf(rt))).toHaveLength(0)
  })

  it('Step-SimClock advances state.now and appends a simulator event', () => {
    const { rt } = lab()
    const before = stateOf(rt)
    const result = run('Step-SimClock -Hours 2 -Minutes 30', rt)
    expect(result.errors).toEqual([])
    expect(stateOf(rt).now).toBe(LAB_START + 150 * 60_000)
    expect(stateOf(rt).events.slice(before.events.length)).toEqual([expect.objectContaining({ origin: 'simulator', data: expect.objectContaining({ kind: 'clock.advance' }) })])
    expect(result.output).toContain('2026-01-12T15:30:00Z')
    expect(run('Step-SimClock', rt).errors[0].message).toContain('only moves forward')
  })

  it('Add- and Remove-SimResourcePermission change access through the pipeline, with -WhatIf', () => {
    const { rt } = lab()
    const before = stateOf(rt)
    const preview = run('Add-SimResourcePermission Finance pnair -Right Read -WhatIf', rt)
    expect(preview.output).toContain('What if')
    expect(preview.state).toBe(before)
    expect(prop(run('Test-SimResourceAccess pnair Finance', rt).values[0], 'Allowed')).toBe(false)
    run('Add-SimResourcePermission Finance pnair -Right Read', rt)
    expect(prop(run('Test-SimResourceAccess pnair Finance', rt).values[0], 'Via')).toBe('direct')
    run('Remove-SimResourcePermission Finance pnair -Right Read', rt)
    expect(prop(run('Test-SimResourceAccess pnair Finance', rt).values[0], 'Allowed')).toBe(false)
    expect(run('Add-SimResourcePermission Finance DG-Pharmacy-News -Right Read', rt).errors[0].message).toContain('distribution group')
    expect(run('Add-SimResourcePermission Payroll pnair -Right Read', rt).errors[0].message).toContain('Lab shares: Finance, Pharmacy')
  })
})
