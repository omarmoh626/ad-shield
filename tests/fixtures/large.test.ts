import { describe, expect, it } from 'vitest'
import { buildLargeDomain } from '../../src/fixtures/large'

describe('large performance fixture', () => {
  it('builds a reproducible domain with 2,000 objects and 10,000 events', () => {
    const first = buildLargeDomain(71)
    const second = buildLargeDomain(71)

    expect(Object.keys(first.objects)).toHaveLength(2_000)
    expect(first.events).toHaveLength(10_000)
    expect(first.objects).toEqual(second.objects)
    expect(first.events).toEqual(second.events)
    expect(first.indexes).toEqual(second.indexes)
  })
})
