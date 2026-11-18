import type { TicketDef } from '../types'
import { case01 } from './case01'
import { case02 } from './case02'
import { case03 } from './case03'
import { case04 } from './case04'
import { case05 } from './case05'

/** Every playable case in campaign order. Persistence and the inbox resolve ticket IDs here. */
export const TICKETS: readonly TicketDef[] = [case01, case02, case03, case04, case05]

export function getTicket(id: string): TicketDef | undefined {
  return TICKETS.find((ticket) => ticket.id === id)
}
