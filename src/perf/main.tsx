import React from 'react'
import { createRoot } from 'react-dom/client'
import { buildLargeDomain } from '../fixtures/large'
import { case01 } from '../tickets/cases/case01'
import { createCampaign, introduceTicket } from '../tickets/engine'
import { actions, seedPerformanceCampaign, useStore } from '../ui/store'
import AuditLog from '../ui/log/AuditLog'
import Checklist from '../ui/criteria/Checklist'
import ReadScreen from '../ui/ticket/ReadScreen'
// @ts-expect-error Vite bundles CSS imports at runtime.
import './perf.css'

declare global {
  interface Window {
    __adShieldPerfSamples: { filter: number[]; ticket: number[] }
  }
}

const largeState = buildLargeDomain(1)
const fixture = case01.build(1)
const initialCampaign = introduceTicket(createCampaign(largeState, [fixture.ticketId]), case01, 1)
seedPerformanceCampaign(initialCampaign)
window.__adShieldPerfSamples = { filter: [], ticket: [] }

function stopAtRenderedFrame(kind: 'filter' | 'ticket', root: Element, rendered: () => boolean, started: number) {
  const observer = new MutationObserver(() => {
    if (!rendered()) return
    observer.disconnect()
    requestAnimationFrame(() => window.__adShieldPerfSamples[kind].push(performance.now() - started))
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true })
}

document.addEventListener('input', (event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || input.labels?.[0]?.textContent?.trim() !== 'Text') return
  const root = input.closest('[aria-label="Audit log performance"]')
  const list = root?.querySelector('.log-list')
  if (!root || !list) return
  const started = performance.now()
  stopAtRenderedFrame('filter', root, () => {
    const count = root.querySelector('p[aria-live="polite"]')?.textContent ?? ''
    const row = list.querySelector('[role="listitem"]')?.textContent ?? ''
    return count.startsWith('1 of 10000 events') && row.length > 0
  }, started)
}, true)

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-perf-ticket-edit]')) return
  const root = document.querySelector('[data-testid="ticket-checklist"]')
  if (!root) return
  const started = performance.now()
  stopAtRenderedFrame('ticket', root, () => {
    const row = [...root.querySelectorAll('li.check')].find((item) => item.textContent?.includes("Maya's account is unlocked"))
    return row?.querySelector('.check-status')?.textContent?.includes('Done') ?? false
  }, started)
}, true)

function PerfApp() {
  const attempt = useStore((value) => value.campaign.active)!
  const applyEdit = () => {
    const result = actions.dispatchGui({ type: 'user.unlock', target: fixture.ids.target! }, attempt.state.revision)
    if (!result.ok || result.state === attempt.state) throw new Error('Performance ticket edit failed')
  }

  return <main>
    <h1>AD Shield performance run</h1>
    <section aria-label="Audit log performance"><AuditLog state={largeState} /></section>
    <section aria-label="Ticket refresh performance">
      <h2>Ticket refresh</h2>
      <ReadScreen fixture={fixture} readOnly />
      <div data-testid="ticket-checklist"><Checklist attempt={attempt} fixture={fixture} /></div>
      <button type="button" data-perf-ticket-edit onClick={applyEdit}>Apply one edit and refresh ticket</button>
      <button type="button" onClick={() => seedPerformanceCampaign(initialCampaign)}>Reset ticket sample</button>
    </section>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><PerfApp /></React.StrictMode>)
