import type { CmdletSpec } from '../../registry'
import { getCommand } from './getCommand'
import { getHelp } from './getHelp'
import { whereObject } from './whereObject'

/** Cmdlets of the Microsoft.PowerShell.Core module in this slice. */
export const coreCmdlets: CmdletSpec[] = [getHelp, getCommand, whereObject]
