import { describe, expect, it } from 'vitest'
import { case03 } from '../../src/tickets/cases/case03'
import { TICKETS, getTicket } from '../../src/tickets/cases'
import { runGuiRoute, runScriptRoute } from '../../src/tickets/routes'
import { encodeCampaign } from '../../src/persist/codec'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { passwordVerdict } from '../../src/ui/terminal/Terminal'
import { closeTicket, createCampaign, introduceTicket } from '../../src/tickets/engine'
import { createDefaultRegistry, createRuntime, run, type RuntimeOptions } from '../../src/ps/runtime'
import type { CampaignState, CaseFixture, RouteResult } from '../../src/tickets/types'

/** Like runScriptRoute, but keeps going after a console error and returns the errors the learner saw. */
function runTolerant(fixture: CaseFixture, steps: CaseFixture['routes']['script'], seed: number, input: Pick<RuntimeOptions, 'readSecure'>) {
  let campaign: CampaignState = introduceTicket(createCampaign(buildBaseDomain().state, [fixture.ticketId]), { id: fixture.ticketId, tier: 1, seeds: [seed], build: () => fixture }, seed)
  const runtime = createRuntime({ registry: createDefaultRegistry(), actor: fixture.ids.operator!, ...input, tickets: {
    getCampaign: () => campaign, setCampaign: (next) => { campaign = next }, getFixture: (id) => id === fixture.ticketId ? fixture : undefined,
  } })
  const errors: string[] = []
  for (const step of steps) errors.push(...run(step.code, runtime, campaign.active!.state).errors.map((error) => error.message))
  const closed = closeTicket(campaign, fixture)
  return { result: { ...closed.attempt ?? campaign.active!, closed: closed.closed } as RouteResult, errors }
}

const pass = { readSecure: () => ({ policy: 'pass' as const }) }
const status = (result: RouteResult, id: string) => result.predicates.find((item) => item.id === id)?.status
const observed = (result: RouteResult, id: string) => result.predicates.find((item) => item.id === id)?.observed
const unmet = (result: RouteResult) => result.predicates.filter((item) => item.status !== 'met').map((item) => item.id)

describe('case 03: new hire with a display-name collision', () => {
  it('is registered after cases 01 and 02 in the campaign queue', () => {
    expect(TICKETS.map((ticket) => ticket.id).slice(0, 3)).toEqual(['case01', 'case02', 'case03'])
    expect(getTicket('case03')).toBe(case03)
  })

  for (const seed of case03.seeds) {
    describe(`seed ${seed}`, () => {
      const fixture = case03.build(seed)
      const sam = fixture.request.who.account
      const script = fixture.routes.script

      it('script route closes with every predicate met', () => {
        const result = runScriptRoute(fixture, undefined, undefined, seed, pass)
        expect(unmet(result)).toEqual([])
        expect(result.closed).toBe(true)
        expect(result.history.every((entry) => entry.source === 'console')).toBe(true)
        expect(observed(result, 'oneAccount')).not.toContain('Reset this attempt')
      })

      it('GUI route closes through the T07 Directory paths', () => {
        const result = runGuiRoute(fixture, undefined, seed)
        expect(unmet(result)).toEqual([])
        expect(result.closed).toBe(true)
        expect(result.history.every((entry) => entry.source === 'gui')).toBe(true)
        expect(fixture.routes.gui[0]!.path).toContain('New user…')
        expect(fixture.routes.gui[1]!.path).toContain('User must change password at next sign-in')
        expect(fixture.routes.gui[2]!.path).toContain('Add to a group…')
      })

      it('the GUI wizard leaves the account in the tree under its full name', () => {
        const result = runGuiRoute(fixture, undefined, seed)
        const account = result.state.objects[fixture.ids.newUser]!
        expect(fixture.routes.gui[1]!.path[2]).toBe(account.attrs.displayName)
        expect(account.parent).toBe(fixture.ids.ou)
      })

      for (const wrong of fixture.wrongFixes) {
        it(`wrong fix fails: ${wrong.name}`, () => {
          const result = runScriptRoute(fixture, wrong.steps, undefined, seed, pass)
          expect(result.closed).toBe(false)
          for (const id of wrong.expectUnmet) expect(status(result, id)).toBe('unmet')
        })
      }

      it('creating without -Path lands in CN=Users and says so', () => {
        const result = runScriptRoute(fixture, fixture.wrongFixes[0]!.steps, undefined, seed, pass)
        expect(observed(result, 'inOu')).toMatch(/^CN=Users,/)
      })

      it('editing the namesake reports the changed attribute against baseline', () => {
        const result = runScriptRoute(fixture, fixture.wrongFixes[1]!.steps, undefined, seed, pass)
        expect(observed(result, 'namesake')).toContain('displayName')
        expect(status(result, 'oneAccount')).toBe('met')
      })

      it('a second account for the same person fails "exactly one"', () => {
        const duplicate = script[3]!.code.replace(`-SamAccountName ${sam}`, `-SamAccountName ${sam}2`).replace(/-Name '([^']+)'/, "-Name '$1 2'")
        const result = runScriptRoute(fixture, [...script, { code: duplicate, explain: 'Duplicate.' }], undefined, seed, pass)
        expect(status(result, 'oneAccount')).toBe('unmet')
        expect(observed(result, 'oneAccount')).toContain('2 new accounts')
        expect(observed(result, 'oneAccount')).toContain('Use Reset this attempt')
        expect(observed(result, 'oneAccount')).toContain('no Remove-ADUser')
        expect(result.closed).toBe(false)
      })

      it('an extra group beyond the baseline fails the control', () => {
        const result = runScriptRoute(fixture, [...script, { code: `Add-ADGroupMember -Identity GG-Pharmacy-Managers -Members ${sam}`, explain: 'Extra.' }], undefined, seed, pass)
        expect(status(result, 'onlyBaseline')).toBe('unmet')
        expect(result.closed).toBe(false)
      })

      it('an unrelated control object stays at baseline on the passing route', () => {
        const result = runScriptRoute(fixture, undefined, undefined, seed, pass)
        const control = buildBaseDomain().ids['user.dwhitfield']!
        expect(JSON.stringify(result.state.objects[control])).toBe(JSON.stringify(result.checkpoint.objects[control]))
        expect(status(result, 'namesake')).toBe('met')
      })

      it('alternate: splatted New-ADUser closes', () => {
        const ouDn = script[3]!.code.match(/-Path '([^']+)'/)![1]
        const name = script[3]!.code.match(/-Name '([^']+)'/)![1]
        const splat = `$p = @{ Name = '${name}'; SamAccountName = '${sam}'; Path = '${ouDn}'; AccountPassword = $pw; ChangePasswordAtLogon = $true; Enabled = $true }; New-ADUser @p`
        const result = runScriptRoute(fixture, [script[2]!, { code: splat, explain: 'Splatting.' }, script[5]!, script[4]!], undefined, seed, pass)
        expect(unmet(result)).toEqual([])
        expect(result.closed).toBe(true)
      })

      it('alternate: create in CN=Users, then Move-ADObject, closes', () => {
        const noPath = fixture.wrongFixes[0]!.steps[1]!.code
        const ouDn = script[3]!.code.match(/-Path '([^']+)'/)![1]
        const result = runScriptRoute(fixture, [script[2]!, { code: noPath, explain: 'Create.' }, { code: `Get-ADUser -Identity ${sam} | Move-ADObject -TargetPath '${ouDn}'`, explain: 'Move.' }, script[4]!, script[5]!], undefined, seed, pass)
        expect(unmet(result)).toEqual([])
        expect(result.closed).toBe(true)
        expect(fixture.debrief(result).change).toContain('moved')
      })

      it('partial failure: a rejected password leaves a disabled account that can be recovered', () => {
        const { result: failed, errors } = runTolerant(fixture, script.slice(2, 6), seed, { readSecure: () => ({ policy: 'fail' }) })
        expect(errors.join(' ')).toContain('created without a credential and is disabled')
        expect(status(failed, 'oneAccount')).toBe('met')
        expect(status(failed, 'enabled')).toBe('unmet')
        expect(status(failed, 'credential')).toBe('unmet')
        expect(failed.closed).toBe(false)
        expect(fixture.debrief(failed).change).toMatch(/rejected by policy.*Set-ADAccountPassword -Reset/)
        let calls = 0
        const { result: recovered } = runTolerant(fixture, [
          ...script.slice(2, 6),
          { code: `$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity ${sam} -Reset -NewPassword $pw`, explain: 'Reset.' },
          { code: `Enable-ADAccount -Identity ${sam}`, explain: 'Turn on.' },
        ], seed, { readSecure: () => ({ policy: calls++ === 0 ? 'fail' : 'pass' }) })
        expect(unmet(recovered)).toEqual([])
        expect(recovered.closed).toBe(true)
        expect(fixture.debrief(recovered).change).toContain('You recovered')
      })

      it('no password text reaches the attempt, debrief, or save', () => {
        const secret = `Simulated${seed}Secret!2026`
        const result = runScriptRoute(fixture, undefined, undefined, seed, { readSecure: () => ({ policy: passwordVerdict(secret) }) })
        expect(result.closed).toBe(true)
        const debrief = fixture.debrief(result)
        const save = encodeCampaign({ base: buildBaseDomain().state, queue: ['case03'], completed: [], active: result, history: [] }, seed, { revision: 1, tab: 't' })
        for (const text of [JSON.stringify(result), JSON.stringify(debrief), JSON.stringify(save)]) expect(text).not.toContain(secret)
        expect(JSON.stringify(debrief)).not.toMatch(/password\s*[:=]/i)
      })

      it('debrief, hints, and transfer are complete', () => {
        const result = runScriptRoute(fixture, undefined, undefined, seed, pass)
        const debrief = fixture.debrief(result)
        expect(debrief.change).toContain(sam)
        expect(debrief.access).toContain('exactly the HR baseline')
        expect(debrief.reusableCommand).toContain('-AsSecureString')
        for (const step of script) expect(fixture.hints[2].content).toContain(step.code)
        for (const step of fixture.routes.gui) expect(fixture.hints[2].content).toContain(step.path.join(' → '))
        expect(fixture.transfer.choices).toContain(fixture.transfer.answer)
        expect(fixture.request.careful).toBeTruthy()
      })
    })
  }

  it('the two seeds differ in person, department, OU, groups, and collision type', () => {
    const a = case03.build(1), b = case03.build(2)
    expect(a.request.who).not.toEqual(b.request.who)
    expect(a.ids.ou).not.toBe(b.ids.ou)
    expect(a.ids.group1).not.toBe(b.ids.group1)
    expect(a.ids.namesake).not.toBe(b.ids.namesake)
    expect(a.request.careful).toContain('already uses the name (CN)')
    expect(b.request.careful).not.toContain('already uses the name (CN)')
    for (const text of [a.request.careful!, a.hints[1].content, a.routes.script[3]!.explain]) expect(text).toContain('unique within an OU')
  })
})
