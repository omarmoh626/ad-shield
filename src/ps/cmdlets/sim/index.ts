import { testSimResourceAccess } from './access'
import { stepSimClock } from './clock'
import { addSimResourcePermission, removeSimResourcePermission } from './permission'
import { testSimSignIn } from './signIn'

/** ADShield.Sim cmdlets of T04: browser-only simulator operations. Each prints the word "simulated". */
export const simCmdlets = [testSimSignIn, testSimResourceAccess, stepSimClock, addSimResourcePermission, removeSimResourcePermission]
