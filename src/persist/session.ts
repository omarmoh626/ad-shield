import { buildBaseDomain } from '../fixtures/baseDomain'
import { createCampaign } from '../tickets/engine'
import type { CampaignState } from '../tickets/types'
import { decodeCampaign, encodeCampaign, type TicketLookup } from './codec'
import { migrate, MIGRATIONS, type Migration } from './migrate'
import { BACKUP_KEY, revisionOf, SAVE_KEY, validatePayload, type SavePayload } from './schema'
import { isQuotaError, type StorageLike, type WriterLock } from './storage'

/** What the header shows: saved, saving, not saved, or read-only. */
export type SaveStatus = 'saved' | 'saving' | 'notSaved' | 'readOnly'

export type NoticeKind = 'malformed' | 'unknownSchema' | 'replayFailed' | 'storageUnavailable' | 'storageFull' | 'newerTab' | 'otherTabWriting' | 'tookOver' | 'noWriterLock'
export interface SaveNotice { kind: NoticeKind; message: string }

export interface PersistOptions {
  /** The store to use. Undefined means the browser blocked storage; the campaign then runs in memory only. */
  storage: StorageLike | undefined
  lookup: TicketLookup
  /** Identifies this tab in the writer field. The UI makes one per page load. */
  tab: string
  /** Ticket IDs for a new campaign. */
  queue: string[]
  baseSeed?: number
  migrations?: Readonly<Record<number, Migration>>
  /**
   * The single-writer lock (F11). Pass browserWriterLock() in the app and
   * fakeLockManager().lock() in tests. Undefined means this browser has no
   * Web Locks; claimWriter() then shows a notice and the revision check is the only guard.
   */
  lock?: WriterLock
}

export interface LoadResult { campaign: CampaignState; notices: SaveNotice[]; resumed: boolean }

/**
 * Save and load for one tab. Only the tab holding the writer lock saves; the
 * others stay read-only and take over, after reloading the newest save, when
 * the lock frees. As a second guard a tab writes only while it holds the
 * newest writer revision. It never overwrites a newer campaign.
 */
export class PersistSession {
  private knownRevision = 0
  private currentStatus: SaveStatus = 'saved'
  private readonly listeners = new Set<(status: SaveStatus) => void>()
  readonly notices: SaveNotice[] = []
  private readonly baseSeed: number
  /** 'writer' holds the lock (or no lock exists); 'waiting' is queued behind another tab; 'idle' has not claimed yet. */
  private role: 'idle' | 'writer' | 'waiting' = 'idle'
  private releaseLock: (() => void) | undefined

  constructor(private readonly options: PersistOptions) {
    this.baseSeed = options.baseSeed ?? 1
    if (!options.storage) {
      this.currentStatus = 'notSaved'
      this.notice('storageUnavailable', 'This browser is not letting the simulator save. Your progress will be lost when you close the tab.')
    }
  }

  get status(): SaveStatus { return this.currentStatus }
  get readOnly(): boolean { return this.currentStatus === 'readOnly' }
  /** The writer revision this tab last read or wrote. */
  get revision(): number { return this.knownRevision }

  subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  newCampaign(): CampaignState {
    return createCampaign(buildBaseDomain(this.baseSeed).state, this.options.queue)
  }

  /** True while this tab may write: it holds the writer lock, or Web Locks are unavailable, or it has not claimed one. */
  get isWriter(): boolean { return this.role !== 'waiting' }

  /**
   * Requests the writer lock for this tab's lifetime. While another tab holds
   * it, this tab is read-only. When the lock frees, this tab reloads the newest
   * save and passes it to onTakeover; the caller replaces its campaign with it.
   */
  claimWriter(onTakeover: (result: LoadResult) => void): void {
    if (this.role !== 'idle') return
    const lock = this.options.lock
    if (!lock) {
      this.role = 'writer'
      this.notice('noWriterLock', 'This browser cannot coordinate tabs. Keep the simulator open in one tab only; a tab that falls behind becomes read-only.')
      return
    }
    let waited = false
    this.releaseLock = lock.request({
      blocked: () => {
        waited = true
        this.role = 'waiting'
        this.setStatus('readOnly')
        this.notice('otherTabWriting', 'The simulator is open in another tab. This tab is read-only and will take over when that tab closes.')
      },
      acquired: () => {
        this.role = 'writer'
        if (!waited) return
        // Take over: drop the read-only state, then continue from the newest save.
        this.setStatus('saved')
        const result = this.load()
        this.notice('tookOver', 'The other tab closed. This tab loaded the newest save and can save again.')
        onTakeover({ ...result, notices: [...this.notices] })
      },
    })
  }

  /** Gives up the writer lock. The browser also frees it when the tab closes. */
  releaseWriter(): void {
    const release = this.releaseLock
    this.releaseLock = undefined
    if (this.role === 'writer' || this.role === 'waiting') this.role = 'idle'
    release?.()
  }

  /** Loads the saved campaign, or starts a new one with a notice when the save cannot be used. */
  load(): LoadResult {
    const storage = this.options.storage
    if (!storage) return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }
    let raw: string | null
    try {
      raw = storage.getItem(SAVE_KEY)
    } catch {
      this.setStatus('notSaved')
      this.notice('storageUnavailable', 'The saved campaign could not be read. A new campaign started, and saving may not work.')
      return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }
    }
    if (raw === null) return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return this.startOver(raw, 'malformed', 'The saved campaign was damaged and could not be read. A copy was kept, and a new campaign started.')
    }

    const migrated = migrate(parsed, this.options.migrations ?? MIGRATIONS)
    if (!migrated.ok && migrated.kind === 'malformed') return this.startOver(raw, 'malformed', `${migrated.reason} A copy was kept, and a new campaign started.`)
    if (!migrated.ok) {
      const newer = revisionOf(raw)
      // A save from a newer app version is left untouched: this tab goes read-only instead of replacing it.
      this.knownRevision = newer ?? 0
      this.setStatus('readOnly')
      this.notice('unknownSchema', `${migrated.reason} This tab will not save, so the existing save stays as it is.`)
      return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }
    }
    const invalid = validatePayload(migrated.payload)
    if (invalid) return this.startOver(raw, 'malformed', `${invalid} A copy was kept, and a new campaign started.`)

    const payload = migrated.payload as SavePayload
    try {
      const campaign = decodeCampaign(payload, this.options.lookup)
      this.knownRevision = payload.writer.revision
      this.setStatus('saved')
      return { campaign, notices: [...this.notices], resumed: true }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The replay failed.'
      return this.startOver(raw, 'replayFailed', `${reason} A copy of the save was kept, and a new campaign started.`)
    }
  }

  /** Saves the campaign unless a newer tab owns the save. Never throws. */
  save(campaign: CampaignState): SaveStatus {
    const storage = this.options.storage
    if (this.readOnly || this.role === 'waiting') return this.currentStatus
    if (!storage) { this.setStatus('notSaved'); return this.currentStatus }
    this.setStatus('saving')
    try {
      const stored = revisionOf(storage.getItem(SAVE_KEY))
      if (stored !== undefined && stored > this.knownRevision) return this.yieldToNewerTab()
      const revision = this.knownRevision + 1
      storage.setItem(SAVE_KEY, JSON.stringify(encodeCampaign(campaign, this.baseSeed, { revision, tab: this.options.tab })))
      this.knownRevision = revision
      this.setStatus('saved')
    } catch (error) {
      this.setStatus('notSaved')
      if (isQuotaError(error)) this.notice('storageFull', 'Browser storage is full, so the last change was not saved. Free some space and keep working; the next change will try again.')
      else this.notice('storageUnavailable', 'The last change could not be saved. Keep working; the next change will try again.')
    }
    return this.currentStatus
  }

  /** Feed the browser `storage` event here. A newer revision from another tab makes this tab read-only. */
  handleStorageEvent(key: string | null, newValue: string | null): void {
    if (key !== SAVE_KEY || this.readOnly) return
    const revision = revisionOf(newValue)
    if (revision !== undefined && revision > this.knownRevision) this.yieldToNewerTab()
  }

  private yieldToNewerTab(): SaveStatus {
    this.setStatus('readOnly')
    this.notice('newerTab', 'Another tab saved newer progress. This tab is now read-only so it cannot overwrite that work. Reload to continue from the newer save.')
    return this.currentStatus
  }

  private startOver(raw: string, kind: NoticeKind, message: string): LoadResult {
    const storage = this.options.storage!
    try {
      storage.setItem(BACKUP_KEY, raw)
      this.notice(kind, message)
    } catch {
      // Without a backup the unreadable save must not be replaced: stay read-only.
      this.setStatus('readOnly')
      this.notice(kind, `${message.replace(/ A copy.*$/, '')} The save could not be backed up, so this tab will not overwrite it.`)
      return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }
    }
    // The next save replaces the unreadable one, so it must not look older than it.
    this.knownRevision = revisionOf(raw) ?? 0
    this.setStatus('notSaved')
    return { campaign: this.newCampaign(), notices: [...this.notices], resumed: false }
  }

  private notice(kind: NoticeKind, message: string): void {
    this.notices.push({ kind, message })
  }

  private setStatus(status: SaveStatus): void {
    if (status === this.currentStatus) return
    this.currentStatus = status
    for (const listener of this.listeners) listener(status)
  }
}
