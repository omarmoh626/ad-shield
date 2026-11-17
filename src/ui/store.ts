import { useSyncExternalStore } from 'react'
import { OPERATOR_ID, buildBaseDomain } from '../fixtures/baseDomain'
import { applyAttemptAction, createCampaign, introduceTicket } from '../tickets/engine'
import { case01 } from '../tickets/cases/case01'
import { getTicket } from '../tickets/cases'
import type { CampaignState } from '../tickets/types'
import { PersistSession, browserStorage, browserWriterLock } from '../persist'

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
}

const base = buildBaseDomain()
const tabId = globalThis.crypto?.randomUUID?.() ?? 'ad-shield-tab'
const persistence = new PersistSession({ storage: browserStorage(), lookup: getTicket, tab: tabId, queue: ['case01'], lock: browserWriterLock() })
let loaded = persistence.load()
let campaign = loaded.resumed ? loaded.campaign : introduceTicket(loaded.campaign, case01, 1)
/** Full SLA for the active case, read from its fixture request text ("30 minutes (simulated)"). */
export function fullSlaMs(value: CampaignState): number {
  const attempt = value.active
  const sla = attempt ? getTicket(attempt.id)?.build(attempt.seed).request.sla : undefined
  const minutes = Number(sla?.match(/\d+/)?.[0])
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0
}
const caseKey = (value: CampaignState) => value.active ? `${value.active.id}:${value.active.seed}` : ''
const freshSla = (value: CampaignState) => ({ caseKey: caseKey(value), remainingMs: fullSlaMs(value) })
const saveStatusText = () => ({ saved: 'Saved', saving: 'Saving…', notSaved: 'Not saved', readOnly: 'Read only' } as const)[persistence.status]
let state: UiState = { campaign, screen: 'Work', tab: 'PowerShell', draft: '', paused: false, sla: freshSla(campaign), saveStatus: saveStatusText(), notices: loaded.notices.map((notice) => notice.message), toast: '' }
const listeners = new Set<() => void>()
const publish = (next: UiState) => { state = next; listeners.forEach((listener) => listener()) }
const updateStatus = () => publish({ ...state, saveStatus: saveStatusText(), notices: [...persistence.notices.map((notice) => notice.message)] })
persistence.subscribe(updateStatus)
persistence.claimWriter((result) => actions.setCampaign(result.campaign))
updateStatus()
if (!loaded.resumed) persistence.save(campaign)

export const operatorGuid = base.ids[OPERATOR_ID]
let terminalHandle: { runLine(text: string): void; setDraft(text: string): void; focus(): void } | undefined
export const actions = {
  setCampaign(value: CampaignState) {
    if (value === state.campaign) return
    // A new case or variant restarts the countdown; changes inside one attempt keep it.
    const sla = caseKey(value) === state.sla.caseKey ? state.sla : freshSla(value)
    publish({ ...state, campaign: value, sla })
    persistence.save(value)
    updateStatus()
  },
  setScreen(screen: UiState['screen']) { publish({ ...state, screen }) },
  setTab(tab: UiState['tab']) { publish({ ...state, tab }) },
  setDraft(draft: string) { publish({ ...state, draft }) },
  togglePaused() { publish({ ...state, paused: !state.paused }) },
  /** Called by the real timer in src/ui. Pause stops it. Lab time and revision never change here (D4). */
  tickSla(milliseconds: number) {
    if (state.paused || state.sla.remainingMs === 0) return
    publish({ ...state, sla: { ...state.sla, remainingMs: Math.max(0, state.sla.remainingMs - milliseconds) } })
  },
  advanceTime(milliseconds: number) {
    const attempt = state.campaign.active
    if (!attempt) return
    const ticket = getTicket(attempt.id)
    if (!ticket) return
    const applied = applyAttemptAction(attempt, ticket.build(attempt.seed), { type: 'clock.advance', milliseconds }, operatorGuid, 'gui')
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
}
export function useStore<T>(selector: (value: UiState) => T): T {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => selector(state), () => selector(state))
}
export const getStore = () => state
export function resetStore() {
  campaign = introduceTicket(createCampaign(base.state, ['case01']), case01, 1)
  publish({ campaign, screen: 'Work', tab: 'PowerShell', draft: '', paused: false, sla: freshSla(campaign), saveStatus: saveStatusText(), notices: [], toast: '' })
  persistence.save(campaign)
}
