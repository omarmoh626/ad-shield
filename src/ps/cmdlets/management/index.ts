import type { CmdletSpec } from '../../registry'
import { getLocation, setLocation } from './location'

/** Cmdlets of the Microsoft.PowerShell.Management module in this slice. */
export const managementCmdlets: CmdletSpec[] = [getLocation, setLocation]
