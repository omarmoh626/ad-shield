import { describe, expect, it } from 'vitest'
import { findBySamAccountName } from '../../../src/domain/indexes'
import { formatLabTime, parseLabTime } from '../../../src/ps/cmdlets/diagnostics/time'
import { LAB_START } from '../../../src/fixtures/baseDomain'
import { getProperty } from '../../../src/ps/values'
import { lab, run, stateOf } from '../fakeModule'

function lockedOutLab() {
  const fixture = lab()
  for (let attempt = 0; attempt < 5; attempt += 1) run('Test-SimSignIn pnair PHARM-WS01 -SimulateBadPassword', fixture.rt)
  return fixture
}

describe('Get-WinEvent', () => {
  it("returns the lockout for @{LogName='Security'; Id=4740} -ComputerName DC01 with host, time, and target", () => {
    const { rt } = lockedOutLab()
    const result = run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740} -ComputerName DC01", rt)
    expect(result.errors).toEqual([])
    expect(result.values).toHaveLength(1)
    const event = result.values[0]
    expect(getProperty(event, 'Id')).toBe(4740)
    expect(getProperty(event, 'MachineName')).toBe('DC01.corp.contoso.local')
    expect(getProperty(event, 'TimeCreated')).toBe('2026-01-12T13:00:00Z')
    expect(getProperty(event, 'TargetUserName')).toBe('pnair')
    expect(result.output).toContain('A user account was locked out.')
  })

  it('without -ComputerName reads only the local admin workstation, so the DC lockout is not found', () => {
    const { rt } = lockedOutLab()
    const result = run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740}", rt)
    expect(result.values).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('No events were found that match the specified selection criteria.')
    expect(rt.transcript.at(-1)?.text).toContain('No events were found that match the specified selection criteria.')

    run('Test-SimSignIn rchen.ops IT-ADM01', rt)
    const local = run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624}", rt).values
    expect(local.map((event) => getProperty(event, 'MachineName'))).toEqual(['IT-ADM01.corp.contoso.local'])
  })

  it('records sign-in failures on the workstation, newest first, and honors -ComputerName and -MaxEvents', () => {
    const { rt } = lockedOutLab()
    const failures = run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -ComputerName PHARM-WS01", rt).values
    expect(failures).toHaveLength(5)
    expect(failures.map((event) => getProperty(event, 'MachineName'))).toEqual(Array(5).fill('PHARM-WS01.corp.contoso.local'))
    const seqs = failures.map((event) => Number(getProperty(event, 'RecordId')))
    expect([...seqs].sort((a, b) => b - a)).toEqual(seqs)

    expect(run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -ComputerName pharm-ws01 -MaxEvents 2", rt).values).toHaveLength(2)
    expect(run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -ComputerName DC01", rt).errors[0].message).toContain('No events were found')
    expect(run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740} -ComputerName DC01.corp.contoso.local", rt).values).toHaveLength(1)
  })

  it('filters by time range and never returns simulator events', () => {
    const { rt } = lockedOutLab()
    run('Step-SimClock -Hours 1', rt)
    run('Unlock-ADAccount pnair', rt)
    expect(stateOf(rt).events.some((event) => event.origin === 'simulator')).toBe(true)
    const dc = run("Get-WinEvent -FilterHashtable @{LogName='Security'} -ComputerName DC01", rt).values
    const ws = run("Get-WinEvent -FilterHashtable @{LogName='Security'} -ComputerName PHARM-WS01", rt).values
    expect(dc.length + ws.length).toBe(stateOf(rt).events.filter((event) => event.origin === 'windows').length)
    const later = run("Get-WinEvent -FilterHashtable @{LogName='Security'; StartTime='2026-01-12T13:30:00Z'} -ComputerName DC01", rt).values
    expect(later.map((event) => getProperty(event, 'Id'))).toEqual([4767])
    const earlier = run("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740; EndTime='2026-01-12T13:30:00Z'} -ComputerName DC01", rt).values
    expect(earlier).toHaveLength(1)
    expect(findBySamAccountName(stateOf(rt), 'pnair')).toBeDefined()
  })

  it('rejects a missing LogName, an unknown key, and a bad date', () => {
    const { rt } = lab()
    expect(run('Get-WinEvent -FilterHashtable @{Id=4740}', rt).errors[0].message).toContain('LogName')
    expect(run("Get-WinEvent -FilterHashtable @{LogName='Security'; ProviderName='x'}", rt).errors[0].message).toContain("'ProviderName' is not supported")
    expect(run("Get-WinEvent -FilterHashtable @{LogName='Security'; StartTime='2026-02-30'}", rt).errors[0].message).toContain('not a valid date')
  })

  it('formats and parses lab time without the real clock', () => {
    expect(formatLabTime(LAB_START)).toBe('2026-01-12T13:00:00Z')
    expect(formatLabTime(Date.UTC(2024, 1, 29, 23, 59, 59))).toBe('2024-02-29T23:59:59Z')
    expect(parseLabTime('2026-01-12T13:00:00Z', 'x', 'h')).toBe(LAB_START)
    expect(parseLabTime('2026-01-12', 'x', 'h')).toBe(Date.UTC(2026, 0, 12))
  })
})
