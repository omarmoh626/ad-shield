// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccessInspector from '../../../src/ui/inspectors/access/AccessInspector'
import App from '../../../src/App'
import { actions, getStore, resetStore } from '../../../src/ui/store'

beforeEach(() => resetStore())
afterEach(cleanup)

const state = () => getStore().campaign.active!.state
const bySam = (sam: string) => Object.values(state().objects).find((object) => object.attrs.sAMAccountName === sam)!

describe('access inspector', () => {
  it('for a user, the Finance share, and read: shows the role path and both layers', async () => {
    const user = userEvent.setup()
    const before = state()
    render(<AccessInspector state={before} />)
    await user.selectOptions(screen.getByLabelText('Who'), bySam('kmorita').guid)
    await user.selectOptions(screen.getByLabelText('Share'), 'share.finance')
    await user.selectOptions(screen.getByLabelText('Right'), 'read')
    expect(screen.getByRole('status')).toHaveTextContent('Result: Allowed')
    expect(screen.getByRole('status')).toHaveTextContent('through a group (role)')
    expect(screen.getAllByText('Kenji Morita → GG-Finance-Staff → DL-Finance-Share-Read')[0]).toBeVisible()
    const share = screen.getByText('Share layer').closest('.layer') as HTMLElement
    const file = screen.getByText('File layer (NTFS)').closest('.layer') as HTMLElement
    for (const layer of [share, file]) {
      expect(layer).toHaveTextContent('Allowed · decided by Allow Read for DL-Finance-Share-Read')
      expect(within(layer).getAllByRole('listitem').length).toBeGreaterThan(1)
      expect(layer).toHaveTextContent('does not apply')
    }
    expect(screen.getByText(/models two layers/)).toBeInTheDocument()
    expect(state()).toBe(before)
  })

  it('shows a person outside the role as not allowed, and a direct grant as direct', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AccessInspector state={state()} initial={bySam('pnair').guid} />)
    await user.selectOptions(screen.getByLabelText('Share'), 'share.finance')
    expect(screen.getByRole('status')).toHaveTextContent('Result: Not allowed')
    expect(screen.getByText(/No group of Priya Nair has an entry/)).toBeInTheDocument()
    act(() => { actions.dispatchGui({ type: 'acl.addEntry', resource: 'share.finance', trustee: bySam('pnair').guid, right: 'read' }, state().revision) })
    rerender(<AccessInspector state={state()} initial={bySam('pnair').guid} />)
    expect(screen.getByRole('status')).toHaveTextContent('through a direct grant to the person')
  })

  it('sits in the Evidence tab after the audit log and starts on the selected person', async () => {
    const user = userEvent.setup(); render(<App />)
    act(() => actions.setSelectedObject(bySam('kmorita').guid))
    await user.click(screen.getByRole('tab', { name: /^Evidence/ }))
    const sections = [...document.querySelectorAll('#panel-Evidence section')].map((section) => section.getAttribute('aria-labelledby'))
    expect(sections.slice(0, 2)).toEqual(['audit-log-title', 'access-title'])
    expect(screen.getByLabelText('Who')).toHaveValue(bySam('kmorita').guid)
  })
})
