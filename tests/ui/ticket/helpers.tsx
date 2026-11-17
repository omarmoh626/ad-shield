import { act, screen, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { actions, getStore } from '../../../src/ui/store'
import { getTicket } from '../../../src/tickets/cases'

export const activeFixture = () => {
  const active = getStore().campaign.active!
  return getTicket(active.id)!.build(active.seed)
}

export const statusOf = (id: string) => getStore().campaign.active?.predicates.find((p) => p.id === id)?.status

export const rail = () => within(document.querySelector<HTMLElement>('[data-region="left"]')!)

/** Types one line into the console and presses Enter, the way a learner does. */
export async function type(user: UserEvent, line: string) {
  const input = screen.getByRole('textbox', { name: 'PowerShell command' })
  await user.clear(input)
  await user.type(input, line.replace(/[{[]/g, (c) => c + c))
  await user.keyboard('{Enter}')
}

/** Solves the active case 01 variant with the terminal only: the script route, then the simulated sign-in row action. */
export async function solveWithTerminal(user: UserEvent) {
  const fixture = activeFixture()
  act(() => actions.startInvestigating())
  for (const step of fixture.routes.script) await type(user, step.code)
  await user.click(rail().getByRole('button', { name: /sign-in · simulated/ }))
}

/** Text a sighted learner sees: hidden nodes (closed term definitions) removed. */
export function visibleText(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[hidden]').forEach((node) => node.remove())
  return (copy.textContent ?? '').replace(/\s+/g, ' ')
}
