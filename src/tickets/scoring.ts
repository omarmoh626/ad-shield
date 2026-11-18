import type { Attempt, Score, TicketDef } from './types'

export function rankFor(completed: TicketDef[], catalog: TicketDef[]): string {
  const completedIds = new Set(completed.map((ticket) => ticket.id))
  // D3: completing a tier promotes, whether or not the next tier is built yet (SPEC: rank moves as each tier completes; D12 stops at IAM Analyst in this slice).
  const tierDone = (tier: TicketDef['tier']) => { const tickets = catalog.filter((ticket) => ticket.tier === tier); return tickets.length > 0 && tickets.every((ticket) => completedIds.has(ticket.id)) }
  if (tierDone(1) && tierDone(2)) return 'Identity Security Engineer'
  if (tierDone(1)) return 'IAM Analyst'
  return 'Helpdesk'
}
export function postureFor(attempts: Attempt[]): { posture: number; failedChecks: string[] } {
  const checks = attempts.flatMap((attempt) => attempt.predicates).filter((predicate) => predicate.posture !== undefined && predicate.weight > 0)
  const weight = checks.reduce((total, check) => total + check.weight, 0)
  return { posture: weight === 0 ? 100 : Math.round(checks.reduce((total, check) => total + (check.status === 'met' ? check.weight : 0), 0) / weight * 100), failedChecks: checks.filter((check) => check.status !== 'met').map((check) => check.label) }
}
export function scoreCampaign(completed: TicketDef[], catalog: TicketDef[], attempts: Attempt[], activeIncidentCount: number): Score {
  return { rank: rankFor(completed, catalog), ...postureFor(attempts), activeIncidentCount }
}
