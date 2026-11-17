// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../../src/App'
import { getStore, resetStore } from '../../../src/ui/store'

beforeEach(resetStore)
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('workspace top bar', () => {
  it('pauses the SLA display and advances lab time only on explicit action', async () => {
    vi.useFakeTimers()
    render(<App />)
    const initial = getStore().campaign.active!.state.now
    const revision = getStore().campaign.active!.state.revision
    const events = getStore().campaign.active!.state.events.length
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByLabelText('SLA remaining')).toHaveTextContent('00:30:00')
    expect(getStore().campaign.active!.state.now).toBe(initial)
    expect(getStore().campaign.active!.state.revision).toBe(revision)
    expect(getStore().campaign.active!.state.events).toHaveLength(events)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    act(() => vi.advanceTimersByTime(2_000))
    expect(screen.getByLabelText('SLA remaining')).toHaveTextContent('00:29:58')
    expect(getStore().campaign.active!.state.now).toBe(initial)
    fireEvent.click(screen.getByRole('button', { name: 'Advance lab time' }))
    expect(getStore().campaign.active!.state.now).toBe(initial + 60_000)
    expect(getStore().campaign.active!.history.at(-1)?.action.type).toBe('clock.advance')
  })

  it('updates save status and persists committed campaign actions', () => {
    localStorage.clear()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Advance lab time' }))
    expect(localStorage.getItem('adshield.v1')).toBeTruthy()
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Saved')).toBe(true)
  })

  it('reaches every interactive control by keyboard and announces toast updates', async () => {
    const user = userEvent.setup(); render(<App />)
    const controls = [...document.querySelectorAll<HTMLElement>('button,input,textarea,summary')]
    const reached = new Set<HTMLElement>()
    for (let index = 0; index < controls.length + 2; index += 1) {
      await user.tab()
      if (document.activeElement instanceof HTMLElement) reached.add(document.activeElement)
    }
    expect(controls.every((control) => reached.has(control))).toBe(true)
    expect(screen.getAllByRole('status').some((node) => node.getAttribute('aria-live') === 'polite')).toBe(true)
  })
})
