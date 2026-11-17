import { describe, expect, it } from 'vitest'
import { case01 } from '../../src/tickets/cases/case01'
import { getTicket, TICKETS } from '../../src/tickets/cases'
import { runGuiRoute, runScriptRoute } from '../../src/tickets/routes'
import { buildBaseDomain } from '../../src/fixtures/baseDomain'
import { createCampaign, introduceTicket } from '../../src/tickets/engine'
import { createDefaultRegistry, createRuntime, run } from '../../src/ps/runtime'
import type { CampaignState } from '../../src/tickets/types'

const SEEDS = case01.seeds
const statusOf = (result: { predicates: { id: string; status: string }[] }, id: string) => result.predicates.find((p) => p.id === id)?.status
const samOf = (seed: number, key: string) => {
  const fixture = case01.build(seed)
  const state = fixture.introduce(buildBaseDomain().state)
  return state.objects[fixture.ids[key]].attrs.sAMAccountName as string
}

describe('case 01: locked out before shift change', () => {
  it('is registered with two seeds', () => {
    expect(getTicket('case01')).toBe(case01)
    expect(TICKETS.map((t) => t.id)).toContain('case01')
    expect(SEEDS.length).toBeGreaterThanOrEqual(2)
  })

  it('seed A is the spec fixture: Maya Ali, mali, lockout at 06:54 from her workstation, verified by callback', () => {
    const fixture = case01.build(1)
    const state = fixture.introduce(buildBaseDomain().state)
    const maya = state.objects[fixture.ids.target]
    expect(maya.attrs).toMatchObject({ sAMAccountName: 'mali', displayName: 'Maya Ali', enabled: true, lockedOut: true })
    const lockout = state.events.find((e) => e.eventId === 4740 && e.target === fixture.ids.target)!
    expect(lockout.data.callerComputerName).toBe('PHARM-WS01')
    expect(lockout.time % 86_400_000).toBe((6 * 60 + 54) * 60_000)
    expect(fixture.request.alreadyChecked).toMatch(/callback/)
    expect(fixture.request.clue).toEqual({ text: 'Account locked out at 06:54 from PHARM-WS01', eventId: 4740 })
    const near = state.objects[fixture.ids.nearMatch]
    expect(near.attrs).toMatchObject({ sAMAccountName: 'malli', enabled: true, lockedOut: false })
    expect(state.events.some((e) => e.eventId === 4624 && e.target === fixture.ids.nearMatch)).toBe(true)
  })

  it('seed B changes the account, department, workstation, and near-match', () => {
    const a = case01.build(1), b = case01.build(2)
    expect(samOf(2, 'target')).not.toBe(samOf(1, 'target'))
    expect(samOf(2, 'nearMatch')).not.toBe(samOf(1, 'nearMatch'))
    expect(b.ids.workstation).not.toBe(a.ids.workstation)
    expect(b.ids.ou).not.toBe(a.ids.ou)
    expect(b.request.title).not.toBe(a.request.title)
  })

  it('supplies the Read screen and checklist content', () => {
    for (const seed of SEEDS) {
      const { request, predicates } = case01.build(seed)
      expect(request.goal.split(/(?<=\.)\s/)).toHaveLength(1)
      expect(request.who.account).toBe(samOf(seed, 'target'))
      expect(request.careful).toContain(samOf(seed, 'nearMatch'))
      expect(request.glossary.length).toBeGreaterThanOrEqual(5)
      for (const entry of request.glossary) expect(entry.definition.length).toBeGreaterThan(10)
      for (const p of predicates) expect(p.label).not.toMatch(/LockedOut|credentialVersion|sAMAccountName/)
    }
  })

  for (const seed of SEEDS) {
    describe(`seed ${seed}`, () => {
      it('script route closes the ticket', () => {
        const result = runScriptRoute(case01.build(seed), undefined, undefined, seed)
        expect(result.refusal).toBeUndefined()
        expect(result.closed).toBe(true)
      })

      it('GUI route closes the ticket', () => {
        const result = runGuiRoute(case01.build(seed), undefined, seed)
        expect(result.closed).toBe(true)
        expect(result.history.every((h) => h.source === 'gui')).toBe(true)
        expect(result.state.events.some((e) => e.eventId === 4767 && e.source === 'gui')).toBe(true)
      })

      it('wrong fix: a password reset alone leaves the ticket open and fails the credential check', () => {
        const fixture = case01.build(seed)
        const [wrong] = fixture.wrongFixes
        const result = runScriptRoute(fixture, wrong.steps, undefined, seed, { readSecure: () => ({ policy: 'pass' }) })
        expect(result.closed).toBe(false)
        for (const id of wrong.expectUnmet) expect(statusOf(result, id)).toBe('unmet')
        expect(result.refusal!.some((line) => line.includes('password was not changed') && line.includes('required'))).toBe(true)
      })

      it('control: unlocking the near-match does not close the ticket', () => {
        const fixture = case01.build(seed)
        const near = samOf(seed, 'nearMatch')
        const result = runScriptRoute(fixture, [{ code: `Unlock-ADAccount -Identity ${near}`, explain: 'Wrong account.' }], undefined, seed)
        expect(result.closed).toBe(false)
        expect(statusOf(result, 'unlocked')).toBe('unmet')
        expect(statusOf(result, 'nearMatch')).toBe('met')
      })

      it('control: changing the near-match fails the control criterion even after the right unlock', () => {
        const fixture = case01.build(seed)
        const near = samOf(seed, 'nearMatch')
        const steps = [...fixture.routes.script, { code: `Set-ADUser -Identity ${near} -Description 'checked'`, explain: 'Touches the coworker.' }]
        const result = runScriptRoute(fixture, steps, undefined, seed)
        expect(result.closed).toBe(false)
        expect(statusOf(result, 'nearMatch')).toBe('unmet')
      })

      it('alternate route: Search-ADAccount -LockedOut | Unlock-ADAccount closes it', () => {
        const result = runScriptRoute(case01.build(seed), [{ code: 'Search-ADAccount -LockedOut | Unlock-ADAccount', explain: 'Alternate.' }], undefined, seed)
        expect(result.closed).toBe(true)
      })

      it('hints, routes, and predicates name the same account', () => {
        const fixture = case01.build(seed)
        const sam = samOf(seed, 'target'), near = samOf(seed, 'nearMatch')
        for (const step of fixture.routes.script) expect(step.code).toMatch(new RegExp(`-Identity ${sam}\\b`))
        for (const step of fixture.routes.script) expect(step.code).not.toContain(near)
        expect(fixture.routes.gui[0].action).toEqual({ type: 'user.unlock', target: fixture.ids.target })
        expect(fixture.hints[1].content).toContain(sam)
        expect(fixture.responsibility.account).toBe(sam)
        expect(fixture.request.who.account).toBe(sam)
      })

      it('level 3 hint is generated from routes.script and the GUI path', () => {
        const fixture = case01.build(seed)
        for (const step of fixture.routes.script) expect(fixture.hints[2].content).toContain(`# ${step.explain}\n${step.code}`)
        expect(fixture.hints[2].content).toContain(fixture.routes.gui[0].path.join(' → '))
        expect(fixture.hints[2].content).toContain('4767')
      })

      it('debrief names the change, who regained access, how it was verified, and a reusable command', () => {
        const fixture = case01.build(seed)
        const sam = samOf(seed, 'target')
        const steps = [...fixture.routes.script, { code: `Test-SimSignIn ${sam} ${fixture.request.needs.match(/at (\S+)/)![1]}`, explain: 'Fresh sign-in.' }]
        const debrief = fixture.debrief(runScriptRoute(fixture, steps, undefined, seed))
        expect(debrief.change).toMatch(new RegExp(`unlocked .*\\(${sam}\\) with PowerShell .*4767`))
        expect(debrief.access).toContain('regained')
        expect(debrief.verification).toContain('4624')
        expect(debrief.reusableCommand).toBe(`Unlock-ADAccount -Identity ${sam}`)
        expect(fixture.transfer.answer).toMatch(/group memberships and the share's permissions/)
        expect(fixture.transfer.choices).toContain(fixture.transfer.answer)
      })
    })
  }

  it('the transfer question on seed A matches the spec', () => {
    expect(case01.build(1).transfer.question).toBe('If Maya could sign in but the Pharmacy share said Access denied, what would you inspect next?')
  })

  it('Reset-SimAttempt returns the same state the engine reset gives the GUI', () => {
    const fixture = case01.build(1)
    let campaign: CampaignState = introduceTicket(createCampaign(buildBaseDomain().state, ['case01']), case01, 1)
    const rt = createRuntime({ registry: createDefaultRegistry(), actor: fixture.ids.operator, tickets: { getCampaign: () => campaign, setCampaign: (c) => { campaign = c }, getFixture: () => fixture } })
    const after = run('Unlock-ADAccount -Identity mali', rt, campaign.active!.state)
    expect(after.state.objects[fixture.ids.target].attrs.lockedOut).toBe(false)
    const reset = run('Reset-SimAttempt', rt, after.state)
    expect(reset.output).toContain('simulated')
    expect(reset.state).toEqual(campaign.active!.checkpoint)
    expect(campaign.active!.state).toEqual(campaign.active!.checkpoint)
    expect(campaign.active!.history).toEqual([])
  })
})
