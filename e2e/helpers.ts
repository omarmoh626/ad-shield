import { expect, type Locator, type Page } from '@playwright/test'
import { TICKETS } from '../src/tickets/cases'
import { buildBaseDomain } from '../src/fixtures/baseDomain'
import { displayName } from '../src/ui/directory/labels'
import type { CaseFixture, GuiStep, ScriptStep } from '../src/tickets/types'

/**
 * Browser helpers for the acceptance specs. They only type and click in the built app.
 * Case fixtures are read for their data (route text, labels, names); nothing here calls dispatch.
 */

/** A simulated password that passes the lab policy. It is typed into password fields only. */
export const LAB_PASSWORD = 'Lab-Simulated-2026'

export const caseIds = TICKETS.map((ticket) => ticket.id)
export function fixtureOf(id: string, seed: number): CaseFixture {
  const ticket = TICKETS.find((item) => item.id === id)
  if (!ticket) throw new Error(`Unknown case ${id}`)
  return ticket.build(seed)
}
export function seedsOf(id: string): number[] {
  return [...TICKETS.find((item) => item.id === id)!.seeds]
}

/** Opens the app with empty storage. Each Playwright test already has a fresh browser context. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.locator('#ticket-title')).toBeVisible()
}

export const checklist = (page: Page) => page.locator('section.checklist')
export const checkRow = (page: Page, label: string) => checklist(page).locator('li.check').filter({ has: page.locator('.check-label', { hasText: label }) })
export async function expectCheck(page: Page, label: string, status: 'Done' | 'Not yet' | 'Waiting') {
  const pattern = status === 'Done' ? /^Done( just now)?$/ : new RegExp(`^${status}$`)
  await expect(checkRow(page, label).locator('.check-status')).toHaveText(pattern)
}

/** Opens the Work screen on a work-area tab, from the Read screen or from the Work screen. */
export async function workTab(page: Page, tab: 'PowerShell' | 'Directory' | 'Evidence') {
  const start = page.getByRole('button', { name: `Start in ${tab}` })
  if (tab !== 'Evidence' && await start.isVisible()) { await start.click(); return }
  if (await page.locator('#ticket-title').isVisible()) await page.getByRole('button', { name: 'Start in PowerShell' }).click()
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
}

const transcript = (page: Page) => page.locator('.console .transcript')

/**
 * Types one line into the console and presses Enter. Answers a simulated secure prompt with
 * LAB_PASSWORD and a confirmation prompt with Yes. Returns the new transcript text.
 */
export async function typeCommand(page: Page, code: string, options: { password?: string; confirm?: boolean } = {}) {
  await workTab(page, 'PowerShell')
  const before = await transcript(page).locator('.entry.input').count()
  const input = page.getByRole('textbox', { name: 'PowerShell command' })
  await input.fill(code)
  await input.press('Enter')
  const secure = page.locator('.console input#secure')
  const yes = page.getByRole('group', { name: 'Confirmation prompt' }).getByRole('button', { name: options.confirm === false ? 'No' : 'Yes' })
  for (let prompt = 0; prompt < 4; prompt += 1) {
    const done = transcript(page).locator('.entry.input').nth(before)
    await expect(done.or(secure).or(yes)).toBeVisible()
    if (await secure.isVisible()) { await secure.fill(options.password ?? LAB_PASSWORD); await secure.press('Enter'); continue }
    if (await yes.isVisible()) { await yes.click(); continue }
    break
  }
  await expect(transcript(page).locator('.entry.input').nth(before)).toBeVisible()
  return (await transcript(page).innerText())
}

export async function typeScript(page: Page, steps: ScriptStep[]) {
  for (const step of steps) await typeCommand(page, step.code)
}

/** The console transcript must not contain an error line. */
export async function expectNoConsoleError(page: Page) {
  await expect(transcript(page).locator('.entry.error')).toHaveCount(0)
}

// ---------------------------------------------------------------------------------------------
// GUI route: click the same path the case lists in routes.gui (CONTRACTS s9).

const introduced = (fixture: CaseFixture) => fixture.introduce(buildBaseDomain().state)
const nameOfGuid = (fixture: CaseFixture, guid: string) => {
  const state = introduced(fixture)
  const object = state.objects[guid as keyof typeof state.objects]
  return object ? displayName(object) : guid
}

/** Scrolls the windowed tree until the row is mounted. Returns false when it never appears. */
async function revealRow(page: Page, row: Locator) {
  const tree = page.getByRole('tree')
  await tree.evaluate((element) => { element.scrollTop = 0 })
  for (let step = 0; step < 60; step += 1) {
    if (await row.count() > 0) { await row.first().scrollIntoViewIfNeeded(); return true }
    const moved = await tree.evaluate((element) => { const before = element.scrollTop; element.scrollTop += element.clientHeight / 2; return element.scrollTop !== before })
    if (!moved) return await row.count() > 0
  }
  return false
}
const rowByName = (page: Page, name: string) => page.getByRole('tree').getByRole('treeitem').filter({ has: page.locator('.tree-name', { hasText: new RegExp(`^${escape(name)}$`) }) })

/** Selects a row by GUID when known (two objects can share a display name), else by name. Opens a container's children. */
export async function selectTreeItem(page: Page, name: string, guid?: string, open = false) {
  const row = guid ? page.locator(`[role="treeitem"][id="tree-${guid}"]`) : rowByName(page, name)
  if (!await revealRow(page, row)) throw new Error(`Tree row ${name} not found`)
  await row.first().click()
  await expect(row.first()).toHaveAttribute('aria-selected', 'true')
  if (open && await row.first().getAttribute('aria-expanded') === 'false') await row.first().getByRole('button', { name: `Expand ${name}` }).click()
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Clicks through one routes.gui step in the real page. */
export async function clickGuiStep(page: Page, fixture: CaseFixture, step: GuiStep) {
  const path = step.path
  const action = step.action as Record<string, unknown> & { type: string }
  let editor: Locator | undefined
  const form = (label: string) => page.getByRole('form', { name: label })
  if (path[0] === 'What done looks like') {
    await page.getByRole('button', { name: path[1]! }).click()
    return
  }
  expect(path[0]).toBe('Directory')
  await workTab(page, 'Directory')
  await selectTreeItem(page, path[1]!, undefined, true)
  const objectGuid = (action.target ?? action.member ?? action.user) as string | undefined
  for (let index = 2; index < path.length; index += 1) {
    const part = path[index]!
    const next = path[index + 1]
    if (part === 'Properties') continue
    if (part === 'New user…') { await page.getByRole('group', { name: 'Quick actions' }).getByRole('button', { name: 'New user' }).click(); editor = form('New user'); continue }
    if (['General', 'Account', 'Groups'].includes(part)) { await page.getByRole('tab', { name: part, exact: true }).click(); continue }
    if (part === 'Actions') {
      await page.getByRole('button', { name: 'Actions', exact: true }).click()
      await page.getByRole('menuitem', { name: next! }).click()
      editor = next === 'Move…' ? form('Move') : form('Account options')
      index += 1
      continue
    }
    if (part === 'Unlock account' || part === 'User must change password at next sign-in') { editor = form('Account options'); await editor.getByLabel(part).check(); continue }
    if (part === 'Add to a group…') {
      editor = form('Group membership')
      const group = nameOfGuid(fixture, action.group as string)
      if (next === 'Add to group') index += 2
      await editor.getByLabel('Add to group').selectOption({ label: await optionLabel(editor.getByLabel('Add to group'), group) })
      continue
    }
    if (part.startsWith('Remove from ')) { editor = form('Group membership'); await editor.getByLabel(part).check(); continue }
    if (part === 'Move to') { editor = form('Move'); await editor.getByLabel('Move to').selectOption({ label: next! }); index += 1; continue }
    if (part === 'Full name') { await form('New user').getByLabel('Full name').fill(String(action.name)); continue }
    if (part === 'Sign-in name (sAMAccountName)') { await form('New user').getByLabel(part).fill(String(action.samAccountName)); continue }
    if (part === 'Initial password (simulated, optional)') { await form('New user').getByLabel(part).fill(LAB_PASSWORD); continue }
    if (part === 'Turn on the account (needs a valid simulated password)') { await form('New user').getByLabel(part).setChecked(action.enabled === true); continue }
    if (part === 'Create' || part === 'Apply') {
      const target = editor ?? page
      await target.getByRole('button', { name: part, exact: true }).click()
      await expect(target.getByRole('status').filter({ hasText: 'Saved · simulated' })).toBeVisible()
      continue
    }
    // Anything else is the object to select inside the container.
    await selectTreeItem(page, part, objectGuid && [part, objectGuid].includes(nameOfGuid(fixture, objectGuid)) ? objectGuid : undefined)
  }
}

async function optionLabel(select: Locator, name: string) {
  const labels = await select.locator('option').allInnerTexts()
  const found = labels.find((label) => label === name || label.startsWith(`${name} ·`))
  if (!found) throw new Error(`No option for ${name} in ${labels.join(' | ')}`)
  return found
}

export async function clickGuiRoute(page: Page, fixture: CaseFixture) {
  for (const step of fixture.routes.gui) await clickGuiStep(page, fixture, step)
}

// ---------------------------------------------------------------------------------------------
// Campaign navigation: cases open in order, so reaching case N plays cases 1..N-1 first.

export async function finishCase(page: Page) {
  await page.getByRole('button', { name: 'Finish case', exact: true }).click()
  await expect(page.locator('#debrief-title')).toBeVisible()
}

/**
 * Plays every earlier case by its GUI route, then opens the wanted case and seed on the Read screen.
 * GUI, so each script-route spec types only the case under test.
 */
export async function reachCase(page: Page, id: string, seed: number) {
  await openApp(page)
  for (const earlier of caseIds.slice(0, caseIds.indexOf(id))) {
    await expect(page.locator('.read .case-chip').first()).toHaveText(earlier)
    await clickGuiRoute(page, fixtureOf(earlier, 1))
    await finishCase(page)
    await page.getByRole('button', { name: 'Next ticket' }).click()
  }
  await expect(page.locator('.read .case-chip').first()).toHaveText(id)
  if (seed === 1) return
  // Seed 2 is offered as a replay of a completed case ("Try this case again, new details").
  await clickGuiRoute(page, fixtureOf(id, 1))
  await finishCase(page)
  await page.getByRole('button', { name: 'Try this case again, new details' }).click()
  await expect(page.locator('.read .case-chip').first()).toHaveText(id)
  await expect(page.getByText(fixtureOf(id, seed).request.who.account, { exact: true }).first()).toBeVisible()
}


/** Opens each ancestor container from the top, then selects the object by GUID. */
export async function selectObject(page: Page, state: ReturnType<CaseFixture['introduce']>, guid: string) {
  const chain: string[] = []
  for (let at = state.objects[guid as keyof typeof state.objects]?.parent; at; at = state.objects[at]?.parent) chain.unshift(at)
  for (const ancestor of chain.slice(1)) await selectTreeItem(page, displayName(state.objects[ancestor as keyof typeof state.objects]!), ancestor, true)
  await selectTreeItem(page, displayName(state.objects[guid as keyof typeof state.objects]!), guid)
}
