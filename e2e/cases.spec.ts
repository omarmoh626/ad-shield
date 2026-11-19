import { expect, test } from '@playwright/test'
import { buildBaseDomain } from '../src/fixtures/baseDomain'
import { displayName } from '../src/ui/directory/labels'
import { directGroupsOf } from '../src/ui/properties/ObjectProperties'
import {
  caseIds, checklist, checkRow, clickGuiRoute, expectCheck, expectNoConsoleError, finishCase, fixtureOf,
  reachCase, seedsOf, selectObject, typeScript, workTab,
} from './helpers'

/** Control object key per case (the near-match or control the ticket warns about). */
const CONTROL_KEY: Record<string, string> = { case01: 'nearMatch', case02: 'control', case03: 'namesake', case04: 'control', case05: 'control' }

for (const id of caseIds) {
  for (const seed of seedsOf(id)) {
    test.describe(`${id} seed ${seed}`, () => {
      const fixture = fixtureOf(id, seed)
      const total = fixture.predicates.length

      test('script route typed into the console closes the case', async ({ page }) => {
        await reachCase(page, id, seed)
        await typeScript(page, fixture.routes.script)
        await expectNoConsoleError(page)
        await expect(checklist(page).getByText(`${total} of ${total} done`)).toBeVisible()
        await finishCase(page)
        await expect(page.getByRole('heading', { name: 'What you left alone' })).toBeVisible()
      })

      test('GUI route clicked in the Directory closes the case', async ({ page }) => {
        await reachCase(page, id, seed)
        await clickGuiRoute(page, fixture)
        await expect(checklist(page).getByText(`${total} of ${total} done`)).toBeVisible()
        await finishCase(page)
      })

      test(`wrong fix "${fixture.wrongFixes[0]!.name}" leaves the case open`, async ({ page }) => {
        const wrong = fixture.wrongFixes[0]!
        await reachCase(page, id, seed)
        await typeScript(page, wrong.steps)
        for (const predicateId of wrong.expectUnmet) {
          const label = fixture.predicates.find((predicate) => predicate.id === predicateId)!.label
          await expect(checkRow(page, label).locator('.check-status')).not.toHaveText(/^Done/)
        }
        await expect(checklist(page).getByRole('button', { name: /^Finish case · \d+ to go$/ })).toBeDisabled()
      })

      test('control object is left as it was', async ({ page }) => {
        const before = fixture.introduce(buildBaseDomain().state)
        const guid = fixture.ids[CONTROL_KEY[id]!]!
        const control = before.objects[guid]!
        const groups = directGroupsOf(before, guid).map(displayName)
        await reachCase(page, id, seed)
        await clickGuiRoute(page, fixture)
        for (const predicate of fixture.predicates.filter((item) => item.kind === 'control')) await expectCheck(page, predicate.label, 'Done')
        await workTab(page, 'Directory')
        await selectObject(page, before, guid)
        const properties = page.getByRole('region', { name: `Properties of ${displayName(control)}` })
        if (control.objectClass === 'user') {
          await properties.getByRole('tab', { name: 'Account', exact: true }).click()
          await expect(properties.getByText(`Enabled ${control.attrs.enabled === false ? 'False' : 'True'}`, { exact: true })).toBeVisible()
          await expect(properties.getByText(`LockedOut ${control.attrs.lockedOut === true ? 'True' : 'False'}`, { exact: true })).toBeVisible()
        }
        await properties.getByRole('tab', { name: 'Groups', exact: true }).click()
        await expect(properties.getByText(`Member of (${groups.length}, direct only)`)).toBeVisible()
        for (const name of groups) await expect(properties.locator('.member-of')).toContainText(name)
      })
    })
  }
}
