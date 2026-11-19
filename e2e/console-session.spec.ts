import { expect, test, type Page } from '@playwright/test'
import { clickGuiRoute, finishCase, fixtureOf, openApp, typeCommand, workTab } from './helpers'

/** A typed simulated password. It is only ever typed into the masked secure field. */
const TYPED = 'Typed-Secret-2026x'

/** Live values of every input and textarea, read from the DOM property (page.content() does not show them). */
const liveValues = (page: Page, except?: string) => page.evaluate((skip) =>
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].filter((field) => field.id !== skip).map((field) => field.value), except)

const lastOutput = (page: Page) => page.locator('.console .transcript .entry').last()

async function expectNoSecret(page: Page, except?: string) {
  expect((await liveValues(page, except)).filter((value) => value.includes(TYPED))).toEqual([])
  expect(await page.locator('body').innerText()).not.toContain(TYPED)
  expect(await page.content()).not.toContain(TYPED)
}

test('a secure password stays in the masked field only, then nowhere', async ({ page }) => {
  await openApp(page)
  await workTab(page, 'PowerShell')
  const command = page.getByRole('textbox', { name: 'PowerShell command' })
  await command.fill("$pw = Read-Host -Prompt 'Initial password (simulated)' -AsSecureString")
  await command.press('Enter')
  const secure = page.locator('.console input#secure')
  await secure.fill(TYPED)
  // While the prompt is open: the masked field holds the characters, nothing else does.
  await expect(secure).toHaveAttribute('type', 'password')
  await expect(secure).toHaveValue(TYPED)
  await expectNoSecret(page, 'secure')
  await secure.press('Enter')
  await expect(secure).toHaveCount(0)
  // After submission: no field, the page, the save, or the history holds them.
  await expectNoSecret(page)
  await typeCommand(page, "New-ADUser -Name 'Test Person' -SamAccountName tperson -Path 'OU=Pharmacy,DC=corp,DC=contoso,DC=local' -AccountPassword $pw -Enabled $true")
  await expect(page.locator('.console .transcript .entry.error')).toHaveCount(0)
  await typeCommand(page, '$pw')
  await expect(lastOutput(page)).toContainText('System.Security.SecureString')
  await expectNoSecret(page)
  const saved = await page.evaluate(() => localStorage.getItem('adshield.v1') ?? '')
  expect(saved).toContain('tperson')
  expect(saved).not.toContain(TYPED)
  for (let step = 0; step < 3; step += 1) {
    await command.press('ArrowUp')
    expect(await command.inputValue()).not.toContain(TYPED)
  }
})

test('console variables last across lines, then clear on reset, reload, and case change', async ({ page }) => {
  await openApp(page)
  await typeCommand(page, "$note = 'kept'")
  await typeCommand(page, '"[$note]"')
  await expect(lastOutput(page)).toHaveText('[kept]')
  // Reset this attempt.
  await page.getByRole('button', { name: 'Reset this attempt' }).click()
  await page.getByRole('group', { name: 'Confirm reset' }).getByRole('button', { name: 'Yes, reset' }).click()
  await typeCommand(page, '"[$note]"')
  await expect(lastOutput(page)).toHaveText('[]')
  // Reload.
  await typeCommand(page, "$note = 'kept'")
  await page.reload()
  await typeCommand(page, '"[$note]"')
  await expect(lastOutput(page)).toHaveText('[]')
  // Case change: close case 01, open case 02.
  await typeCommand(page, "$note = 'kept'")
  await clickGuiRoute(page, fixtureOf('case01', 1))
  await finishCase(page)
  await page.getByRole('button', { name: 'Next ticket' }).click()
  await expect(page.locator('.read .case-chip').first()).toHaveText('case02')
  await typeCommand(page, '"[$note]"')
  await expect(lastOutput(page)).toHaveText('[]')
})
