import { describe, expect, it } from 'vitest'
import { run as runConsole } from '../../src/ps/runtime'
import { SECRET, lab, run, stateOf } from './fakeModule'

describe('runtime', () => {
  it('dispatches nothing when the input has a parse error', () => {
    const { rt, dispatch, initial } = lab()
    const result = run('Fake-Set mali IT\nFake-Set jdoe (1 + 2)', rt)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toMatchObject({ line: 2 })
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.committed).toEqual([])
    expect(result.state).toBe(initial)
  })

  it('names an invalid parameter and dispatches nothing, even for earlier statements', () => {
    const { rt, dispatch, initial } = lab()
    const result = run('Fake-Set mali IT\nFake-Set jdoe -Bogus 1', rt)
    expect(result.state).toBe(initial)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("'-Bogus'")
    expect(result.errors[0]).toMatchObject({ line: 2, column: 15 })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('reports an unknown command with a Get-Help example that works', () => {
    const { rt, dispatch } = lab()
    const result = run('Fake-Set mali IT; Fake-Frobnicate mali', rt)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("'Fake-Frobnicate' is not a command in this lab")
    expect(dispatch).not.toHaveBeenCalled()
    const help = result.errors[0].help as string
    expect(help).toMatch(/^Get-Help /)
    const shown = run(help, rt)
    expect(shown.errors).toEqual([])
    expect(shown.output).toContain('EXAMPLE 1')
    expect(run('Get-Usr', rt).errors[0].help).toBe('Get-Help Get-Command -Examples')
  })

  it('gives a working Get-Help example for unsupported syntax', () => {
    const { rt } = lab()
    const result = run('if ($true) { Fake-Get }', rt)
    expect(result.errors[0].message).toContain('Unsupported syntax')
    expect(run(result.errors[0].help as string, rt).errors).toEqual([])
  })

  it('keeps earlier results when a record fails mid-pipeline and names the identity', () => {
    const { rt } = lab()
    const result = run("'mali', 'ghost', 'jdoe' | Fake-Set -Department IT", rt)
    expect(result.values.map((value) => (value as unknown as { properties: { SamAccountName: string } }).properties.SamAccountName)).toEqual(['mali', 'jdoe'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].identity).toBe('ghost')
    expect(result.errors[0].message).toContain("'ghost'")
    expect(result.committed).toHaveLength(2)
    expect(result.committed[1].state).toBe(result.state)
    expect(result.state.revision).toBe(lab().initial.revision + 2)
  })

  it('keeps results from earlier statements when a later command throws', () => {
    const { rt } = lab()
    const result = run('Fake-Get mali; Fake-Get ghost; Fake-Get jdoe', rt)
    expect(result.values).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].identity).toBe('ghost')
  })

  it('rejects pipeline input of a type the cmdlet does not accept, per record', () => {
    const { rt, dispatch } = lab()
    const result = run("Fake-Get mali | Select-Object Name | Fake-Set -Department IT", rt)
    expect(result.errors[0].message).toContain('Selected.Fake.User')
    expect(dispatch).not.toHaveBeenCalled()
    expect(run('Fake-Get mali | Fake-Get', rt).errors[0].message).toContain('does not take pipeline input')
  })

  it('keeps variables between runs and expands them in double-quoted strings only', () => {
    const { rt } = lab()
    run("$who = 'mali'", rt)
    expect(run('Write-Output "user $who" \'user $who\' "cost `$5"', rt).values).toEqual(['user mali', 'user $who', 'cost $5'])
    expect(run('$who.Length', rt).values).toEqual([4])
    expect(run('$true = 1', rt).errors[0].message).toContain('read-only')
  })

  it('never stores simulated secure input in the transcript, history, variables, or results', () => {
    const { rt } = lab({ readSecure: () => ({ policy: 'pass', value: SECRET }) as { policy: 'pass' } })
    const result = run("$s = Read-Host -Prompt 'New password (simulated)' -AsSecureString\n$s\nWrite-Output \"got $s\"", rt)
    expect(result.errors).toEqual([])
    const everything = JSON.stringify([rt.transcript, rt.history, result, rt.getVariable('s')])
    expect(everything).not.toContain(SECRET)
    expect(rt.getVariable('s')).toMatchObject({ typeName: 'System.Security.SecureString', credential: { policy: 'pass' } })
    expect(Object.keys(rt.getVariable('s') as object).sort()).toEqual(['credential', 'properties', 'text', 'typeName'])
    expect(rt.transcript.some((entry) => entry.kind === 'prompt' && entry.text.includes('simulated secure input, not stored'))).toBe(true)
    expect(result.output).toContain('System.Security.SecureString')
  })

  it('reads a plain line through the host and records the transcript', () => {
    const { rt } = lab()
    expect(run("Read-Host 'Ticket note'", rt).values).toEqual(['typed line'])
    expect(rt.transcript.map((entry) => entry.kind)).toEqual(['input', 'prompt', 'output'])
    expect(rt.history).toEqual(["Read-Host 'Ticket note'"])
  })

  it('leaves the state identical when a script dispatches an action and then hits a pending prompt', () => {
    const { rt, dispatch, initial } = lab({ readSecure: () => undefined })
    run("$kept = 'before'", rt)
    const snapshot = JSON.stringify(initial)
    const source = "$kept = 'changed'\nFake-Set mali IT\n$s = Read-Host 'New password (simulated)' -AsSecureString\nFake-Set jdoe IT"
    const first = runConsole(source, rt, initial)
    expect(first.pending).toEqual({ kind: 'secure', prompt: 'New password (simulated)' })
    expect(first).toMatchObject({ output: '', values: [], errors: [], committed: [] })
    // The action before the prompt did run against the draft, and the draft is gone.
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(first.state).toBe(initial)
    expect(JSON.stringify(initial)).toBe(snapshot)
    expect(rt.state).toBe(initial)
    expect(rt.getVariable('kept')).toBe('before')
    expect(rt.getVariable('s')).toBeNull()
    expect(rt.history).toEqual(["$kept = 'before'"])
    expect(rt.transcript).toHaveLength(1)
  })

  it('commits each action exactly once when the input is run again with the answer', () => {
    const answers: { policy: 'pass' | 'fail' }[] = []
    const { rt, initial } = lab({ readSecure: () => answers[0] })
    const source = "Fake-Set mali IT\n$s = Read-Host 'New password (simulated)' -AsSecureString\nFake-Set jdoe IT"
    expect(run(source, rt).pending).toBeDefined()
    expect(run(source, rt).pending).toBeDefined()
    expect(stateOf(rt)).toBe(initial)
    answers.push({ policy: 'fail' })
    const done = run(source, rt)
    expect(done.pending).toBeUndefined()
    expect(done.errors).toEqual([])
    expect(done.committed).toHaveLength(2)
    expect(done.state).not.toBe(initial)
    expect(done.state.revision).toBe(initial.revision + 2)
    expect(done.state.events).toHaveLength(initial.events.length + 2)
    expect(done.committed.map((result) => result.diff.map((change) => change.after))).toEqual([['IT'], ['IT']])
    expect(done.committed[1].state).toBe(done.state)
    expect(rt.getVariable('s')).toMatchObject({ credential: { policy: 'fail' } })
    expect(rt.history).toHaveLength(1)
    expect(initial.revision).toBe(lab().initial.revision)
  })

  it('stops with a pending confirmation in the middle of a script and changes nothing', () => {
    let answer: boolean | undefined
    const { rt, dispatch, initial } = lab({ confirm: () => answer })
    const waiting = run('Fake-Set mali IT; Fake-Remove sold', rt)
    expect(waiting.pending).toMatchObject({ kind: 'confirm' })
    expect(waiting.committed).toEqual([])
    expect(waiting.state).toBe(initial)
    answer = false
    const declined = run('Fake-Set mali IT; Fake-Remove sold', rt)
    expect(declined.errors[0].message).toContain('was cancelled')
    expect(declined.committed).toHaveLength(1)
    expect(declined.state.revision).toBe(initial.revision + 1)
    answer = true
    const confirmed = run('Fake-Remove sold', rt)
    expect(confirmed.committed).toHaveLength(1)
    expect(confirmed.state.revision).toBe(initial.revision + 2)
    expect(dispatch).toHaveBeenCalledTimes(3)
    expect(run("Read-Host 'Note'", lab({ readLine: () => undefined }).rt).pending).toEqual({ kind: 'line', prompt: 'Note' })
  })

  it('reports an action the engine refuses and keeps the state', () => {
    const { rt, initial } = lab()
    const result = run('Fake-Remove ehartmann -Confirm:$false', rt)
    expect(result.state).toBe(initial)
    expect(result.committed).toEqual([])
  })

  it('does not crash on deeply nested input', () => {
    const { rt, dispatch } = lab()
    const result = run(`Fake-Set mali IT; Fake-Get ${'{'.repeat(5000)}`, rt)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('rejects commands inside script blocks before anything runs', () => {
    const { rt, dispatch } = lab()
    const result = run('Fake-Set mali IT; Fake-Get | Where-Object { Fake-Set jdoe IT }', rt)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toMatchObject({ line: 1 })
    expect(dispatch).not.toHaveBeenCalled()
    const assigned = run('Fake-Set mali IT; Fake-Get | Where-Object { $x = 1 }', rt)
    expect(assigned.errors[0].message).toContain('script block')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('keeps a comma list of three or more items flat', () => {
    const { rt } = lab()
    expect(run("Write-Output 1, 2, 3, 4", rt).values).toEqual([1, 2, 3, 4])
    expect(run("$list = 'a', 'b', 'c'\n$list.Count", rt).values).toEqual([3])
  })
})
