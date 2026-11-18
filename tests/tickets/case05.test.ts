import { describe, expect, it } from 'vitest'
import { case05 } from '../../src/tickets/cases/case05'
import { runGuiRoute, runScriptRoute } from '../../src/tickets/routes'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'

const status = (result: { predicates: { id: string; status: string }[] }, id: string) => result.predicates.find((item) => item.id === id)?.status

describe('case 05: contractor offboarding', () => {
  for (const seed of case05.seeds) {
    describe(`seed ${seed}`, () => {
      it('script route closes with retained account history and denied sign-in evidence', () => {
        const fixture = case05.build(seed)
        const result = runScriptRoute(fixture, undefined, undefined, seed)
        expect(result.closed).toBe(true)
        expect(status(result, 'disabled')).toBe('met')
        expect(status(result, 'approvedAccess')).toBe('met')
        expect(status(result, 'signin')).toBe('met')
        expect(status(result, 'failedSignInEvent')).toBe('met')
        expect(status(result, 'primaryGroup')).toBe('met')
        expect(status(result, 'history')).toBe('met')
        expect(status(result, 'control')).toBe('met')
        expect(result.state.events.some((event) => event.eventId === 4625 && event.host === 'DC01.corp.contoso.local' && event.target === fixture.ids.target)).toBe(true)
      })

      it('Directory route uses actual tree, properties, menus, and confirmation labels', () => {
        const fixture = case05.build(seed)
        const result = runGuiRoute(fixture, undefined, seed)
        expect(result.closed).toBe(true)
        expect(result.history.every((entry) => entry.source === 'gui')).toBe(true)
        expect(fixture.routes.gui[0]!.path).toEqual(['Directory', 'Pharmacy', fixture.request.who.person, 'Properties', 'Groups', 'Remove from GG-Pharmacy-Staff', 'Apply'])
        expect(fixture.routes.gui[1]!.path).toEqual(['Directory', 'Pharmacy', fixture.request.who.person, 'Actions', 'Disable account…', 'Apply'])
        expect(fixture.routes.gui[2]!.path).toEqual(['What done looks like', `Test ${fixture.request.who.person.split(' ')[0]}'s sign-in · simulated`])
      })

      it('disable-only fix leaves approved access assigned', () => {
        const fixture = case05.build(seed)
        const result = runScriptRoute(fixture, fixture.wrongFixes[0]!.steps, undefined, seed)
        expect(result.closed).toBe(false)
        for (const id of fixture.wrongFixes[0]!.expectUnmet) expect(status(result, id)).toBe('unmet')
      })

      it('unapproved removal does not satisfy approved access removal', () => {
        const fixture = case05.build(seed)
        const result = runScriptRoute(fixture, fixture.wrongFixes[1]!.steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'approvedAccess')).toBe('unmet')
        expect(status(result, 'unapprovedAccess')).toBe('unmet')
      })

      it('removing every group cannot pass by removing a non-approved group', () => {
        const fixture = case05.build(seed)
        const sam = fixture.request.who.account
        const result = runScriptRoute(fixture, [
          { code: `Remove-ADGroupMember -Identity GG-Pharmacy-Managers -Members ${sam} -Confirm:$false`, explain: 'Removes a group absent from the approved list.' },
          { code: `Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members ${sam} -Confirm:$false`, explain: 'Also removes approved access.' },
          { code: `Disable-ADAccount -Identity ${sam}`, explain: 'Disables the target.' },
        ], undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'approvedAccess')).toBe('met')
        expect(status(result, 'unapprovedAccess')).toBe('unmet')
      })

      it('similar-contractor fix fails target outcome and control', () => {
        const fixture = case05.build(seed)
        const result = runScriptRoute(fixture, fixture.wrongFixes[2]!.steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'disabled')).toBe('unmet')
        expect(status(result, 'control')).toBe('unmet')
      })

      it('disables before removing approved access and still closes', () => {
        const fixture = case05.build(seed)
        const ordered = [...fixture.routes.script.slice(0, 2), fixture.routes.script[3]!, fixture.routes.script[2]!, ...fixture.routes.script.slice(4)]
        const result = runScriptRoute(fixture, ordered, undefined, seed)
        expect(result.closed).toBe(true)
      })

      it('derives target IDs and request from seeded fixture; hints include both routes', () => {
        const fixture = case05.build(seed)
        const introduced = fixture.introduce(buildBaseDomain().state)
        expect(introduced.objects[fixture.ids.target]?.attrs.sAMAccountName).toBe(fixture.request.who.account)
        expect(fixture.request.evidence.join(' ')).toContain(fixture.request.who.account)
        for (const step of fixture.routes.script) expect(fixture.hints[2].content).toContain(step.code)
        for (const step of fixture.routes.gui) expect(fixture.hints[2].content).toContain(step.path.join(' → '))
        expect(fixture.routes.script[2]!.code).toContain('-Confirm:$false')
        expect(introduced.objects[fixture.ids.target]?.attrs.title).toBe(introduced.objects[fixture.ids.control]?.attrs.title)
      })

      it('retained history fails if membership audit event is removed', () => {
        const fixture = case05.build(seed)
        const attempt = runScriptRoute(fixture, undefined, undefined, seed)
        const sid = attempt.state.objects[fixture.ids.target]!.sid
        const membershipEvent = attempt.state.events.find((event) => event.data.memberSid === sid)
        expect(membershipEvent).toBeDefined()
        const altered = { ...attempt, state: { ...attempt.state, events: attempt.state.events.filter((event) => event !== membershipEvent) } }
        const predicate = fixture.predicates.find((item) => item.id === 'history')!
        expect(predicate.evaluate(altered.state, altered).status).toBe('unmet')
      })

      it('control reports changed attributes and history fails when account is missing', () => {
        const fixture = case05.build(seed)
        const attempt = runScriptRoute(fixture, undefined, undefined, seed)
        const controlId = fixture.ids.control
        const control = attempt.state.objects[controlId]!
        const changedState = { ...attempt.state, objects: { ...attempt.state.objects, [controlId]: { ...control, attrs: { ...control.attrs, department: 'Finance' } } } }
        const controlPredicate = fixture.predicates.find((item) => item.id === 'control')!
        const observed = controlPredicate.evaluate(changedState, { ...attempt, state: changedState })
        expect(observed.status).toBe('unmet')
        expect(observed.observed).toContain('department changed')
        const missingState = { ...attempt.state, objects: { ...attempt.state.objects } }
        delete missingState.objects[fixture.ids.target]
        const altered = { ...attempt, state: missingState }
        expect(fixture.predicates.find((item) => item.id === 'history')!.evaluate(missingState, altered).status).toBe('unmet')
      })
    })
  }
})
