import { adGetCmdlets } from './get'

/** ActiveDirectory read-side cmdlets. P2 write cmdlets append here. */
export const adCmdlets = [...adGetCmdlets]
