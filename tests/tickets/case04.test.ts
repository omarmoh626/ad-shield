import { describe, expect, it } from 'vitest'
import { case04 } from '../../src/tickets/cases/case04'
import { runGuiRoute, runScriptRoute } from '../../src/tickets/routes'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { deriveDn } from '../../src/domain/dn'

type Result = ReturnType<typeof runScriptRoute>
const find = (result: Result, id: string) => result.predicates.find((item) => item.id === id)
const status = (result: Result, id: string) => find(result, id)?.status

describe('case 04: department transfer', () => {
  for (const seed of case04.seeds) {
    describe(`seed ${seed}`, () => {
      it('script route closes with the same account in Finance, Finance read, and Pharmacy denied', () => {
        const fixture = case04.build(seed)
        const result = runScriptRoute(fixture, undefined, undefined, seed)
        expect(result.refusal).toBeUndefined()
        expect(result.closed).toBe(true)
        for (const id of ['sameAccount', 'financeRead', 'pharmacyDenied', 'enterpriseRole', 'control', 'signin', 'existingSession']) expect(status(result, id)).toBe('met')
        const account = result.state.objects[fixture.ids.target]!
        expect(account.parent).toBe(fixture.ids.financeOu)
        expect(account.sid).toBe(result.checkpoint.objects[fixture.ids.target]!.sid)
      })

      it('GUI route uses real Directory tab paths and closes', () => {
        const fixture = case04.build(seed)
        const result = runGuiRoute(fixture, undefined, seed)
        expect(result.closed).toBe(true)
        expect(result.history.every((entry) => entry.source === 'gui')).toBe(true)
        const person = fixture.request.who.person
        const financeDn = deriveDn(result.state, fixture.ids.financeOu)
        expect(fixture.routes.gui[0]!.path).toEqual(['Directory', 'Pharmacy', person, 'Actions', 'Move…', 'Move to', financeDn, 'Apply'])
        expect(fixture.routes.gui[1]!.path).toEqual(['Directory', 'Finance', person, 'Properties', 'Groups', 'Remove from GG-Pharmacy-Staff', 'Apply'])
        expect(fixture.routes.gui[2]!.path).toEqual(['Directory', 'Finance', person, 'Properties', 'Groups', 'Add to a group…', 'Add to group', 'GG-Finance-Staff', 'Apply'])
        expect(fixture.routes.gui[3]!.path).toEqual(['What done looks like', `Test ${person.split(' ')[0]}'s sign-in · simulated`])
      })

      it('OU move alone leaves Pharmacy-denied unmet and names the group that still grants access', () => {
        const fixture = case04.build(seed)
        const moveOnly = fixture.wrongFixes.find((fix) => fix.name === 'Move the account only')!
        const result = runScriptRoute(fixture, moveOnly.steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'sameAccount')).toBe('met')
        for (const id of moveOnly.expectUnmet) expect(status(result, id)).toBe('unmet')
        expect(find(result, 'pharmacyDenied')!.observed).toContain('GG-Pharmacy-Staff')
        expect(find(result, 'pharmacyDenied')!.observed).toContain('DL-Pharmacy-Share-Read')
      })

      it('a recreated namesake in Finance fails the same-account criterion', () => {
        const fixture = case04.build(seed)
        const recreate = fixture.wrongFixes.find((fix) => fix.name === 'Create a replacement account in Finance')!
        const result = runScriptRoute(fixture, recreate.steps, undefined, seed)
        const namesake = Object.values(result.state.objects).find((object) => object.guid !== fixture.ids.target && object.rdn === fixture.request.who.person)
        expect(namesake?.parent).toBe(fixture.ids.financeOu)
        expect(result.closed).toBe(false)
        for (const id of recreate.expectUnmet) expect(status(result, id)).toBe('unmet')
        expect(find(result, 'sameAccount')!.observed).toContain('different account')
      })

      it('removing the enterprise-wide role fails even with the rest of the transfer done', () => {
        const fixture = case04.build(seed)
        const wrong = fixture.wrongFixes.find((fix) => fix.name === 'Remove the enterprise-wide role')!
        const result = runScriptRoute(fixture, wrong.steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'enterpriseRole')).toBe('unmet')
        expect(status(result, 'pharmacyDenied')).toBe('met')
      })

      it('the control technician keeps Pharmacy access; touching it fails the control', () => {
        const fixture = case04.build(seed)
        const controlSam = String(fixture.introduce(buildBaseDomain().state).objects[fixture.ids.control]!.attrs.sAMAccountName)
        const steps = [...fixture.routes.script, { code: `Remove-ADGroupMember -Identity GG-Pharmacy-Staff -Members ${controlSam} -Confirm:$false`, explain: 'Wrong account.' }]
        const result = runScriptRoute(fixture, steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(status(result, 'control')).toBe('unmet')
      })

      it('alternate order: fix group memberships first, move second, still closes', () => {
        const fixture = case04.build(seed)
        const [ticket, inspect, move, removeOld, addNew, ...verify] = fixture.routes.script
        const result = runScriptRoute(fixture, [ticket!, inspect!, removeOld!, addNew!, move!, ...verify], undefined, seed)
        expect(result.closed).toBe(true)
        expect(fixture.debrief(result).change).toContain('fixed the groups first')
      })

      it('criteria show the fresh sign-in result and that an existing session keeps old access until it ends', () => {
        const fixture = case04.build(seed)
        const result = runScriptRoute(fixture, undefined, undefined, seed)
        expect(find(result, 'pharmacyDenied')!.label).toMatch(/fresh simulated sign-in/i)
        expect(find(result, 'existingSession')!.label).toMatch(/existing session keeps its old access until it ends/i)
        expect(find(result, 'existingSession')!.observed).toMatch(/still allowed/)
      })

      it('names, approvals, hints, routes, and predicates come from one set of fixture IDs', () => {
        const fixture = case04.build(seed)
        const introduced = fixture.introduce(buildBaseDomain().state)
        expect(introduced.objects[fixture.ids.target]?.attrs.sAMAccountName).toBe(fixture.request.who.account)
        expect(introduced.memberships.some((m) => m.member === fixture.ids.target && m.group === fixture.ids.enterpriseRole)).toBe(true)
        expect(fixture.request.evidence.join(' ')).toContain(fixture.request.who.account)
        expect(fixture.request.careful).toBeTruthy()
        for (const step of fixture.routes.script) expect(fixture.hints[2].content).toContain(step.code)
        for (const step of fixture.routes.gui) expect(fixture.hints[2].content).toContain(step.path.join(' → '))
        const debrief = fixture.debrief(runScriptRoute(fixture, undefined, undefined, seed))
        expect(debrief.reusableCommand).toContain('Move-ADObject')
        expect(fixture.transfer.choices).toContain(fixture.transfer.answer)
      })
    })
  }

  it('the two seeds vary the transferring account', () => {
    expect(case04.build(1).request.who.account).not.toBe(case04.build(2).request.who.account)
  })
})
