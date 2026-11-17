// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { actions, resetStore } from '../../../src/ui/store'
import { splitExplain } from '../../../src/ui/hints/Hints'
import { buildBaseDomain } from '../../../src/fixtures/baseDomain'
import { case01 } from '../../../src/tickets/cases/case01'
import { createCampaign, introduceTicket } from '../../../src/tickets/engine'
import { activeFixture, rail } from '../ticket/helpers'

beforeEach(() => { localStorage.clear(); resetStore() })
afterEach(cleanup)

const runs = (code: string) => screen.queryAllByText(`PS C:\\Lab> ${code}`).length
const transcriptHas = (code: string) => runs(code) > 0

describe('hints', () => {
  it('opens one level at a time and never runs anything by itself', async () => {
    const user = userEvent.setup(); render(<App />)
    const fixture = activeFixture()
    const stuck = within(screen.getByRole('region', { name: 'Stuck?' }))
    expect(stuck.queryByText(/Hint 1 of 3/)).toBeNull()
    await user.click(stuck.getByRole('button', { name: 'Show hint 1 of 3' }))
    expect(stuck.getByText(/Hint 1 of 3/)).toBeInTheDocument()
    expect(stuck.queryByText(/Hint 2 of 3/)).toBeNull()
    await user.click(stuck.getByRole('button', { name: 'Show hint 2 of 3' }))
    await user.click(stuck.getByRole('button', { name: 'Show hint 3 of 3' }))
    // Opening level 3 shows the first line but runs nothing.
    for (const step of fixture.routes.script) expect(transcriptHas(step.code)).toBe(false)
    expect(stuck.getByText(fixture.routes.gui[0]!.path.join(' → '))).toBeInTheDocument()
  })

  it('level 3 runs one line at a time and shows the explanation for each output', async () => {
    const user = userEvent.setup(); render(<App />)
    const steps = activeFixture().routes.script
    const stuck = within(screen.getByRole('region', { name: 'Stuck?' }))
    for (const level of [1, 2, 3]) await user.click(stuck.getByRole('button', { name: `Show hint ${level} of 3` }))
    for (const [index, step] of steps.entries()) {
      const { meaning } = splitExplain(step.explain)
      expect(stuck.getByText(`Step ${index + 1} of ${steps.length}`)).toBeInTheDocument()
      expect(stuck.queryByText(meaning)).toBeNull()
      const expected = steps.slice(0, index + 1).filter((earlier) => earlier.code === step.code).length
      await user.click(stuck.getByRole('button', { name: 'Run this line' }))
      expect(runs(step.code)).toBe(expected)
      expect(stuck.getByText(meaning)).toBeInTheDocument()
      // Every line so far ran exactly as often as the learner clicked: nothing ran ahead.
      for (const code of new Set(steps.map((s) => s.code))) expect(runs(code)).toBe(steps.slice(0, index + 1).filter((s) => s.code === code).length)
      if (steps[index + 1]) await user.click(stuck.getByRole('button', { name: 'Next line' }))
    }
    expect(stuck.getByText(/That was the last line/)).toBeInTheDocument()
  })

  it('starts closed again for every ticket', async () => {
    const user = userEvent.setup(); render(<App />)
    await user.click(rail().getByRole('button', { name: 'Show hint 1 of 3' }))
    expect(rail().getByText(/Hint 1 of 3/)).toBeInTheDocument()
    act(() => actions.setCampaign(introduceTicket(createCampaign(buildBaseDomain().state, ['case01']), case01, 2)))
    expect(rail().queryByText(/Hint 1 of 3/)).toBeNull()
    expect(rail().getByRole('button', { name: 'Show hint 1 of 3' })).toBeInTheDocument()
  })
})
