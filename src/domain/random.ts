import type { DomainState } from './types'

export function nextRandom(state: DomainState): { state: DomainState; value: number } {
  let value = state.ids.rngState >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  value >>>= 0
  return { state: { ...state, ids: { ...state.ids, rngState: value } }, value: value / 0x1_0000_0000 }
}

export function randomSequence(state: DomainState, count: number): { state: DomainState; values: number[] } {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Count must be a non-negative safe integer')
  let next = state
  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    const generated = nextRandom(next)
    next = generated.state
    values.push(generated.value)
  }
  return { state: next, values }
}
