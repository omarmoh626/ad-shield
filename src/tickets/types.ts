import type { Action } from '../engine/types'
import type { DomainState, Guid } from '../domain/types'

export interface TicketDef { id: string; tier: 1 | 2 | 3; seeds: number[]; build(seed: number): CaseFixture }
export interface CaseFixture {
  ticketId: string
  ids: Record<string, Guid>
  introduce(base: DomainState): DomainState
  request: TicketRequest
  responsibility: { account: string; outcome: string }
  predicates: Predicate[]
  hints: [Hint, Hint, Hint]
  routes: { script: ScriptStep[]; gui: GuiStep[] }
  wrongFixes: { name: string; steps: ScriptStep[]; expectUnmet: string[] }[]
  debrief(attempt: Attempt): Debrief
  transfer: { question: string; choices?: string[]; answer: string; feedback: string }
}
export interface TicketRequest {
  sender: string; priority: string; impact: string; sla: string; title: string; story: string; goal: string
  who: { person: string; account: string }; alreadyChecked: string; clue: { text: string; eventId?: number }
  careful?: string; glossary: { term: string; definition: string }[]; needs: string; evidence: string[]
}
export interface Predicate {
  id: string; label: string; kind: 'outcome' | 'control' | 'evidence' | 'order'; weight?: number
  posture?: 'security' | 'availability'
  evaluate(state: DomainState, attempt: Attempt): PredicateResult
}
export interface PredicateResult { status: 'met' | 'unmet' | 'waiting'; observed: string; required: string }
export interface Hint { level: 1 | 2 | 3; content: string }
export interface ScriptStep { code: string; explain: string }
export interface GuiStep { path: string[]; action: Action }
export interface Debrief { change: string; access: string; verification: string; reusableCommand: string; summary?: string }
export interface Attempt { id: string; seed: number; state: DomainState; checkpoint: DomainState; history: AttemptEntry[]; predicates: PredicateStatus[]; completed: boolean; replay: boolean }
export interface AttemptEntry { action: Action; source: 'console' | 'gui'; revision: number; whatIf: boolean }
export interface PredicateStatus extends PredicateResult { id: string; label: string; kind: Predicate['kind']; weight: number; posture?: Predicate['posture'] }
export interface RouteResult extends Attempt { closed: boolean; refusal?: string[] }
export interface CampaignState { base: DomainState; queue: string[]; completed: string[]; active?: Attempt; history: Attempt[] }
export interface Score { rank: string; posture: number; failedChecks: string[]; activeIncidentCount: number }
