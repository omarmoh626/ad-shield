import { describe, expect, it } from 'vitest'
import { case02 } from '../../src/tickets/cases/case02'
import { runGuiRoute, runScriptRoute } from '../../src/tickets/routes'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'

const status = (result: { predicates: { id: string; status: string }[] }, id: string) => result.predicates.find((item) => item.id === id)?.status

describe('case 02: approved Finance share read access', () => {
  for (const seed of case02.seeds) {
    describe(`seed ${seed}`, () => {
      it('script route closes with approved role access and separate session results', () => {
        const fixture = case02.build(seed)
        const result = runScriptRoute(fixture, undefined, undefined, seed)
        expect(result.closed).toBe(true)
        expect(status(result, 'existingSession')).toBe('met')
        expect(status(result, 'freshRead')).toBe('met')
        expect(status(result, 'freshWriteDenied')).toBe('met')
        expect(status(result, 'controlDenied')).toBe('met')
      })

      it('GUI route closes by adding the approved Finance role', () => {
        const fixture = case02.build(seed)
        const result = runGuiRoute(fixture, undefined, seed)
        expect(result.closed).toBe(true)
        expect(result.history.every((entry) => entry.source === 'gui')).toBe(true)
        expect(fixture.routes.gui[0].path).toEqual(['Directory', 'Pharmacy', fixture.request.who.person, 'Properties', 'Groups', 'Add to a group…', 'Apply'])
      })

      it('derives request and GUI path name from the seeded object displayName', () => {
        const fixture = case02.build(seed)
        const initial = fixture.introduce(buildBaseDomain().state)
        const displayName = initial.objects[fixture.ids.user]!.attrs.displayName
        expect(fixture.request.who.person).toBe(displayName)
        expect(fixture.routes.gui[0]!.path).toContain(displayName)
      })

      it('write-role wrong fix fails write denial and role control', () => {
        const fixture = case02.build(seed)
        const wrong = fixture.wrongFixes[0]!
        const result = runScriptRoute(fixture, wrong.steps, undefined, seed)
        expect(result.closed).toBe(false)
        for (const id of wrong.expectUnmet) expect(status(result, id)).toBe('unmet')
      })

      it('direct user grant wrong fix is caught by the access trace', () => {
        const fixture = case02.build(seed)
        const wrong = fixture.wrongFixes[1]!
        const result = runScriptRoute(fixture, wrong.steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'noDirectGrant')).toBe('unmet')
        expect(result.predicates.find((predicate) => predicate.id === 'noDirectGrant')?.observed).toContain('direct user entry present')
      })

      it('detects direct read entry even when approved role entry is also present', () => {
        const fixture = case02.build(seed)
        const steps = [
          ...fixture.routes.script,
          { code: `Add-SimResourcePermission -Resource Finance -Identity ${fixture.request.who.account} -Right Read`, explain: 'Adds direct read permission beside the role grant.' },
        ]
        const result = runScriptRoute(fixture, steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'noDirectGrant')).toBe('unmet')
        expect(result.predicates.find((predicate) => predicate.id === 'noDirectGrant')?.observed).toContain('direct user entry present')
        expect(result.predicates.find((predicate) => predicate.id === 'noDirectGrant')?.observed).toContain('share layer')
      })

      it('control user stays denied', () => {
        const fixture = case02.build(seed)
        const result = runScriptRoute(fixture, [{ code: 'Test-SimResourceAccess -Identity aokoye -Resource Finance -Right Read', explain: 'Control check.' }], undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'controlDenied')).toBe('met')
      })

      it('alternate Add-ADPrincipalGroupMembership route closes', () => {
        const fixture = case02.build(seed)
        const sam = fixture.request.who.account
        const result = runScriptRoute(fixture, [{ code: `Add-ADPrincipalGroupMembership -Identity ${sam} -MemberOf GG-Finance-Staff`, explain: 'Alternate cmdlet parameter direction.' }, ...fixture.routes.script.slice(2)], undefined, seed)
        expect(result.closed).toBe(true)
      })

      it('all fixture-facing details vary with seed and hint lists executable routes', () => {
        const a = case02.build(1), b = case02.build(2)
        expect(a.request.who.account).not.toBe(b.request.who.account)
        expect(a.request.clue.text).not.toBe(b.request.clue.text)
        for (const step of a.routes.script) expect(a.hints[2].content).toContain(step.code)
        expect(a.hints[2].content).toContain(a.routes.gui[0]!.path.join(' → '))
        expect(a.introduce(buildBaseDomain().state).sessions.length).toBe(1)
      })

      it('debrief reports actual passing and failing access state', () => {
        const fixture = case02.build(seed)
        const passing = runScriptRoute(fixture, undefined, undefined, seed)
        const good = fixture.debrief(passing)
        expect(good.access).toContain('read allowed, write denied')
        expect(good.access).toContain('No applying direct user entry')
        expect(good.access).toContain('not in GG-Finance-Managers')

        const failingSteps = [
          ...fixture.routes.script,
          { code: `Add-SimResourcePermission -Resource Finance -Identity ${fixture.request.who.account} -Right Read`, explain: 'Adds a direct read entry.' },
          { code: `Add-ADGroupMember -Identity GG-Finance-Managers -Members ${fixture.request.who.account}`, explain: 'Adds the broader write role.' },
        ]
        const failing = runScriptRoute(fixture, failingSteps, undefined, seed)
        const bad = fixture.debrief(failing)
        expect(bad.access).toContain('read allowed, write allowed')
        expect(bad.access).toContain('direct user entry is present')
        expect(bad.access).toContain('is in GG-Finance-Managers')
      })
    })
  }
})
