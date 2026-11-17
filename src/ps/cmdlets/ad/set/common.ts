import { deriveDn, escapeRdn } from '../../../../domain/dn'
import type { DirObject, DomainState, Guid, ObjectClass } from '../../../../domain/types'
import type { Action, ActionResult } from '../../../../engine/types'
import type { Invocation, ParameterSpec } from '../../../registry'
import type { Runtime } from '../../../runtime'
import { getProperty, isObject, toText, type PsValue } from '../../../values'
import { GROUP, MEMBER, OBJECT, USER, adValue } from '../get'
import { resolveIdentity } from '../identity'

export { GROUP, MEMBER, OBJECT, USER }

export const ACCOUNT_CLASSES: ObjectClass[] = ['user', 'computer']
export const PRINCIPAL_CLASSES: ObjectClass[] = ['user', 'computer', 'group']
export const CONTAINER_CLASSES: ObjectClass[] = ['domain', 'organizationalUnit', 'container']
export const ANY_CLASS: ObjectClass[] = ['user', 'computer', 'group', 'organizationalUnit', 'container', 'domain']

/**
 * Pipeline types a write cmdlet accepts for -Identity. Strings are names or distinguished names.
 * `Selected.*` objects come from Select-Object and bind by their DistinguishedName or SamAccountName.
 */
export const AD_INPUT = [USER, GROUP, OBJECT, MEMBER].flatMap((type) => [type, `Selected.${type}`]).concat('System.String')

export const passThru: ParameterSpec = { name: 'PassThru', type: 'switch', help: 'Returns the changed object. Without it, a successful change prints nothing.' }

/** The text a learner would recognize for one -Identity value, for error messages. */
export function identityLabel(value: PsValue): string {
  if (isObject(value)) {
    const dn = getProperty(value, 'DistinguishedName')
    if (typeof dn === 'string' && dn) return dn
    const sam = getProperty(value, 'SamAccountName')
    if (typeof sam === 'string' && sam) return sam
  }
  return toText(value)
}

/**
 * Turns one -Identity value or pipeline item into a GUID through the P1 resolver.
 * An AD object from Get-AD* carries `ref`; an object without it (for example from
 * Select-Object) falls back to its DistinguishedName or SamAccountName property.
 */
export function resolveTarget(state: DomainState, value: PsValue, classes: ObjectClass[]): { guid: Guid } | { message: string } {
  let key: unknown = value
  if (isObject(value)) {
    const ref = (value as { ref?: unknown }).ref
    key = typeof ref === 'string' && ref ? ref : identityLabel(value)
  }
  const found = resolveIdentity(state, key, classes)
  return typeof found === 'string' ? { guid: found } : { message: found.error.message }
}

/** Every -Identity value plus every pipeline item, in order. */
export function targetsOf(inv: Invocation, name = 'Identity'): PsValue[] {
  const given = inv.params[name]
  const named = given === undefined ? [] : Array.isArray(given) ? given : [given]
  return [...named, ...inv.input]
}

export const dnOf = (state: DomainState, guid: Guid): string => deriveDn(state, guid)

export function childDn(state: DomainState, parent: Guid, name: string): string {
  return `CN=${escapeRdn(name)},${deriveDn(state, parent)}`
}

/** The default users container of the domain, `CN=Users,<domain DN>`. */
export function usersContainer(state: DomainState): DirObject | undefined {
  const root = Object.values(state.objects).find((o) => o.objectClass === 'domain' && o.parent === null)
  if (!root) return undefined
  return Object.values(state.objects).find((o) => o.parent === root.guid && o.objectClass === 'container' && o.rdn.toLowerCase() === 'users')
}

/**
 * Sends one action through the runtime and reports the outcome the way the real cmdlet does.
 * - A failure is written as an error that names the identity; the pipeline goes on.
 * - With -WhatIf, the preview prints a "What if" line and nothing changes.
 * - A partial result (for example a rejected simulated password) is written as an error
 *   even though the object was committed.
 * Returns the result when the action was accepted (committed or previewed).
 */
export function apply(rt: Runtime, inv: Invocation, action: Action, operation: string, targetDn: string, identity: string): ActionResult | undefined {
  const result = rt.dispatch(action, inv)
  if (!result.ok) {
    rt.writeError({ message: `${inv.spec.name}: ${result.message ?? `the action failed (${result.error ?? 'unknown'}).`} Identity: '${identity}'. Nothing was changed for this object.`, identity })
    return undefined
  }
  if (inv.whatIf) {
    rt.writeHost(`What if: Performing the operation "${operation}" on target "${targetDn}". (simulated preview; nothing changed)`)
    return result
  }
  for (const warning of result.warnings) {
    if (warning.code === 'passwordRejected' || warning.code === 'notEnabled') rt.writeError({ message: `${inv.spec.name}: ${warning.message} Identity: '${identity}'.`, identity })
    else if (warning.code === 'notPermissionBearing') rt.writeHost(`WARNING: ${warning.message}`)
  }
  return result
}

/** The AD object to return for -PassThru, read from the state after the change. */
export function passThruValue(rt: Runtime, guid: Guid): PsValue {
  const object = rt.state.objects[guid]
  const type = object.objectClass === 'user' ? USER : object.objectClass === 'group' ? GROUP : OBJECT
  return adValue(rt.state, object, type)
}
