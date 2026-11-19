import { expect, test } from '@playwright/test'
import {
  checklist, clickGuiRoute, expectCheck, finishCase, fixtureOf, openApp, reachCase, selectTreeItem, typeCommand, workTab,
} from './helpers'

const case01 = fixtureOf('case01', 1)
const unlocked = case01.predicates.find((predicate) => predicate.id === 'unlocked')!.label
const saveStatus = (page: import('@playwright/test').Page) => page.locator('header.topbar .top-controls [role="status"]')

test('refresh during an open ticket keeps the case and its progress', async ({ page }) => {
  await openApp(page)
  await typeCommand(page, 'Unlock-ADAccount -Identity mali')
  await expectCheck(page, unlocked, 'Done')
  await expect(saveStatus(page)).toHaveText('Saved')
  await page.reload()
  await expect(page.locator('.read .case-chip').first()).toHaveText('case01')
  await workTab(page, 'PowerShell')
  await expectCheck(page, unlocked, 'Done')
})

test('a stale editor after a terminal edit warns, keeps the draft, and applies after review', async ({ page }) => {
  await openApp(page)
  await workTab(page, 'Directory')
  await selectTreeItem(page, 'Pharmacy', undefined, true)
  await selectTreeItem(page, 'Maya Ali')
  await page.getByRole('tab', { name: 'Account', exact: true }).click()
  const editor = page.getByRole('form', { name: 'Account options' })
  await editor.getByLabel('User must change password at next sign-in').check()
  // The same account changes in the console while the form is open.
  await typeCommand(page, 'Unlock-ADAccount -Identity mali')
  await workTab(page, 'Directory')
  await expect(editor.getByLabel('User must change password at next sign-in')).toBeChecked()
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  const alert = editor.getByRole('alert')
  await expect(alert).toContainText('Not saved: an object this change touches changed after you opened the form.')
  await expect(alert).toContainText('lockedOut')
  await alert.getByRole('button', { name: 'Review with the new values' }).click()
  await expect(editor.getByLabel('User must change password at next sign-in')).toBeChecked()
  await editor.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('Saved · simulated')
  await expect(page.getByRole('region', { name: 'Properties of Maya Ali' })).toContainText('Must change password at next sign-in')
})

test('a second tab is read-only and cannot overwrite the first tab', async ({ page, context }) => {
  await openApp(page)
  await typeCommand(page, 'Unlock-ADAccount -Identity mali')
  await expect(saveStatus(page)).toHaveText('Saved')
  const second = await context.newPage()
  await second.goto('/')
  await expect(saveStatus(second)).toHaveText('Read only')
  // A change in the read-only tab is not saved over the first tab's progress.
  await typeCommand(second, 'Disable-ADAccount -Identity mali')
  await expect(saveStatus(second)).toHaveText('Read only')
  await second.close()
  await page.reload()
  await workTab(page, 'PowerShell')
  await expectCheck(page, unlocked, 'Done')
  await expectCheck(page, case01.predicates.find((predicate) => predicate.id === 'enabled')!.label, 'Done')
})

test('a read-only second tab explains why it is read-only', async ({ page, context }) => {
  // Found in T10 (K2), fixed by D9: the read-only status comes with a text explanation.
  await openApp(page)
  const second = await context.newPage()
  await second.goto('/')
  await expect(saveStatus(second)).toHaveText('Read only')
  await expect(second.getByText('The simulator is open in another tab. This tab is read-only')).toBeVisible()
})

test('storage failure says the change was not saved and the lab keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'adshield.v1' && (window as unknown as { failSaves?: boolean }).failSaves) throw new DOMException('Simulated failure', 'SecurityError')
      return original.call(this, key, value)
    }
  })
  await openApp(page)
  await page.evaluate(() => { (window as unknown as { failSaves?: boolean }).failSaves = true })
  await typeCommand(page, 'Unlock-ADAccount -Identity mali')
  await expectCheck(page, unlocked, 'Done')
  await expect(saveStatus(page)).toHaveText('Not saved')
  await expect(page.getByText('The last change could not be saved. Keep working; the next change will try again.')).toBeVisible()
})

test('reset this attempt puts the case back where it started', async ({ page }) => {
  await openApp(page)
  await typeCommand(page, 'Unlock-ADAccount -Identity mali')
  await expectCheck(page, unlocked, 'Done')
  await page.getByRole('button', { name: 'Reset this attempt' }).click()
  await page.getByRole('group', { name: 'Confirm reset' }).getByRole('button', { name: 'Yes, reset' }).click()
  await expectCheck(page, unlocked, 'Not yet')
  await expect(page.getByText('Attempt reset · the case is back where it started')).toBeVisible()
})

test('replaying a closed case gives one completion reward only', async ({ page }) => {
  await openApp(page)
  await clickGuiRoute(page, case01)
  await finishCase(page)
  await expect(page.getByText('Case closed · first time solved')).toBeVisible()
  const progress = page.locator('header.topbar').getByRole('button', { name: /· \d+%$/ })
  const after = await progress.innerText()
  await page.getByRole('button', { name: 'Try this case again, new details' }).click()
  await clickGuiRoute(page, fixtureOf('case01', 2))
  await finishCase(page)
  await expect(page.getByText('Case closed · replay, not counted')).toBeVisible()
  await expect(progress).toHaveText(after)
  await page.getByRole('button', { name: 'Next ticket' }).click()
  await expect(page.locator('.read .case-chip').first()).toHaveText('case02')
})

test('a dry run (-WhatIf) leaves state identical before and after', async ({ page }) => {
  await openApp(page)
  await workTab(page, 'PowerShell')
  const progress = await checklist(page).locator('[aria-live="polite"]').innerText()
  const evidence = await page.getByRole('tab', { name: /^Evidence/ }).innerText()
  const output = await typeCommand(page, 'Unlock-ADAccount -Identity mali -WhatIf')
  expect(output).toContain('What if')
  await expect(checklist(page).locator('[aria-live="polite"]')).toHaveText(progress)
  await expect(page.getByRole('tab', { name: /^Evidence/ })).toHaveText(evidence)
  await expectCheck(page, unlocked, 'Not yet')
  await workTab(page, 'Directory')
  await selectTreeItem(page, 'Pharmacy', undefined, true)
  await selectTreeItem(page, 'Maya Ali')
  await page.getByRole('tab', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Properties of Maya Ali' }).getByText('LockedOut True', { exact: true })).toBeVisible()
})

test('negative: an OU move alone cannot pass case 04', async ({ page }) => {
  const fixture = fixtureOf('case04', 1)
  await reachCase(page, 'case04', 1)
  await clickGuiRoute(page, { ...fixture, routes: { ...fixture.routes, gui: fixture.routes.gui.slice(0, 1) } })
  for (const id of ['financeRead', 'pharmacyDenied']) {
    const label = fixture.predicates.find((predicate) => predicate.id === id)!.label
    await expect(page.locator('section.checklist li.check').filter({ hasText: label }).locator('.check-status')).not.toHaveText(/^Done/)
  }
  await expect(checklist(page).getByRole('button', { name: /^Finish case · \d+ to go$/ })).toBeDisabled()
})
