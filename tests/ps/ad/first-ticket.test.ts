import { describe, expect, it } from 'vitest'
import { findBySamAccountName } from '../../../src/domain/indexes'
import { getProperty } from '../../../src/ps/values'
import { lab, run, stateOf } from '../fakeModule'

const SCRIPT = `# Inspect the correct account. Expected here: Enabled=True, LockedOut=True.
Get-ADUser -Identity mali -Properties LockedOut | Select-Object SamAccountName,Enabled,LockedOut

# Preview the target. Maya remains locked after this line.
Unlock-ADAccount -Identity mali -WhatIf

# Apply the change. A successful unlock normally gives no console output.
Unlock-ADAccount -Identity mali

# Read the account again. Expected here: Enabled=True, LockedOut=False.
Get-ADUser -Identity mali -Properties LockedOut | Select-Object SamAccountName,Enabled,LockedOut`

const LINES = SCRIPT.split('\n').filter((line) => line.trim() && !line.startsWith('#'))

describe('A complete first ticket (SPEC)', () => {
  it('runs the four-line script as one input with the expected outputs and event 4767', () => {
    const { rt, initial } = lab()
    const result = run(SCRIPT, rt)
    expect(result.errors).toEqual([])
    expect(result.values).toHaveLength(2)
    const [before, after] = result.values
    expect([getProperty(before, 'SamAccountName'), getProperty(before, 'Enabled'), getProperty(before, 'LockedOut')]).toEqual(['mali', true, true])
    expect([getProperty(after, 'SamAccountName'), getProperty(after, 'Enabled'), getProperty(after, 'LockedOut')]).toEqual(['mali', true, false])
    expect(result.output).toContain('What if: Performing the operation "Set" on target "CN=Maya Ali,OU=Pharmacy,DC=corp,DC=contoso,DC=local"')
    expect(result.committed).toHaveLength(1)
    const appended = result.state.events.slice(initial.events.length)
    expect(appended.map((event) => event.eventId)).toEqual([4767])
    expect(appended[0].target).toBe(findBySamAccountName(initial, 'mali'))
  })

  it('line by line: the -WhatIf line keeps the state reference and appends no event; the unlock prints nothing', () => {
    const { rt } = lab()
    expect(run(LINES[0], rt).errors).toEqual([])
    const beforePreview = stateOf(rt)
    const preview = run(LINES[1], rt)
    expect(preview.errors).toEqual([])
    expect(preview.state).toBe(beforePreview)
    expect(preview.committed).toEqual([])
    expect(preview.state.events).toHaveLength(beforePreview.events.length)
    expect(preview.output).toMatch(/^What if: /)

    const unlock = run(LINES[2], rt)
    expect(unlock.errors).toEqual([])
    expect(unlock.output).toBe('')
    expect(unlock.values).toEqual([])
    expect(unlock.state.events.at(-1)?.eventId).toBe(4767)

    const reread = run(LINES[3], rt)
    expect(getProperty(reread.values[0], 'LockedOut')).toBe(false)
  })

  it('starts at the PS C:\\Lab> prompt', () => {
    const { rt } = lab()
    expect(rt.prompt).toBe('PS C:\\Lab>')
    expect(rt.location).toBe('C:\\Lab')
  })
})
