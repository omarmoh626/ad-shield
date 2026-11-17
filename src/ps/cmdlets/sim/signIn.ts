import type { CmdletSpec } from '../../registry'
import { PsError, type PsValue } from '../../values'
import { identityLabel, resolveTarget } from '../ad/set/common'
import { formatLabTime } from '../diagnostics/time'
import { SIM_MODULE, labelOf, resolveComputer } from './common'

export const SIGN_IN_RESULT = 'ADShield.Sim.SignInResult'

export const testSimSignIn: CmdletSpec = {
  name: 'Test-SimSignIn',
  module: SIM_MODULE,
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Identity', type: 'object', position: 0, mandatory: true, help: 'sAMAccountName, distinguished name, GUID, or SID of the user who signs in.' },
      { name: 'ComputerName', type: 'string', position: 1, mandatory: true, help: 'The simulated computer the user signs in at, for example PHARM-WS01.' },
      { name: 'SimulateBadPassword', type: 'switch', help: 'Simulates a mistyped password. No password is typed or stored.' },
    ],
  }],
  inputTypes: [],
  outputType: SIGN_IN_RESULT,
  defaultDisplay: ['User', 'Computer', 'Result', 'SessionId', 'Reason', 'Events', 'Note'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Simulates a fresh domain sign-in. The domain controller checks the account. A success issues a session that keeps the security context of this moment. Records 4624 or 4625 on the computer, and 4740 on the domain controller when the account locks.',
    examples: [
      { code: 'Test-SimSignIn -Identity pnair -ComputerName PHARM-WS01', explain: 'Signs Priya in at her workstation and returns the new simulated session.' },
      { code: 'Test-SimSignIn -Identity pnair -ComputerName PHARM-WS01 -SimulateBadPassword', explain: 'Simulates a mistyped password. Five in a row lock the account.' },
      { code: '$s = Test-SimSignIn pnair PHARM-WS01; $s.SessionId', explain: 'Keeps the session ID to test access with this session later.' },
    ],
  },
  *run(inv, rt) {
    const identity = identityLabel(inv.params.Identity)
    const target = resolveTarget(rt.state, inv.params.Identity, ['user'])
    if (!('guid' in target)) throw new PsError(`Test-SimSignIn: ${target.message}`, { identity })
    const computer = resolveComputer(rt.state, inv.params.ComputerName)
    const result = rt.dispatch({ type: 'session.signIn', user: target.guid, host: computer.guid, badPassword: inv.params.SimulateBadPassword === true }, inv)
    if (!result.ok) throw new PsError(`Test-SimSignIn: ${result.message ?? 'the simulated sign-in could not run.'} Nothing was changed.`, { identity })
    const failed = result.warnings.find((warning) => warning.code === 'signInFailed')
    const session = result.diff.find((change) => change.kind === 'session' && change.key === 'signIn')
    const value: PsValue = {
      typeName: SIGN_IN_RESULT,
      properties: {
        User: labelOf(rt.state, target.guid),
        Computer: computer.rdn,
        Result: failed ? 'Failure' : 'Success',
        SessionId: failed ? null : String(session?.after ?? ''),
        Reason: failed ? failed.message : `Signed in at ${formatLabTime(rt.state.now)}. The session keeps the group memberships of this moment.`,
        Events: result.events.map((event) => `${event.eventId} on ${event.host}`),
        Note: 'simulated sign-in; no real credential or system was used',
      },
    }
    yield value
  },
}
