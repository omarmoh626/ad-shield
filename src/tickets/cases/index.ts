import type { TicketDef } from '../types'
import { case01 } from './case01'

/** Every playable case in campaign order. Persistence and the inbox resolve ticket IDs here. */
export const TICKETS: readonly TicketDef[] = [case01]

export function getTicket(id: string): TicketDef | undefined {
  return TICKETS.find((ticket) => ticket.id === id)
}
