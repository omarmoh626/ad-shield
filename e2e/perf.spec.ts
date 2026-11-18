import { expect, test } from '@playwright/test'
import os from 'node:os'

const percentile95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!
const report = (name: string, values: number[]) => {
  const p95 = percentile95(values)
  console.log(`${name}: p95 ${p95.toFixed(2)} ms; target 200 ms; ${p95 <= 200 ? 'met' : 'missed'}`)
}

test('measures visible filtering and ticket refresh latency', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await page.goto('/perf.html')
  await expect(page.getByRole('heading', { name: 'AD Shield performance run' })).toBeVisible()

  const filter = page.getByLabel('Text', { exact: true })
  const resultCount = page.locator('[aria-live="polite"]').filter({ hasText: /of 10000 events/ })
  const filterRuns: number[] = []
  for (let index = 0; index < 30; index += 1) {
    const query = index % 2 === 0 ? 'event-10000' : 'event-09999'
    await filter.fill(query)
    await expect(resultCount).toHaveText('1 of 10000 events, newest first')
    await expect.poll(() => page.evaluate(() => window.__adShieldPerfSamples.filter.length)).toBe(index + 1)
    filterRuns.push(...await page.evaluate((at) => window.__adShieldPerfSamples.filter.slice(at, at + 1), index))
  }

  const refreshRuns: number[] = []
  for (let index = 0; index < 30; index += 1) {
    await page.getByRole('button', { name: 'Apply one edit and refresh ticket' }).click()
    const row = page.locator('.checklist li.check').filter({ hasText: "Maya's account is unlocked" })
    await expect(row.locator('.check-status')).toHaveText(/Done/)
    await expect.poll(() => page.evaluate(() => window.__adShieldPerfSamples.ticket.length)).toBe(index + 1)
    refreshRuns.push(...await page.evaluate((at) => window.__adShieldPerfSamples.ticket.slice(at, at + 1), index))
    if (index < 29) {
      await page.getByRole('button', { name: 'Reset ticket sample' }).click()
      await expect(row.locator('.check-status')).toHaveText('Not yet')
    }
  }

  report('Audit log filter (input to rendered result)', filterRuns)
  report('Ticket refresh after one edit (click to rendered result)', refreshRuns)
  console.log(`Browser: Chromium ${browser.version()}; machine: ${os.type()} ${os.release()} ${os.arch()} (${os.cpus()[0]?.model ?? 'unknown CPU'})`)
  expect(filterRuns).toHaveLength(30)
  expect(refreshRuns).toHaveLength(30)
})
