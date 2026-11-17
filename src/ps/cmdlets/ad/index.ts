import { adGetCmdlets } from './get'
import { adSetCmdlets } from './set'

/** ActiveDirectory read-side cmdlets (T03 P1) and write-side cmdlets (T03 P2). */
export const adCmdlets = [...adGetCmdlets, ...adSetCmdlets]
