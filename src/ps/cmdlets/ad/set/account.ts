import type { Guid } from '../../../../domain/types'
import type { Action } from '../../../../engine/types'
import type { CmdletSpec, Invocation } from '../../../registry'
import type { Runtime } from '../../../runtime'
import { PsError, isSecure, type PsSecure, type PsValue } from '../../../values'
import { ACCOUNT_CLASSES, AD_INPUT, OBJECT, apply, dnOf, identityLabel, passThru, passThruValue, resolveTarget, targetsOf } from './common'

const identityParam = { name: 'Identity', type: 'object' as const, position: 0, mandatory: true, pipeline: true, help: 'sAMAccountName, distinguished name, GUID, or SID of the account. Accepts pipeline input from Get-ADUser and Search-ADAccount.' }

/** Runs one account action per target. A bad record is reported with its identity and the pipeline continues. */
function* eachAccount(inv: Invocation, rt: Runtime, build: (guid: Guid) => Action, operation: string): Generator<PsValue> {
  for (const value of targetsOf(inv)) {
    const identity = identityLabel(value)
    const target = resolveTarget(rt.state, value, ACCOUNT_CLASSES)
    if (!('guid' in target)) { rt.writeError({ message: `${inv.spec.name}: ${target.message}`, identity }); continue }
    const result = apply(rt, inv, build(target.guid), operation, dnOf(rt.state, target.guid), identity)
    if (result && !inv.whatIf && inv.params.PassThru === true) yield passThruValue(rt, target.guid)
  }
}

function accountCmdlet(name: string, synopsis: string, examples: { code: string; explain: string }[], build: (guid: Guid) => Action): CmdletSpec {
  return {
    name,
    module: 'ActiveDirectory',
    parameterSets: [{ name: 'Identity', parameters: [identityParam, passThru] }],
    inputTypes: AD_INPUT,
    outputType: OBJECT,
    supportsWhatIf: true,
    confirmImpact: 'medium',
    help: { synopsis, examples },
    *run(inv, rt) { yield* eachAccount(inv, rt, build, 'Set') },
  }
}

export const unlockAccount = accountCmdlet(
  'Unlock-ADAccount',
  'Unlocks a locked simulated account. A successful unlock prints nothing and records event 4767.',
  [
    { code: 'Unlock-ADAccount -Identity mali -WhatIf', explain: 'Previews the unlock. Maya stays locked.' },
    { code: 'Unlock-ADAccount -Identity mali', explain: 'Unlocks the simulated account. No output means success.' },
    { code: 'Search-ADAccount -LockedOut -UsersOnly | Unlock-ADAccount -PassThru', explain: 'Unlocks every locked simulated user and returns each one.' },
  ],
  (guid) => ({ type: 'user.unlock', target: guid }),
)

export const enableAccount = accountCmdlet(
  'Enable-ADAccount',
  'Enables a simulated account that has a valid simulated credential. Records event 4722.',
  [
    { code: 'Enable-ADAccount -Identity kmorita -WhatIf', explain: 'Previews enabling the account.' },
    { code: 'Get-ADUser -Identity kmorita | Enable-ADAccount -PassThru', explain: 'Enables the account from the pipeline and returns it.' },
  ],
  (guid) => ({ type: 'user.setEnabled', target: guid, enabled: true }),
)

export const disableAccount = accountCmdlet(
  'Disable-ADAccount',
  'Disables a simulated account. Records event 4725.',
  [
    { code: 'Disable-ADAccount -Identity kmorita -WhatIf', explain: 'Previews disabling the account.' },
    { code: "Get-ADUser -Filter \"Department -eq 'Finance'\" | Disable-ADAccount", explain: 'Disables every simulated Finance user. A record that fails is reported by identity; the others still change.' },
  ],
  (guid) => ({ type: 'user.setEnabled', target: guid, enabled: false }),
)

export const setAccountPassword: CmdletSpec = {
  name: 'Set-ADAccountPassword',
  module: 'ActiveDirectory',
  parameterSets: [{
    name: 'Identity',
    parameters: [
      identityParam,
      { name: 'NewPassword', type: 'secure', help: 'A secure string from Read-Host -AsSecureString. Without it, the console asks for a masked simulated password.' },
      { name: 'Reset', type: 'switch', help: 'Resets the password as an administrator. Required in this lab.' },
      { name: 'OldPassword', type: 'secure', help: 'Not modeled in this lab. Use -Reset.' },
      passThru,
    ],
  }],
  inputTypes: AD_INPUT,
  outputType: OBJECT,
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: {
    synopsis: 'Resets the simulated password of an account. The lab keeps a credential version only, never the password. Records event 4724.',
    examples: [
      { code: "$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity pnair -Reset -NewPassword $pw", explain: 'Asks for a masked simulated password, checks it against the lab policy, and resets the account.' },
      { code: "Set-ADAccountPassword -Identity pnair -Reset -WhatIf", explain: 'Previews the reset without asking for a password.' },
    ],
  },
  *run(inv, rt) {
    if (inv.params.OldPassword !== undefined || inv.params.Reset !== true) {
      throw new PsError('Set-ADAccountPassword: this lab models administrator resets only. Add -Reset. Nothing was changed.', { help: 'Get-Help Set-ADAccountPassword -Examples' })
    }
    let secure: PsSecure | undefined = isSecure(inv.params.NewPassword) ? inv.params.NewPassword : undefined
    for (const value of targetsOf(inv)) {
      const identity = identityLabel(value)
      const target = resolveTarget(rt.state, value, ACCOUNT_CLASSES)
      if (!('guid' in target)) { rt.writeError({ message: `Set-ADAccountPassword: ${target.message}`, identity }); continue }
      // A preview never asks for a password. A real reset asks once when -NewPassword was not given.
      if (!inv.whatIf && !secure) secure = rt.readSecure(`Password for '${identity}' (simulated, masked, not stored)`)
      // A preview checks the target and rights only, so it carries a passing placeholder verdict.
      const credential = { policy: inv.whatIf || secure?.credential.policy === 'pass' ? 'pass' as const : 'fail' as const }
      const result = apply(rt, inv, { type: 'user.resetPassword', target: target.guid, credential }, 'Set-ADAccountPassword', dnOf(rt.state, target.guid), identity)
      if (result && !inv.whatIf && inv.params.PassThru === true) yield passThruValue(rt, target.guid)
    }
  },
}

export const accountCmdlets: CmdletSpec[] = [unlockAccount, enableAccount, disableAccount, setAccountPassword]
