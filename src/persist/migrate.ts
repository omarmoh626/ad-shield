import { SCHEMA_VERSION } from './schema'

/** Upgrades a payload from schema N to schema N + 1. */
export type Migration = (payload: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the schema a migration starts from. Schema 1 is the first; none exist yet. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

/** `malformed`: not a save at all. `unknown`: a save this app cannot read, for example from a newer version. */
export type MigrateResult = { ok: true; payload: unknown } | { ok: false; kind: 'malformed' | 'unknown'; reason: string }

/** Runs migrations in order until the payload reaches the current schema. */
export function migrate(value: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target = SCHEMA_VERSION): MigrateResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, kind: 'malformed', reason: 'The save is not an object.' }
  let payload = value as Record<string, unknown>
  const declared = payload.schema
  if (typeof declared !== 'number' || !Number.isInteger(declared)) return { ok: false, kind: 'malformed', reason: 'The save has no schema version.' }
  let schema: number = declared
  if (schema > target) return { ok: false, kind: 'unknown', reason: `The save uses schema ${schema}, which is newer than this app (schema ${target}).` }
  while (schema < target) {
    const step = migrations[schema]
    if (!step) return { ok: false, kind: 'unknown', reason: `No migration exists from schema ${schema}.` }
    payload = step(payload)
    if (payload.schema !== schema + 1) return { ok: false, kind: 'unknown', reason: `The migration from schema ${schema} did not produce schema ${schema + 1}.` }
    schema = payload.schema as number
  }
  return { ok: true, payload }
}
