import type { Action, Source } from '../engine/types'

/** The single storage key (CONTRACTS section 10). */
export const SAVE_KEY = 'adshield.v1'
/** Where an unreadable save is kept before a new campaign starts. */
export const BACKUP_KEY = 'adshield.v1.backup'
export const SCHEMA_VERSION = 1

export interface SavedEntry { action: Action; source: Extract<Source, 'console' | 'gui'> }

/** One attempt, stored as its seed and the committed actions since its checkpoint. */
export interface SavedAttempt {
  ticketId: string
  seed: number
  /** Lab clock when saved. Load checks that the replay reaches the same time. */
  clock: number
  log: SavedEntry[]
  /** D8: true for a fresh-variation replay of a completed case. It can never award a completion. Absent in older saves. */
  replay?: boolean
}

/**
 * Save payload v1. It holds no domain state and no password values. Load
 * rebuilds the base domain from `baseSeed`, rebuilds each case fixture from
 * its seed, and replays the action logs.
 */
export interface SavePayload {
  schema: number
  writer: { revision: number; tab: string }
  baseSeed: number
  /** `slaRemainingMs` (D4) is optional: saves from before it existed load with the case's full SLA. */
  campaign: { queue: string[]; completed: string[]; history: SavedAttempt[]; slaRemainingMs?: number }
  active: SavedAttempt | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function isSavedAttempt(value: unknown): value is SavedAttempt {
  return isObject(value) && typeof value.ticketId === 'string' && isFiniteNumber(value.seed) && isFiniteNumber(value.clock)
    && (value.replay === undefined || typeof value.replay === 'boolean')
    && Array.isArray(value.log) && value.log.every((entry) => isObject(entry) && isObject(entry.action) && typeof entry.action.type === 'string' && (entry.source === 'console' || entry.source === 'gui'))
}

/** Checks the shape of a current-schema payload. Returns a reason when it is not valid. */
export function validatePayload(value: unknown): string | undefined {
  if (!isObject(value)) return 'The save is not an object.'
  if (value.schema !== SCHEMA_VERSION) return `The save has schema ${String(value.schema)}, expected ${SCHEMA_VERSION}.`
  const writer = value.writer
  if (!isObject(writer) || !isFiniteNumber(writer.revision) || typeof writer.tab !== 'string') return 'The save has no valid writer revision.'
  if (!isFiniteNumber(value.baseSeed)) return 'The save has no base seed.'
  const campaign = value.campaign
  if (!isObject(campaign) || !isStringArray(campaign.queue) || !isStringArray(campaign.completed) || !Array.isArray(campaign.history) || !campaign.history.every(isSavedAttempt)) return 'The save has no valid campaign progress.'
  if (campaign.slaRemainingMs !== undefined && !(isFiniteNumber(campaign.slaRemainingMs) && campaign.slaRemainingMs >= 0)) return 'The save has an invalid SLA countdown.'
  if (value.active !== null && !isSavedAttempt(value.active)) return 'The save has an invalid active attempt.'
  return undefined
}

/** Reads the writer revision of any stored text, or undefined when it has none. */
export function revisionOf(raw: string | null): number | undefined {
  if (raw === null) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return isObject(value) && isObject(value.writer) && isFiniteNumber(value.writer.revision) ? value.writer.revision : undefined
  } catch {
    return undefined
  }
}
