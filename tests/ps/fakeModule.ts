import { vi } from 'vitest'
import { createObject } from '../../src/domain/graph'
import { buildIndexes, findBySamAccountName } from '../../src/domain/indexes'
import type { AttrValue, DomainState, Guid } from '../../src/domain/types'
import { buildBaseDomain, OPERATOR_ID } from '../../src/fixtures/baseDomain'
import type { CmdletSpec } from '../../src/ps/registry'
import { createDefaultRegistry, createRuntime, run as runConsole, type ConsoleResult, type Runtime, type RuntimeOptions } from '../../src/ps/runtime'
import { PsError, getProperty, isObject, type PsObject, type PsValue } from '../../src/ps/values'

/**
 * A test-only module. Active Directory cmdlets arrive in T03.
 * The fake cmdlets read the real fixture state and send real actions through the runtime.
 */
const SAMS = ['mali', 'jdoe', 'sold']

function user(state: DomainState, sam: string): PsObject | undefined {
  const guid = findBySamAccountName(state, sam)
  const object = guid === undefined ? undefined : state.objects[guid]
  if (!object || !SAMS.includes(sam.toLowerCase())) return undefined
  const attrs = object.attrs
  return {
    typeName: 'Fake.User', text: `CN=${object.rdn},DC=corp,DC=local`,
    properties: { Name: String(attrs.displayName), SamAccountName: String(attrs.sAMAccountName), Enabled: attrs.enabled === true, Department: String(attrs.department), LockedOut: attrs.lockedOut === true },
  }
}

export const fakeGet: CmdletSpec = {
  name: 'Fake-Get',
  module: 'Fake',
  aliases: ['fget'],
  parameterSets: [
    { name: 'Identity', parameters: [{ name: 'Identity', type: 'string', position: 0 }, { name: 'Properties', type: 'string[]' }] },
    { name: 'Filter', parameters: [{ name: 'Filter', type: 'string', mandatory: true }, { name: 'Properties', type: 'string[]' }] },
  ],
  defaultParameterSet: 'Identity',
  inputTypes: [],
  outputType: 'Fake.User',
  defaultDisplay: ['Name', 'SamAccountName', 'Enabled'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: { synopsis: 'Returns fake users.', examples: [{ code: 'Fake-Get -Identity mali', explain: 'Returns one fake user.' }, { code: "Fake-Get -Filter '*'", explain: 'Returns every fake user.' }] },
  *run(inv, rt) {
    const identity = inv.params.Identity as string | undefined
    if (identity === undefined) { yield* SAMS.map((sam) => user(rt.state, sam) as PsObject); return }
    const found = user(rt.state, identity)
    if (!found) throw new PsError(`Fake-Get: cannot find an object with identity '${identity}'.`, { identity })
    yield found
  },
}

/** Records what a fake cmdlet sent, after the runtime accepted it. */
type Sent = (action: { type: string; target: string; attrs?: Record<string, AttrValue> }, ctx: { whatIf: boolean }) => void

const fakeSet = (sent: Sent): CmdletSpec => ({
  name: 'Fake-Set',
  module: 'Fake',
  parameterSets: [{
    name: 'Default',
    parameters: [
      { name: 'Identity', type: 'object[]', position: 0, mandatory: true, pipeline: true },
      { name: 'Department', type: 'string', position: 1 },
      { name: 'Path', type: 'string' },
      { name: 'PassThru', type: 'switch' },
      { name: 'Level', type: 'int' },
    ],
  }],
  inputTypes: ['Fake.User', 'System.String'],
  outputType: 'Fake.User',
  supportsWhatIf: true,
  confirmImpact: 'medium',
  help: { synopsis: 'Changes fake users.', examples: [{ code: 'Fake-Set -Identity mali -Department IT -WhatIf', explain: 'Previews a change.' }] },
  *run(inv, rt) {
    const targets: PsValue[] = [...((inv.params.Identity as PsValue[] | undefined) ?? []), ...inv.input]
    for (const target of targets) {
      const identity = isObject(target) ? String(getProperty(target, 'SamAccountName')) : String(target)
      const guid = user(rt.state, identity) ? findBySamAccountName(rt.state, identity) : undefined
      if (guid === undefined) { rt.writeError({ message: `Fake-Set: cannot find an object with identity '${identity}'.`, identity }); continue }
      const attrs = { department: (inv.params.Department as string | undefined) ?? 'Unassigned' }
      const result = rt.dispatch({ type: 'user.setAttrs', target: guid, attrs }, inv)
      sent({ type: 'user.setAttrs', target: identity, attrs }, { whatIf: inv.whatIf })
      if (!result.ok) rt.writeError({ message: `Fake-Set: ${result.message ?? result.error}`, identity })
      else if (inv.whatIf) rt.writeHost(`What if: Performing the operation "Set" on target "${identity}".`)
      else yield user(rt.state, identity) as PsObject
    }
  },
})

const fakeRemove = (sent: Sent): CmdletSpec => ({
  name: 'Fake-Remove',
  module: 'Fake',
  parameterSets: [{ name: 'Default', parameters: [{ name: 'Identity', type: 'string', position: 0, mandatory: true }] }],
  inputTypes: [],
  supportsWhatIf: true,
  confirmImpact: 'high',
  help: { synopsis: 'Marks a fake user as removed.', examples: [{ code: 'Fake-Remove -Identity sold -WhatIf', explain: 'Previews a removal.' }] },
  *run(inv, rt) {
    const identity = inv.params.Identity as string
    const guid = findBySamAccountName(rt.state, identity)
    if (guid === undefined) throw new PsError(`Fake-Remove: cannot find an object with identity '${identity}'.`, { identity })
    rt.dispatch({ type: 'user.setAttrs', target: guid, attrs: { description: 'removed' } }, inv)
    sent({ type: 'user.setAttrs', target: identity }, { whatIf: inv.whatIf })
  },
})

export const SECRET = 'S3cret-Typed-By-Learner!'

function testState(): { state: DomainState; actor: Guid } {
  const base = buildBaseDomain()
  let state = base.state
  const patch = (guid: Guid, attrs: Record<string, AttrValue>) => {
    const object = state.objects[guid]
    const next = { ...state, objects: { ...state.objects, [guid]: { ...object, attrs: { ...object.attrs, ...attrs } } } }
    state = { ...next, indexes: buildIndexes(next) }
  }
  patch(base.ids['user.mali'], { department: 'Finance', lockedOut: true })
  for (const [name, sam, enabled] of [['John Doe', 'jdoe', true], ['Sam Old', 'sold', false]] as const) {
    state = createObject(state, {
      objectClass: 'user', rdn: name, parent: base.ids['ou.finance'], securityPrincipal: true,
      attrs: { displayName: name, sAMAccountName: sam, enabled, lockedOut: false, department: 'Sales', credentialVersion: 1 },
    }).state
  }
  return { state, actor: base.ids[OPERATOR_ID] }
}

const states = new WeakMap<Runtime, DomainState>()

/** The domain state the lab holds for a runtime. */
export const stateOf = (rt: Runtime): DomainState => states.get(rt) as DomainState

/** Runs input the way a host does: pass the current state in, keep the state that comes back. */
export function run(source: string, rt: Runtime): ConsoleResult {
  const result = runConsole(source, rt, stateOf(rt))
  states.set(rt, result.state)
  return result
}

export function lab(overrides: Partial<RuntimeOptions> = {}) {
  const { state, actor } = testState()
  const dispatch = vi.fn<Sent>()
  const registry = createDefaultRegistry().register(fakeGet, fakeSet(dispatch), fakeRemove(dispatch))
  const rt = createRuntime({
    registry, actor,
    readLine: () => 'typed line',
    // The host sees the typed characters, checks policy, and returns the verdict only.
    readSecure: () => ({ policy: SECRET.length >= 12 ? 'pass' : 'fail' }),
    ...overrides,
  })
  states.set(rt, state)
  return { rt, registry, dispatch, initial: state }
}
