import { useSyncExternalStore } from 'react'
import { OPERATOR_ID, buildBaseDomain } from '../fixtures/baseDomain'
import { applyAttemptAction, closeTicket, createCampaign, introduceTicket, recordCommittedAction, resetAttempt, startReplay } from '../tickets/engine'
import { case01 } from '../tickets/cases/case01'
import { TICKETS, getTicket } from '../tickets/cases'
import type { Attempt, CampaignState, CaseFixture } from '../tickets/types'
import { PersistSession, browserStorage, browserWriterLock, fullSlaMs as fullSlaFor } from '../persist'
import { dispatch } from '../engine/dispatch'
import type { Action, ActionResult } from '../engine/types'
import type { Guid } from '../domain/types'

export interface DebriefView {
  attempt: Attempt
  /** First completion of this case. A replay or a repeat never counts (CONTRACTS s9). */
  firstTime: boolean
}

export interface UiState {
  campaign: CampaignState
  screen: 'Inbox' | 'Read' | 'Work' | 'Debrief'
  tab: 'PowerShell' | 'Directory' | 'Evidence'
  draft: string
  paused: boolean
  /** D4: UI-only SLA countdown. Real timers tick it; it never dispatches or touches domain state. */
  sla: { caseKey: string; remainingMs: number }
  saveStatus: 'Saved' | 'Saving…' | 'Not saved' | 'Read only'
  notices: string[]
  toast: string
  /** Ticket ID shown on the Read screen as a read-only inbox preview. */
  preview?: string
  /** The attempt the Debrief screen describes. */
  debrief?: DebriefView
  /** Narrow screens: whether the checklist rail is open. */
  railOpen: boolean
  /** The engine's last refusal to close the active case: one "label: observed …; required …" line per unmet check. */
  closeRefusal?: string[]
  /** Bumped to ask the mounted console for focus after the next render (it is hidden until then). */
  focusRequest: number
  selectedObject: Guid | null
}

/** Saves the SLA countdown every this many real seconds while it runs (D4). */
const SLA_SAVE_EVERY = 10

const base = buildBaseDomain()
const tabId = globalThis.crypto?.randomUUID?.() ?? 'ad-shield-tab'
const persistence = new PersistSession({ storage: browserStorage(), lookup: getTicket, tab: tabId, queue: ['case01'], lock: browserWriterLock() })
const loaded = persistence.load()
let campaign = loaded.resumed ? loaded.campaign : introduceTicket(loaded.campaign, case01, 1)

/** Full SLA for the active case, read from its fixture request text ("30 minutes (simulated)"). */
export function fullSlaMs(value: CampaignState): number { return fullSlaFor(value.active, getTicket) }
const caseKey = (value: CampaignState) => value.active ? `${value.active.id}:${value.active.seed}:${value.active.replay ? 'replay' : 'live'}` : ''
const slaFrom = (value: CampaignState) => ({ caseKey: caseKey(value), remainingMs: value.slaRemainingMs ?? fullSlaMs(value) })
const saveStatusText = () => ({ saved: 'Saved', saving: 'Saving…', notSaved: 'Not saved', readOnly: 'Read only' } as const)[persistence.status]
const fixtureFor = (attempt: Attempt): CaseFixture | undefined => getTicket(attempt.id)?.build(attempt.seed)

// D7: the app opens on the active case's Read screen with the console mounted behind it; with no active case, on the inbox.
let state: UiState = { campaign, screen: campaign.active ? 'Read' : 'Inbox', tab: 'PowerShell', draft: '', paused: false, sla: slaFrom(campaign), saveStatus: saveStatusText(), notices: loaded.notices.map((notice) => notice.message), toast: '', railOpen: false, focusRequest: 0, selectedObject: null }
let ticksSinceSave = 0
const listeners = new Set<() => void>()
const publish = (next: UiState) => { state = next; listeners.forEach((listener) => listener()) }
const updateStatus = () => publish({ ...state, saveStatus: saveStatusText(), notices: [...persistence.notices.map((notice) => notice.message)] })
persistence.subscribe(updateStatus)
persistence.claimWriter((result) => actions.setCampaign(result.campaign))
updateStatus()
if (!loaded.resumed) persistence.save({ ...campaign, slaRemainingMs: state.sla.remainingMs })

/** Adds catalog cases to the queue as the shift progresses: one new case each time a case closes. */
function queueNext(value: CampaignState): CampaignState {
  const next = TICKETS.find((ticket) => !value.queue.includes(ticket.id) && !value.completed.includes(ticket.id))
  return next ? { ...value, queue: [...value.queue, next.id] } : value
}

export const operatorGuid = base.ids[OPERATOR_ID]
let terminalHandle: { runLine(text: string): void; setDraft(text: string): void; focus(): void } | undefined
export const actions = {
  setCampaign(value: CampaignState) {
    if (value === state.campaign) return
    // A new case or variant restarts the countdown; changes inside one attempt keep it.
    // A carried-over slaRemainingMs belongs to the previous case, so a new key always starts the full SLA.
    const key = caseKey(value)
    const sla = key === state.sla.caseKey ? state.sla : { caseKey: key, remainingMs: fullSlaMs(value) }
    const next = { ...value, slaRemainingMs: sla.remainingMs }
    // Any campaign change makes an earlier close refusal stale.
    publish({ ...state, campaign: next, sla, closeRefusal: undefined })
    persistence.save(next)
    ticksSinceSave = 0
    updateStatus()
  },
  setScreen(screen: UiState['screen']) { publish({ ...state, screen, ...(screen === 'Read' ? {} : { preview: undefined }) }) },
  setTab(tab: UiState['tab']) { publish({ ...state, tab }) },
  setDraft(draft: string) { publish({ ...state, draft }) },
  togglePaused() {
    publish({ ...state, paused: !state.paused })
    if (state.campaign.active) { persistence.save(state.campaign); ticksSinceSave = 0; updateStatus() }
  },
  /** Called by the real timer in src/ui. Pause stops it. Lab time and revision never change here (D4). */
  tickSla(milliseconds: number) {
    if (state.paused || state.sla.remainingMs === 0) return
    const remainingMs = Math.max(0, state.sla.remainingMs - milliseconds)
    const next = { ...state.campaign, slaRemainingMs: remainingMs }
    publish({ ...state, campaign: next, sla: { ...state.sla, remainingMs } })
    ticksSinceSave += 1
    if (ticksSinceSave >= SLA_SAVE_EVERY || remainingMs === 0) { persistence.save(next); ticksSinceSave = 0; updateStatus() }
  },
  advanceTime(milliseconds: number) {
    const attempt = state.campaign.active
    if (!attempt) return
    const fixture = fixtureFor(attempt)
    if (!fixture) return
    const applied = applyAttemptAction(attempt, fixture, { type: 'clock.advance', milliseconds }, operatorGuid, 'gui')
    if (applied.attempt !== attempt) actions.setCampaign({ ...state.campaign, active: applied.attempt })
  },
  handleStorageEvent(key: string | null, newValue: string | null) { persistence.handleStorageEvent(key, newValue); updateStatus() },
  terminal: {
    register(handle: typeof terminalHandle) { terminalHandle = handle },
    /** Shows the PowerShell tab, then runs the line in the mounted terminal. */
    runLine(text: string) { if (state.screen !== 'Work' || state.tab !== 'PowerShell') publish({ ...state, screen: 'Work', tab: 'PowerShell' }); terminalHandle?.runLine(text) },
    setDraft(text: string) { terminalHandle?.setDraft(text) },
    focus() { terminalHandle?.focus() },
  },
  toast(message: string) { publish({ ...state, toast: message }) },

  // T06 P2 actions (D6). Each one goes through the ticket engine.
  /** Opens the Work screen on the PowerShell tab and focuses the console. */
  startInvestigating(tab: 'PowerShell' | 'Directory' = 'PowerShell') {
    publish({ ...state, screen: 'Work', tab, preview: undefined, focusRequest: tab === 'PowerShell' ? state.focusRequest + 1 : state.focusRequest })
  },
  setSelectedObject(selectedObject: Guid | null) { publish({ ...state, selectedObject }) },
  /** Dispatches a GUI action through the shared pipeline and returns its result unchanged. */
  dispatchGui(action: Action, baseRevision: number): ActionResult {
    const attempt = state.campaign.active
    const fixture = attempt && fixtureFor(attempt)
    // Without an open case there is nowhere to keep a change, so nothing is dispatched.
    if (!attempt || !fixture) return { ok: false, state: attempt?.state ?? state.campaign.base, events: [], diff: [], warnings: [], error: 'invalid', message: 'No case is open. Pick one from the inbox.' }
    const result = dispatch(attempt.state, action, { actor: operatorGuid, source: 'gui', whatIf: false, baseRevision })
    if (result.ok && result.state !== attempt.state) actions.setCampaign(recordCommittedAction(state.campaign, fixture, action, result, 'gui'))
    return result
  },
  /** Shows a queued case's ticket in read-only mode. It never changes campaign state. */
  openPreview(ticketId: string) { publish({ ...state, screen: 'Read', preview: ticketId }) },
  /** Opens the active case's ticket. */
  openActive() { publish({ ...state, screen: 'Read', preview: undefined }) },
  /** Narrow screens: the progress line opens the checklist rail on the Work screen. */
  toggleRail() { publish({ ...state, railOpen: !state.railOpen, ...(state.railOpen ? {} : { screen: 'Work' as const, preview: undefined }) }) },
  /** Asks the engine to close the active case. The engine's predicate check decides; this never bypasses it. */
  closeCase(): { closed: boolean; refusal?: string[] } {
    const attempt = state.campaign.active
    if (!attempt) return { closed: false, refusal: ['No case is active.'] }
    const fixture = fixtureFor(attempt)
    if (!fixture) return { closed: false, refusal: [`Case ${attempt.id} is not in the catalog.`] }
    const firstTime = !attempt.replay && !state.campaign.completed.includes(attempt.id)
    const result = closeTicket(state.campaign, fixture)
    if (!result.closed || !result.attempt) {
      publish({ ...state, closeRefusal: result.refusal })
      actions.toast(`Not closed yet: ${result.refusal?.length ?? 0} checks to go.`)
      return { closed: false, refusal: result.refusal }
    }
    // A replay closes without touching completions; the engine leaves it active, so clear it here.
    const closedCampaign = attempt.replay ? { ...result.campaign, active: undefined } : result.campaign
    publish({ ...state, screen: 'Debrief', debrief: { attempt: result.attempt, firstTime }, closeRefusal: undefined })
    actions.setCampaign(queueNext(closedCampaign))
    actions.toast(firstTime ? 'Case closed · first time solved' : 'Case closed · replay, not counted')
    return { closed: true }
  },
  /** Restores the active attempt to its checkpoint. Completions and the cheat sheet (built from history) stay. */
  resetAttempt() {
    const attempt = state.campaign.active
    const fixture = attempt && fixtureFor(attempt)
    if (!attempt || !fixture) return
    actions.setCampaign(resetAttempt(state.campaign, fixture))
    actions.toast('Attempt reset · the case is back where it started')
  },
  /** Opens the next queued case that is not complete, or the inbox when none is waiting. */
  nextCase() {
    if (state.campaign.active) { actions.openActive(); return }
    const ticket = state.campaign.queue.map((id) => getTicket(id)).find((def) => def && !state.campaign.completed.includes(def.id))
    if (!ticket) { publish({ ...state, screen: 'Inbox', preview: undefined }); actions.toast('No new tickets yet. More arrive as the shift progresses.'); return }
    actions.setCampaign(introduceTicket(state.campaign, ticket, ticket.seeds[0]!))
    publish({ ...state, screen: 'Read', preview: undefined, debrief: undefined })
  },
  /** Offers a fresh variation of a completed case as an isolated replay that cannot award a second completion. */
  startVariation(ticketId: string, afterSeed: number) {
    const ticket = getTicket(ticketId)
    if (!ticket || state.campaign.active || !state.campaign.completed.includes(ticketId)) return
    const index = ticket.seeds.indexOf(afterSeed)
    const seed = ticket.seeds[(index + 1) % ticket.seeds.length]!
    actions.setCampaign({ ...state.campaign, active: startReplay(state.campaign, ticket, seed) })
    publish({ ...state, screen: 'Read', preview: undefined, debrief: undefined })
  },
}
export function useStore<T>(selector: (value: UiState) => T): T {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => selector(state), () => selector(state))
}
export const getStore = () => state
/** Test helper: a fresh case 01 attempt on the Work screen. */
export function resetStore() {
  campaign = introduceTicket(createCampaign(base.state, ['case01']), case01, 1)
  publish({ campaign, screen: 'Work', tab: 'PowerShell', draft: '', paused: false, sla: slaFrom(campaign), saveStatus: saveStatusText(), notices: [], toast: '', railOpen: false, focusRequest: 0, selectedObject: null })
  persistence.save(campaign)
}
