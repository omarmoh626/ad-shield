import type { CmdletSpec } from '../../registry'
import { getMember } from './getMember'
import { readHost } from './readHost'
import { selectObject } from './selectObject'
import { writeOutput } from './writeOutput'

/** Cmdlets of the Microsoft.PowerShell.Utility module in this slice. */
export const utilityCmdlets: CmdletSpec[] = [getMember, selectObject, writeOutput, readHost]
