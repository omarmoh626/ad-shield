import type { DomainState } from './types'

export function advanceClock(state: DomainState, milliseconds: number): DomainState {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('Clock advance must be a non-negative safe integer')
  return { ...state, now: state.now + milliseconds }
}
