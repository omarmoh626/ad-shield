import type { AuditEvent, DomainState } from '../../../domain/types'
import type { CmdletSpec } from '../../registry'
import { PsError, isHashtable, toText, type PsValue } from '../../values'
import { formatLabTime, parseLabTime } from './time'

export const EVENT_RECORD = 'System.Diagnostics.Eventing.Reader.EventLogRecord'
const HELP = 'Get-Help Get-WinEvent -Examples'

const MESSAGES: Record<number, string> = {
  4624: 'An account was successfully logged on.',
  4625: 'An account failed to log on.',
  4720: 'A user account was created.',
  4722: 'A user account was enabled.',
  4724: "An attempt was made to reset an account's password.",
  4725: 'A user account was disabled.',
  4728: 'A member was added to a security-enabled global group.',
  4729: 'A member was removed from a security-enabled global group.',
  4732: 'A member was added to a security-enabled local group.',
  4733: 'A member was removed from a security-enabled local group.',
  4738: 'A user account was changed.',
  4740: 'A user account was locked out.',
  4756: 'A member was added to a security-enabled universal group.',
  4757: 'A member was removed from a security-enabled universal group.',
  4767: 'A user account was unlocked.',
}

const FILTER_KEYS = ['LogName', 'Id', 'StartTime', 'EndTime'] as const

interface Filter { logs: string[]; ids?: number[]; start?: number; end?: number }

const list = (value: PsValue): PsValue[] => Array.isArray(value) ? value : [value]

function readFilter(value: PsValue | undefined): Filter {
  if (!isHashtable(value)) throw new PsError('Get-WinEvent: -FilterHashtable needs a hashtable such as @{LogName=\'Security\'; Id=4740}.', { help: HELP })
  const filter: Filter = { logs: [] }
  for (const [rawKey, entry] of Object.entries(value.properties)) {
    const key = FILTER_KEYS.find((name) => name.toLowerCase() === rawKey.toLowerCase())
    if (!key) throw new PsError(`Get-WinEvent: the filter key '${rawKey}' is not supported in this lab. Use ${FILTER_KEYS.join(', ')}.`, { help: HELP })
    if (key === 'LogName') filter.logs = list(entry).map((item) => toText(item).toLowerCase())
    else if (key === 'Id') {
      filter.ids = list(entry).map((item) => Number(toText(item)))
      if (filter.ids.some((id) => !Number.isSafeInteger(id))) throw new PsError('Get-WinEvent: Id must be a whole number or a list of whole numbers.', { help: HELP })
    } else if (key === 'StartTime') filter.start = parseLabTime(toText(entry), 'StartTime', HELP)
    else filter.end = parseLabTime(toText(entry), 'EndTime', HELP)
  }
  if (!filter.logs.length) throw new PsError('Get-WinEvent: the filter hashtable must include LogName, for example @{LogName=\'Security\'}.', { help: HELP })
  return filter
}

/** The computer the console runs on: the analyst's admin workstation. Get-WinEvent reads it when -ComputerName is not given. */
function localHost(state: DomainState): string | undefined {
  const found = Object.values(state.objects).find((object) => object.objectClass === 'computer' && object.attrs.isAnalystWorkstation === true)
  return typeof found?.attrs.dNSHostName === 'string' ? found.attrs.dNSHostName.toLowerCase() : undefined
}

function hostMatches(event: AuditEvent, names: string[]): boolean {
  const host = (event.host ?? '').toLowerCase()
  const short = host.split('.')[0]
  return names.some((name) => name === host || name === short)
}

function record(event: AuditEvent): PsValue {
  const id = event.eventId ?? 0
  const target = event.data.targetName ?? event.data.targetUserName ?? ''
  const details = Object.entries(event.data).filter(([key]) => key !== 'kind').map(([key, value]) => `${key}: ${value}`)
  return {
    typeName: EVENT_RECORD,
    properties: {
      TimeCreated: formatLabTime(event.time),
      Id: id,
      LevelDisplayName: 'Information',
      Message: `${MESSAGES[id] ?? 'Simulated Security event.'} Target: ${target}`,
      MachineName: event.host ?? '',
      LogName: event.log ?? '',
      ProviderName: 'Microsoft-Windows-Security-Auditing',
      RecordId: event.seq,
      TargetUserName: target,
      SubjectUserName: event.data.actorName ?? '',
      Properties: details,
    },
  }
}

export const getWinEvent: CmdletSpec = {
  name: 'Get-WinEvent',
  module: 'Microsoft.PowerShell.Diagnostics',
  parameterSets: [{
    name: 'HashQuerySet',
    parameters: [
      { name: 'FilterHashtable', type: 'hashtable', position: 0, mandatory: true, help: "Keys: LogName (required), Id, StartTime, EndTime. Times are UTC lab time, for example '2026-01-12T13:00:00Z'." },
      { name: 'ComputerName', type: 'string', help: 'Reads the log of one simulated computer, for example DC01 or PHARM-WS01. Without it, reads the local computer: the admin workstation IT-ADM01.' },
      { name: 'MaxEvents', type: 'int', help: 'Returns at most this many events, newest first.' },
    ],
  }],
  inputTypes: [],
  outputType: EVENT_RECORD,
  defaultDisplay: ['TimeCreated', 'Id', 'MachineName', 'Message'],
  supportsWhatIf: false,
  confirmImpact: 'none',
  help: {
    synopsis: 'Reads simulated Windows Security events, newest first. Without -ComputerName it reads the local admin workstation only; use -ComputerName DC01 for directory events such as 4740. Simulator and Entra activity never appears here.',
    examples: [
      { code: "Test-SimSignIn pnair PHARM-WS01; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -ComputerName PHARM-WS01", explain: 'Signs Priya in, then reads the 4624 sign-in event on the workstation where it happened.' },
      { code: "Test-SimSignIn rchen.ops IT-ADM01; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624}", explain: 'Without -ComputerName, reads the local computer: the admin workstation IT-ADM01.' },
      { code: "Test-SimSignIn pnair PHARM-WS01 -SimulateBadPassword; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -ComputerName PHARM-WS01 -MaxEvents 1", explain: 'Reads the newest failed sign-in on the workstation where it happened.' },
      { code: "Unlock-ADAccount mali; Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4740,4767; StartTime='2026-01-12'} -ComputerName DC01", explain: 'Reads lockout and unlock events on the domain controller since a date.' },
    ],
  },
  *run(inv, rt) {
    const filter = readFilter(inv.params.FilterHashtable)
    const max = inv.params.MaxEvents
    if (max !== undefined && (typeof max !== 'number' || !Number.isSafeInteger(max) || max < 1)) throw new PsError('Get-WinEvent: -MaxEvents must be a whole number of 1 or more.', { help: HELP })
    // Without -ComputerName, Windows reads the local computer only. In the lab that is the analyst's admin workstation.
    const local = localHost(rt.state)
    const hosts = inv.params.ComputerName === undefined ? (local ? [local] : []) : [toText(inv.params.ComputerName).trim().toLowerCase()]
    const found = rt.state.events
      .filter((event) => event.origin === 'windows')
      .filter((event) => filter.logs.includes((event.log ?? '').toLowerCase()))
      .filter((event) => filter.ids === undefined || filter.ids.includes(event.eventId ?? -1))
      .filter((event) => filter.start === undefined || event.time >= filter.start)
      .filter((event) => filter.end === undefined || event.time <= filter.end)
      .filter((event) => hostMatches(event, hosts))
      .sort((a, b) => b.seq - a.seq)
    if (!found.length) throw new PsError('Get-WinEvent: No events were found that match the specified selection criteria.', { help: HELP })
    for (const event of typeof max === 'number' ? found.slice(0, max) : found) yield record(event)
  },
}
