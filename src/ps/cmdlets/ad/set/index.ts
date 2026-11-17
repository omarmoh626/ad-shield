import type { CmdletSpec } from '../../../registry'
import { accountCmdlets } from './account'
import { groupCmdlets } from './group'
import { userCmdlets } from './user'

/** ActiveDirectory write-side cmdlets. Each one builds Actions and calls rt.dispatch; none edits state. */
export const adSetCmdlets: CmdletSpec[] = [...userCmdlets, ...accountCmdlets, ...groupCmdlets]
