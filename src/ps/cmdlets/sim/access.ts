import { checkSignIn, findSession, sessionStatus } from '../../../access/sessions'
import { buildContext } from '../../../access/token'
import { evaluateAccess } from '../../../access/trace'
import type { AccessLayerTrace, AccessTrace, Right, SecurityContext } from '../../../access/types'
import type { DomainState, Guid } from '../../../domain/types'
import type { CmdletSpec } from '../../registry'
import { PsError, type PsValue } from '../../values'
import { identityLabel, resolveTarget } from '../ad/set/common'
import { formatLabTime } from '../diagnostics/time'
import { RIGHT_NAMES, RIGHT_VALUES, SIM_MODULE, labelOf, parseRight, resolveShare, sessionIdOf } from './common'

export const ACCESS_CHECK = 'ADShield.Sim.AccessCheck'
const HELP = 'Get-Help Test-SimResourceAccess -Examples'

const layerName = (layer: AccessLayerTrace): string => layer.layer === 'share' ? 'Share' : 'File'

function entryLines(state: DomainState, layer: AccessLayerTrace): string[] {
  return layer.entries.map((entry, index) => {
    const kind = entry.inherited ? 'inherited' : 'explicit'
    const verdict = entry.applies ? 'applies' : 'does not apply'
    return `${layerName(layer)} ${index + 1}: ${entry.effect === 'allow' ? 'Allow' : 'Deny'} ${RIGHT_NAMES[entry.right]} ${labelOf(state, entry.trustee)} (${kind}) - ${verdict}`
  })
}

function layerSummary(state: DomainState, layer: AccessLayerTrace, right: Right): string {
  const deciding = layer.entries.find((entry) => entry.applies)
  if (!deciding) return `Denied: no entry grants ${RIGHT_NAMES[right]} to this user or its groups`
  const verb = deciding.effect === 'allow' ? 'Allowed' : 'Denied'
  return `${verb} by ${deciding.inherited ? 'inherited' : 'explicit'} ${deciding.effect} ${RIGHT_NAMES[deciding.right]} for ${labelOf(state, deciding.trustee)}`
}

function reasonOf(state: DomainState, trace: AccessTrace, right: Right): string {
  if (trace.allowed) {
    const through = trace.via === 'both' ? 'both a role group and a direct user entry' : trace.via === 'direct' ? 'a direct user entry' : 'a role group path'
    return `Both layers allow ${RIGHT_NAMES[right]}. Access comes through ${through}.`
  }
  const denied = trace.layers.filter((layer) => !layer.allowed).map((layer) => `${layerName(layer)} layer: ${layerSummary(state, layer, right)}.`)
  return `Access is denied. Both layers must allow. ${denied.join(' ')}`
}

function output(state: DomainState, user: Guid, resourceName: string, right: Right, basis: string, trace: AccessTrace | undefined, reason: string): PsValue {
  const layer = (name: 'share' | 'file') => {
    const found = trace?.layers.find((item) => item.layer === name)
    return found ? layerSummary(state, found, right) : 'not evaluated'
  }
  return {
    typeName: ACCESS_CHECK,
    properties: {
      User: labelOf(state, user),
      Resource: resourceName,
      Right: RIGHT_NAMES[right],
      Allowed: trace?.allowed ?? false,
      Via: trace?.via ?? 'none',
      Basis: basis,
      ShareLayer: layer('share'),
      FileLayer: layer('file'),
      Paths: (trace?.paths ?? []).map((path) => path.path.map((guid) => labelOf(state, guid)).join(' > ')),
      Entries: (trace?.layers ?? []).flatMap((item) => entryLines(state, item)),
      Reason: reason,
    },
  }
}

/**
 * Read-only. It builds a security context and evaluates it, and it never
 * dispatches an action. So it records no event, issues no session, and awards nothing.
 */
export const testSimResourceAccess: CmdletSpec = {
  name: 'Test-SimResourceAccess',
  module: SIM_MODULE,
  parameterSets: [
    {
      name: 'FreshSignIn',
      parameters: [
        { name: 'Identity', type: 'object', position: 0, mandatory: true, help: 'The user to test. The check uses a fresh simulated sign-in built from current group memberships.' },
        { name: 'Resource', type: 'string', position: 1, mandatory: true, help: 'The simulated share: Pharmacy or Finance, its ID, or its UNC path.' },
        { name: 'Right', type: 'string', position: 2, values: RIGHT_VALUES, help: 'The requested right. Defaults to Read.' },
      ],
    },
    {
      name: 'Session',
      parameters: [
        { name: 'Session', type: 'object', mandatory: true, help: 'An issued session ID such as sess-1, or the output of Test-SimSignIn. The check uses the snapshot taken at sign-in.' },
        { name: 'Resource', type: 'string', position: 0, mandatory: true, help: 'The simulated share: Pharmacy or Finance, its ID, or its UNC path.' },
        { name: 'Right', type: 'string', position: 1, values: RIGHT_VALUES, help: 'The requested right. Defaults to Read.' },
      ],
    },
  ],
  inputTypes: [],
  outputType: ACCESS_CHECK,
  defaultDisplay: ['User', 'Resource', 'Right', 'Allowed', 'Via', 'Basis', 'ShareLayer', 'FileLayer', 'Paths', 'Entries', 'Reason'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Explains whether a user can use a simulated share, and why. Shows the membership path, the entries of each layer in evaluation order, and the result. Read-only: it changes nothing and records no event.',
    examples: [
      { code: 'Test-SimResourceAccess -Identity pnair -Resource Pharmacy', explain: 'Tests Read for a fresh simulated sign-in built from current memberships.' },
      { code: 'Test-SimResourceAccess -Identity pnair -Resource Pharmacy -Right Modify', explain: 'Tests Modify. Priya reads through DL-Pharmacy-Share-Read but has no Modify entry.' },
      { code: '$s = Test-SimSignIn pnair PHARM-WS01; Test-SimResourceAccess -Session $s -Resource Pharmacy', explain: 'Tests an already-issued session. It uses the memberships of sign-in time, not current ones.' },
    ],
  },
  *run(inv, rt) {
    const state = rt.state
    const share = resolveShare(state, inv.params.Resource)
    const right = parseRight(inv.params.Right)
    let user: Guid
    let context: SecurityContext
    let basis: string

    if (inv.params.Session !== undefined) {
      const id = sessionIdOf(inv.params.Session)
      const session = findSession(state, id)
      if (!session) throw new PsError(`Test-SimResourceAccess: no simulated session '${id}' exists. Start one with Test-SimSignIn.`, { help: HELP })
      const status = sessionStatus(session, state.now)
      if (status !== 'active') throw new PsError(`Test-SimResourceAccess: the simulated session ${session.id} has ${status === 'ended' ? 'ended' : 'expired'}. Sign in again with Test-SimSignIn.`, { help: HELP })
      user = session.user
      context = session.context
      basis = `existing session ${session.id} issued ${formatLabTime(session.issuedAt)} at ${labelOf(state, session.host)} (simulated; memberships as of sign-in)`
    } else {
      const identity = identityLabel(inv.params.Identity)
      const target = resolveTarget(state, inv.params.Identity, ['user'])
      if (!('guid' in target)) throw new PsError(`Test-SimResourceAccess: ${target.message}`, { identity })
      user = target.guid
      const check = checkSignIn(state.objects[user])
      if (!check.ok) {
        yield output(state, user, share.name, right, 'fresh sign-in (simulated)', undefined, `A fresh sign-in would fail: ${check.reason} No access check ran.`)
        return
      }
      context = buildContext(state, user)
      basis = 'fresh sign-in (simulated; memberships as of now)'
    }

    const trace = evaluateAccess(state, context, share.id, right)
    yield output(state, user, share.name, right, basis, trace, reasonOf(state, trace, right))
  },
}
