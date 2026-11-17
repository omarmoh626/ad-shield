import type { CmdletSpec } from '../../registry'
import { PsError } from '../../values'
import { formatLabTime } from '../diagnostics/time'
import { SIM_MODULE } from './common'

const MINUTE = 60_000

export const stepSimClock: CmdletSpec = {
  name: 'Step-SimClock',
  module: SIM_MODULE,
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Minutes', type: 'int', help: 'Minutes to add to the lab clock.' },
      { name: 'Hours', type: 'int', help: 'Hours to add to the lab clock.' },
      { name: 'Days', type: 'int', help: 'Days to add to the lab clock.' },
    ],
  }],
  inputTypes: [],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Advances the simulated lab clock. Use it to let a session expire. Records a simulator event, not a Windows event.',
    examples: [
      { code: 'Step-SimClock -Hours 1', explain: 'Moves the lab clock forward one hour.' },
      { code: 'Step-SimClock -Days 1 -Minutes 30', explain: 'Moves the lab clock forward one day and thirty minutes. A ten-hour session has then expired.' },
    ],
  },
  *run(inv, rt) {
    const parts = [['Minutes', 1], ['Hours', 60], ['Days', 1440]] as const
    let minutes = 0
    for (const [name, factor] of parts) {
      const value = inv.params[name]
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new PsError(`Step-SimClock: -${name} must be a whole number of zero or more.`, { help: 'Get-Help Step-SimClock -Examples' })
      minutes += value * factor
    }
    if (minutes <= 0) throw new PsError('Step-SimClock: give -Minutes, -Hours, or -Days with a value above zero. The lab clock only moves forward.', { help: 'Get-Help Step-SimClock -Examples' })
    const before = rt.state.now
    const result = rt.dispatch({ type: 'clock.advance', milliseconds: minutes * MINUTE }, inv)
    if (!result.ok) throw new PsError(`Step-SimClock: ${result.message ?? 'the lab clock did not move.'}`)
    yield `The simulated lab clock moved from ${formatLabTime(before)} to ${formatLabTime(rt.state.now)}.`
  },
}
