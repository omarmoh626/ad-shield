import { testSimResourceAccess } from './access'
import { stepSimClock } from './clock'
import { addSimResourcePermission, removeSimResourcePermission } from './permission'
import { testSimSignIn } from './signIn'
import { closeSimTicket, getSimTicket, resetSimAttempt } from './ticket'

/** ADShield.Sim cmdlets of T04: browser-only simulator operations. Each prints the word "simulated". */
export const simCmdlets = [testSimSignIn, testSimResourceAccess, stepSimClock, addSimResourcePermission, removeSimResourcePermission, getSimTicket, closeSimTicket, resetSimAttempt]
