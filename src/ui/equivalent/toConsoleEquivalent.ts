import { deriveDn } from '../../domain/dn'
import type { AttrValue, DomainState, Guid } from '../../domain/types'
import type { Action } from '../../engine/types'
import { parametersOf, type CmdletSpec, type Registry } from '../../ps/registry'
import { createDefaultRegistry } from '../../ps/runtime'
import { RIGHT_NAMES } from '../../ps/cmdlets/sim/common'

/**
 * Console equivalents for GUI actions (T07 contract). One generator serves every editor:
 * each action type names a cmdlet and its arguments, and the registry supplies the canonical
 * parameter names, their types (which decide the formatting), attribute mappings, and whether
 * the cmdlet needs `-Confirm:$false`. An argument the registry does not know is an error,
 * so a renamed cmdlet or parameter breaks the parity tests instead of printing a wrong command.
 */

type Arg =
  | { name: string; kind: 'value'; value: AttrValue }
  | { name: string; kind: 'identity'; guid: Guid }
  | { name: string; kind: 'secure'; prompt: string }
  | { name: string; kind: 'switch' }
  | { name: string; kind: 'hashtable'; entries: [string, AttrValue][] }

interface Plan { cmdlet: string; args: Arg[] }

const registry: Registry = createDefaultRegistry()
const SECURE_VARIABLE = '$pw'
const MINUTE = 60_000

/** PowerShell single-quoted text, or a bare word when that parses the same. */
export function quote(text: string): string {
  return /^[A-Za-z0-9._@-]+$/.test(text) && !/^[-@]/.test(text) && !/^\d/.test(text) ? text : `'${text.replace(/'/g, "''")}'`
}

function literal(value: AttrValue): string {
  if (value === null) return '$null'
  if (typeof value === 'boolean') return value ? '$true' : '$false'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `@(${value.map((item) => `'${item.replace(/'/g, "''")}'`).join(', ')})`
  return `'${value.replace(/'/g, "''")}'`
}

/** sAMAccountName when the object has one; otherwise its distinguished name. Both are identities the console resolves. */
export function identityOf(state: DomainState, guid: Guid): string {
  const sam = state.objects[guid]?.attrs.sAMAccountName
  return typeof sam === 'string' && sam ? sam : deriveDn(state, guid)
}

function spec(name: string): CmdletSpec {
  const found = registry.resolve(name)
  if (!found) throw new Error(`Console equivalent: ${name} is not in the cmdlet registry.`)
  return found
}

/**
 * Splits attributes into named parameters (by the registry's `attribute` mapping), in the
 * registry's parameter order, and the rest, in their own order.
 */
function attributeArgs(cmdlet: string, attrs: Record<string, AttrValue>): { named: Arg[]; rest: [string, AttrValue][] } {
  const params = parametersOf(spec(cmdlet))
  const named: Arg[] = []
  const used = new Set<string>()
  for (const param of params) {
    if (!param.attribute || !(param.attribute in attrs)) continue
    const value = attrs[param.attribute]!
    const fits = (param.type === 'string' && typeof value === 'string') || (param.type === 'bool' && typeof value === 'boolean')
    if (!fits) continue
    named.push({ name: param.name, kind: 'value', value })
    used.add(param.attribute)
  }
  const rest = Object.entries(attrs).filter(([key]) => !used.has(key))
  return { named, rest }
}

/**
 * Attributes in the order the console binds them: named parameters in registry order, then the
 * rest. GUI editors build `user.setAttrs` and `user.create` with this order, so event 4738 lists
 * the attributes the same way from both routes.
 */
export function canonicalAttrs(cmdlet: 'Set-ADUser' | 'New-ADUser', attrs: Record<string, AttrValue>): Record<string, AttrValue> {
  const params = parametersOf(spec(cmdlet))
  const out: Record<string, AttrValue> = {}
  for (const param of params) if (param.attribute && param.attribute in attrs) out[param.attribute] = attrs[param.attribute]!
  for (const [key, value] of Object.entries(attrs)) if (!(key in out)) out[key] = value
  return out
}

function planFor(action: Action, state: DomainState): Plan | undefined {
  switch (action.type) {
    case 'user.unlock': return { cmdlet: 'Unlock-ADAccount', args: [{ name: 'Identity', kind: 'identity', guid: action.target }] }
    case 'user.setEnabled': return { cmdlet: action.enabled ? 'Enable-ADAccount' : 'Disable-ADAccount', args: [{ name: 'Identity', kind: 'identity', guid: action.target }] }
    case 'user.setAttrs': {
      const { named, rest } = attributeArgs('Set-ADUser', action.attrs)
      return { cmdlet: 'Set-ADUser', args: [{ name: 'Identity', kind: 'identity', guid: action.target }, ...named, ...(rest.length ? [{ name: 'Replace', kind: 'hashtable' as const, entries: rest }] : [])] }
    }
    case 'user.resetPassword': return { cmdlet: 'Set-ADAccountPassword', args: [{ name: 'Identity', kind: 'identity', guid: action.target }, { name: 'Reset', kind: 'switch' }, { name: 'NewPassword', kind: 'secure', prompt: 'New password (simulated)' }] }
    case 'user.create': {
      const { named, rest } = attributeArgs('New-ADUser', action.attrs ?? {})
      if (rest.length) return undefined
      return { cmdlet: 'New-ADUser', args: [
        { name: 'Name', kind: 'value', value: action.name },
        { name: 'SamAccountName', kind: 'value', value: action.samAccountName },
        ...named,
        ...(action.parent ? [{ name: 'Path', kind: 'value' as const, value: deriveDn(state, action.parent) }] : []),
        ...(action.credential ? [{ name: 'AccountPassword', kind: 'secure' as const, prompt: 'Initial password (simulated)' }] : []),
        ...(action.enabled === undefined ? [] : [{ name: 'Enabled', kind: 'value' as const, value: action.enabled }]),
      ] }
    }
    case 'object.move': return { cmdlet: 'Move-ADObject', args: [{ name: 'Identity', kind: 'identity', guid: action.target }, { name: 'TargetPath', kind: 'value', value: deriveDn(state, action.newParent) }] }
    case 'group.addMember':
    case 'group.removeMember':
      return { cmdlet: action.type === 'group.addMember' ? 'Add-ADGroupMember' : 'Remove-ADGroupMember', args: [{ name: 'Identity', kind: 'identity', guid: action.group }, { name: 'Members', kind: 'identity', guid: action.member }] }
    case 'acl.addEntry':
    case 'acl.removeEntry': {
      const share = state.resources[action.resource]
      const name = typeof share?.name === 'string' ? share.name : action.resource
      const layer = action.layer && action.layer !== 'both' ? [{ name: 'Layer', kind: 'value' as const, value: action.layer === 'share' ? 'Share' : 'File' }] : []
      return { cmdlet: action.type === 'acl.addEntry' ? 'Add-SimResourcePermission' : 'Remove-SimResourcePermission', args: [
        { name: 'Resource', kind: 'value', value: name },
        { name: 'Identity', kind: 'identity', guid: action.trustee },
        { name: 'Right', kind: 'value', value: RIGHT_NAMES[action.right] },
        ...layer,
      ] }
    }
    case 'session.signIn': {
      const host = state.objects[action.host]
      return { cmdlet: 'Test-SimSignIn', args: [
        { name: 'Identity', kind: 'identity', guid: action.user },
        { name: 'ComputerName', kind: 'value', value: host?.rdn ?? identityOf(state, action.host) },
        ...(action.badPassword ? [{ name: 'SimulateBadPassword', kind: 'switch' as const }] : []),
      ] }
    }
    case 'clock.advance':
      return action.milliseconds % MINUTE === 0 ? { cmdlet: 'Step-SimClock', args: [{ name: 'Minutes', kind: 'value', value: action.milliseconds / MINUTE }] } : undefined
    case 'session.end': return undefined
  }
}

function render(plan: Plan, state: DomainState): string {
  const cmdlet = spec(plan.cmdlet)
  const params = parametersOf(cmdlet)
  const prefix: string[] = []
  const parts = [cmdlet.name]
  for (const arg of plan.args) {
    const param = params.find((candidate) => candidate.name.toLowerCase() === arg.name.toLowerCase())
    if (!param) throw new Error(`Console equivalent: ${cmdlet.name} has no -${arg.name} parameter in the registry.`)
    const flag = `-${param.name}`
    switch (arg.kind) {
      case 'switch': parts.push(flag); break
      case 'identity': parts.push(flag, quote(identityOf(state, arg.guid))); break
      case 'secure':
        if (param.type !== 'secure') throw new Error(`Console equivalent: -${param.name} is not a secure parameter.`)
        prefix.push(`${SECURE_VARIABLE} = ${spec('Read-Host').name} -Prompt ${quote(arg.prompt)} -AsSecureString`)
        parts.push(flag, SECURE_VARIABLE)
        break
      case 'hashtable': parts.push(flag, `@{ ${arg.entries.map(([key, value]) => `${key} = ${literal(value)}`).join('; ')} }`); break
      case 'value':
        if (param.type === 'bool' || param.type === 'int' || typeof arg.value !== 'string') parts.push(flag, literal(arg.value))
        else parts.push(flag, quote(arg.value))
        break
    }
  }
  // The registry says which cmdlets prompt by default (confirmImpact high); the GUI already confirmed.
  if (cmdlet.confirmImpact === 'high' && params.some((param) => param.name === 'Confirm')) parts.push('-Confirm:$false')
  return [...prefix, parts.join(' ')].join('; ')
}

/**
 * The console command that, run on `state` (the state the GUI action ran against), makes the
 * same change. For an action no Tier 1 cmdlet can express, it returns a PowerShell comment
 * that says so (docs/SUPPORT.md); no GUI editor produces such an action.
 */
export function toConsoleEquivalent(action: Action, state: DomainState): string {
  const plan = planFor(action, state)
  return plan ? render(plan, state) : `# No console command in this lab makes this ${action.type} change (simulated).`
}
