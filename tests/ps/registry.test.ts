import { describe, expect, it } from 'vitest'
import { highlight } from '../../src/ps/highlight'
import { complete } from '../../src/ps/completion'
import { createDefaultRegistry } from '../../src/ps/runtime'
import { lab, run } from './fakeModule'

describe('registry', () => {
  it('runs every help example of every registered cmdlet without error', () => {
    const { registry } = lab()
    const examples = registry.list().flatMap((spec) => spec.help.examples.map((example) => ({ name: spec.name, code: example.code })))
    expect(examples.length).toBeGreaterThanOrEqual(registry.list().length)
    for (const example of examples) {
      const { rt } = lab()
      expect(run(example.code, rt).errors.map((error) => error.message), `${example.name}: ${example.code}`).toEqual([])
    }
  })

  it('gives every cmdlet a module, a synopsis, and at least one example', () => {
    for (const spec of createDefaultRegistry().list()) {
      expect(spec.module, spec.name).toMatch(/^Microsoft\.PowerShell\.(Core|Utility)$/)
      expect(spec.help.synopsis.length, spec.name).toBeGreaterThan(10)
      expect(spec.help.examples.length, spec.name).toBeGreaterThan(0)
    }
    expect(createDefaultRegistry().list().map((spec) => spec.name)).toEqual(['Get-Command', 'Get-Help', 'Get-Member', 'Read-Host', 'Select-Object', 'Where-Object', 'Write-Output'])
  })

  it('refuses a duplicate command name or alias', () => {
    const { registry } = lab()
    expect(() => registry.register({ ...registry.resolve('Fake-Get')!, name: 'Other-Get', aliases: ['WHERE'] })).toThrow(/registered twice/)
  })
})

describe('completion', () => {
  it('offers cmdlet names, then parameter names for the cmdlet', () => {
    const { registry } = lab()
    expect(complete('Fake-', 5, registry)).toEqual({ start: 0, end: 5, candidates: ['Fake-Get', 'Fake-Remove', 'Fake-Set'] })
    expect(complete('fake-s', 6, registry).candidates).toEqual(['Fake-Set'])
    expect(complete('Fake-Set -P', 11, registry)).toEqual({ start: 9, end: 11, candidates: ['-PassThru', '-Path'] })
    expect(complete('Fake-Set mali -', 15, registry).candidates).toEqual(['-Confirm', '-Department', '-Identity', '-Level', '-PassThru', '-Path', '-WhatIf'])
    expect(complete('Fake-Get mali | Sel', 19, registry).candidates).toEqual(['Select-Object'])
    expect(complete('$x = Fake-G', 11, registry).candidates).toEqual(['Fake-Get'])
    expect(complete('fget -F', 7, registry).candidates).toEqual(['-Filter'])
  })

  it('offers nothing inside a string, for a value, or after an unknown command', () => {
    const { registry } = lab()
    expect(complete("Fake-Get 'Fake-", 15, registry).candidates).toEqual([])
    expect(complete('Fake-Get ma', 11, registry).candidates).toEqual([])
    expect(complete('Nope-Thing -', 12, registry).candidates).toEqual([])
  })
})

describe('highlight', () => {
  it('marks known and unknown commands, parameters, strings, variables, and comments', () => {
    const { registry } = lab()
    const source = "$u = Fake-Get -Identity 'it''s' | Nope-Thing 5 # note"
    const spans = highlight(source, registry).map((span) => [source.slice(span.start, span.end), span.kind])
    expect(spans).toEqual([
      ['$u', 'variable'], ['=', 'punctuation'], ['Fake-Get', 'command'], ['-Identity', 'parameter'], ["'it''s'", 'string'],
      ['|', 'punctuation'], ['Nope-Thing', 'unknownCommand'], ['5', 'number'], ['# note', 'comment'],
    ])
  })

  it('keeps offsets right across lines, escapes, and operators', () => {
    const { registry } = lab()
    const source = 'Fake-Get |\n  where { $_.Name -like "a`"b" } @p'
    const spans = highlight(source, registry).map((span) => [source.slice(span.start, span.end), span.kind])
    expect(spans).toContainEqual(['where', 'command'])
    expect(spans).toContainEqual(['-like', 'operator'])
    expect(spans).toContainEqual(['"a`"b"', 'string'])
    expect(spans).toContainEqual(['@p', 'variable'])
    expect(spans).toContainEqual(['Name', 'text'])
  })
})
