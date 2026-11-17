import { describe, expect, it } from 'vitest'
import { lab, run, stateOf } from './fakeModule'

const names = (values: unknown[]) => values.map((value) => (value as { properties: { SamAccountName: string } }).properties.SamAccountName)

describe('binder', () => {
  it('binds mixed-case command and parameter names', () => {
    const { rt } = lab()
    const result = run('fAkE-gEt -iDeNtItY mali', rt)
    expect(result.errors).toEqual([])
    expect(names(result.values)).toEqual(['mali'])
  })

  it('resolves aliases', () => {
    const { rt } = lab()
    expect(names(run('fget mali', rt).values)).toEqual(['mali'])
  })

  it('binds an unambiguous abbreviation', () => {
    const { rt, dispatch } = lab()
    const result = run('Fake-Set mali -Dep IT', rt)
    expect(result.errors).toEqual([])
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ attrs: { department: 'IT' } }), { whatIf: false })
  })

  it('rejects an ambiguous abbreviation, lists the candidates, and dispatches nothing', () => {
    const { rt, dispatch } = lab()
    const result = run('Fake-Set mali -Pa x', rt)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain("'-Pa' is ambiguous")
    expect(result.errors[0].message).toContain('-Path')
    expect(result.errors[0].message).toContain('-PassThru')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('binds positional arguments the same as named ones', () => {
    const a = lab(), b = lab()
    run('Fake-Set mali IT', a.rt)
    run('Fake-Set -Department IT -Identity mali', b.rt)
    expect(a.dispatch.mock.calls).toEqual(b.dispatch.mock.calls)
    expect(a.dispatch).toHaveBeenCalledTimes(1)
  })

  it('binds a splatted hashtable the same as named parameters', () => {
    const a = lab(), b = lab()
    const splat = run("$p = @{ Identity = 'mali'; Department = 'IT' }\nFake-Set @p", a.rt)
    run("Fake-Set -Identity 'mali' -Department 'IT'", b.rt)
    expect(splat.errors).toEqual([])
    expect(a.dispatch.mock.calls).toEqual(b.dispatch.mock.calls)
    expect(a.dispatch).toHaveBeenCalledTimes(1)
  })

  it('resolves the parameter set from the named parameters', () => {
    const { rt } = lab()
    expect(names(run("Fake-Get -Filter '*'", rt).values)).toEqual(['mali', 'jdoe', 'sold'])
    const mixed = run("Fake-Get -Filter '*' -Identity mali", rt)
    expect(mixed.errors[0].message).toContain('cannot be used together')
  })

  it('treats a switch followed by a value as a switch plus a positional argument', () => {
    const { rt, dispatch } = lab()
    const result = run('Fake-Set -PassThru mali IT', rt)
    expect(result.errors).toEqual([])
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ target: 'mali', attrs: { department: 'IT' } }), { whatIf: false })
  })

  it('honors -Switch:$false and -WhatIf', () => {
    const { rt, dispatch } = lab()
    const off = run('Fake-Set mali IT -WhatIf:$false', rt)
    expect(off.committed).toHaveLength(1)
    const preview = run('Fake-Set mali HR -WhatIf', rt)
    expect(dispatch).toHaveBeenLastCalledWith(expect.anything(), { whatIf: true })
    expect(preview.committed).toEqual([])
    expect(preview.output).toContain('What if:')
    const { rt: fresh, initial } = lab()
    expect(run('Fake-Set jdoe IT -WhatIf', fresh).state).toBe(initial)
    expect(stateOf(fresh).events).toHaveLength(initial.events.length)
  })

  it('cancels a high-impact change that is not confirmed, and runs it with -Confirm:$false', () => {
    const { rt, dispatch } = lab()
    const cancelled = run('Fake-Remove sold', rt)
    expect(cancelled.errors[0].message).toContain('was cancelled')
    expect(dispatch).not.toHaveBeenCalled()
    expect(run('Fake-Remove sold -Confirm:$false', rt).errors).toEqual([])
    expect(dispatch).toHaveBeenCalledTimes(1)
    const asked = lab({ confirm: () => true })
    expect(run('Fake-Set mali IT -Confirm', asked.rt).errors).toEqual([])
    expect(asked.dispatch).toHaveBeenCalledTimes(1)
  })

  it('converts types and reports a value that cannot be converted', () => {
    const { rt, dispatch } = lab()
    expect(run("Fake-Set mali -Level '3'", rt).errors).toEqual([])
    const bad = run('Fake-Set mali -Level high', rt)
    expect(bad.errors[0].message).toContain("Cannot bind parameter '-Level'")
    expect(bad.errors[0].message).toContain('System.Int32')
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('reports a missing value, a duplicate, an extra positional, and a missing mandatory parameter', () => {
    const { rt, dispatch } = lab()
    expect(run('Fake-Set mali -Department', rt).errors[0].message).toContain("'-Department' needs a value")
    expect(run('Fake-Set mali -Department a -Department b', rt).errors[0].message).toContain('more than once')
    expect(run('Fake-Set mali IT extra', rt).errors[0].message).toContain("accepts the argument 'extra'")
    expect(run('Fake-Set -Department IT', rt).errors[0].message).toContain("mandatory parameter '-Identity'")
    expect(dispatch).not.toHaveBeenCalled()
  })
})
