import { PsError } from '../../values'

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

/**
 * Lab time as an ISO 8601 UTC string, for example `2026-01-12T13:00:00Z`.
 * Pure arithmetic on the lab clock value. It never reads the real clock.
 */
export function formatLabTime(ms: number): string {
  const days = Math.floor(ms / 86_400_000)
  const rest = ms - days * 86_400_000
  // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0)
  const hours = Math.floor(rest / 3_600_000), minutes = Math.floor((rest % 3_600_000) / 60_000), seconds = Math.floor((rest % 60_000) / 1000)
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}Z`
}

/** Parses `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]Z` as UTC lab time. */
export function parseLabTime(value: string, label: string, help: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?Z?)?$/.exec(value.trim())
  if (!match) throw new PsError(`${label} must be YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ in UTC lab time.`, { help })
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0))
  const utc = Date.UTC(year, month - 1, day, hour, minute, second)
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || formatLabTime(utc).slice(0, 10) !== value.trim().slice(0, 10)) {
    throw new PsError(`${label} is not a valid date.`, { help })
  }
  return utc
}
