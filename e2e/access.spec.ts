import { expect, test, type Page } from '@playwright/test'
import { checklist, expectCheck, fixtureOf, openApp, selectTreeItem } from './helpers'

const case01 = fixtureOf('case01', 1)
const unlocked = case01.predicates.find((predicate) => predicate.id === 'unlocked')!.label

/** What has keyboard focus: its role or tag, and its accessible text. */
async function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element) return { role: '', name: '' }
    const role = element.getAttribute('role') ?? element.tagName.toLowerCase()
    const label = element.getAttribute('aria-label') ?? (element.id ? document.querySelector(`label[for="${element.id}"]`)?.textContent : null)
    return { role, name: (label ?? element.closest('label')?.textContent ?? element.textContent ?? '').trim() }
  })
}

/** Presses a key until focus lands on a matching element. Only the keyboard moves focus. */
async function pressUntil(page: Page, key: string, match: (at: { role: string; name: string }) => boolean, limit = 80) {
  for (let step = 0; step < limit; step += 1) {
    if (match(await focused(page))) return
    await page.keyboard.press(key)
  }
  throw new Error(`Focus never reached the target with ${key}; last: ${JSON.stringify(await focused(page))}`)
}

/** The name of the tree row under the keyboard cursor. */
const cursorName = (page: Page) => page.evaluate(() => {
  const tree = document.querySelector('[role="tree"]')
  const id = tree?.getAttribute('aria-activedescendant')
  return id ? document.getElementById(id)?.querySelector('.tree-name')?.textContent ?? '' : ''
})
async function arrowTo(page: Page, name: string) {
  for (let step = 0; step < 60 && await cursorName(page) !== name; step += 1) await page.keyboard.press('ArrowDown')
  expect(await cursorName(page)).toBe(name)
}

test('keyboard only: case 01 from the ticket to Finish case', async ({ page }) => {
  await openApp(page)
  await pressUntil(page, 'Tab', (at) => at.role === 'button' && at.name === 'Start in Directory')
  await page.keyboard.press('Enter')
  await pressUntil(page, 'Tab', (at) => at.role === 'tree')
  await arrowTo(page, 'Pharmacy')
  await page.keyboard.press('ArrowRight')
  await arrowTo(page, 'Maya Ali')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Properties of Maya Ali' })).toBeVisible()
  // Shift+F10 opens the context menu on the tree row; arrows pick the item.
  await page.keyboard.press('Shift+F10')
  await pressUntil(page, 'ArrowDown', (at) => at.role === 'menuitem' && at.name === 'Unlock account…', 10)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('form', { name: 'Account options' }).getByLabel('Unlock account')).toBeChecked()
  await pressUntil(page, 'Tab', (at) => at.role === 'button' && at.name === 'Apply')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('form', { name: 'Account options' }).getByRole('status')).toContainText('Saved · simulated')
  await expectCheck(page, unlocked, 'Done')
  await pressUntil(page, 'Shift+Tab', (at) => at.role === 'button' && at.name === 'Finish case', 120)
  await page.keyboard.press('Enter')
  await expect(page.locator('#debrief-title')).toBeVisible()
})

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('case 01: switching tabs keeps the active object, the terminal draft, and the ticket', async ({ page }) => {
    await openApp(page)
    const tabs = page.getByRole('navigation', { name: 'Workspace tabs' })
    await expect(tabs).toBeVisible()
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390)
    await tabs.getByRole('button', { name: 'Directory' }).click()
    await selectTreeItem(page, 'Pharmacy', undefined, true)
    await selectTreeItem(page, 'Maya Ali')
    await tabs.getByRole('button', { name: 'PowerShell' }).click()
    const draft = 'Get-ADUser -Identity mali -Properties LockedOut'
    await page.getByRole('textbox', { name: 'PowerShell command' }).fill(draft)
    await tabs.getByRole('button', { name: 'Ticket' }).click()
    await expect(page.locator('#ticket-title')).toHaveText(case01.request.title)
    await tabs.getByRole('button', { name: 'Evidence' }).click()
    await tabs.getByRole('button', { name: 'Directory' }).click()
    await expect(page.getByRole('treeitem', { selected: true })).toContainText('Maya Ali')
    await expect(page.getByRole('region', { name: 'Properties of Maya Ali' })).toBeVisible()
    await tabs.getByRole('button', { name: 'PowerShell' }).click()
    await expect(page.getByRole('textbox', { name: 'PowerShell command' })).toHaveValue(draft)
    await tabs.getByRole('button', { name: 'Ticket' }).click()
    await expect(page.locator('#ticket-title')).toHaveText(case01.request.title)
    await expect(page.locator('header.topbar .case-chip')).toHaveText('case01')
    // The progress line opens the checklist on a narrow screen.
    await page.getByRole('button', { name: /^(Read|Work) · \d+ of \d+ done$/ }).click()
    await expect(checklist(page)).toBeVisible()
  })
})
