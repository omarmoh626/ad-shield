/**
 * The only file in the app that touches `localStorage` (CONTRACTS section 2).
 * Everything else in src/persist works against the StorageLike interface, so
 * tests can pass an in-memory store or one that throws.
 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Returns the browser store, or undefined when the browser blocks it. */
export function browserStorage(): StorageLike | undefined {
  try {
    const store = globalThis.localStorage
    return store ?? undefined
  } catch {
    return undefined
  }
}

/** An in-memory store for tests and for a browser with storage turned off. */
export function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
  }
}

/** True when a write failed because the store is full. */
export function isQuotaError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(error.message))
}

/** Name of the Web Lock that makes one tab the only writer (F11). */
export const WRITER_LOCK_NAME = 'adshield-writer'

/** Callbacks for a writer-lock request. */
export interface WriterLockHandlers {
  /** This tab now holds the lock. It keeps it until release() or until the tab closes. */
  acquired(): void
  /** Another tab holds the lock. The request stays queued; acquired() follows when the lock frees. */
  blocked(): void
}

/** An exclusive lock held for the tab's lifetime. `request` returns a release function. */
export interface WriterLock {
  request(handlers: WriterLockHandlers): () => void
}

interface LockManagerLike {
  request(name: string, options: { mode: 'exclusive'; ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown>
}

/** The browser Web Locks API, or undefined when this browser has no navigator.locks. */
export function browserWriterLock(): WriterLock | undefined {
  let locks: LockManagerLike | undefined
  try {
    locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks
  } catch {
    locks = undefined
  }
  if (!locks || typeof locks.request !== 'function') return undefined
  const manager = locks
  return {
    request(handlers) {
      let release: (() => void) | undefined
      let released = false
      const abort = new AbortController()
      // The callback's promise stays pending, so the lock is held until release() or tab close.
      const hold = () => new Promise<void>((resolve) => { release = resolve; if (released) resolve(); else handlers.acquired() })
      manager.request(WRITER_LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        if (lock) return hold()
        if (released) return
        handlers.blocked()
        manager.request(WRITER_LOCK_NAME, { mode: 'exclusive', signal: abort.signal }, hold).catch(() => undefined)
      }).catch(() => undefined)
      return () => { released = true; abort.abort(); release?.() }
    },
  }
}

/**
 * An in-memory lock manager for tests. Each `lock()` stands for one tab.
 * Grants are synchronous and first come, first served.
 */
export function fakeLockManager(): { lock(): WriterLock; holders(): number } {
  let holder: symbol | undefined
  const queue: { id: symbol; handlers: WriterLockHandlers }[] = []
  const grantNext = () => {
    const next = queue.shift()
    if (!next) return
    holder = next.id
    next.handlers.acquired()
  }
  return {
    holders: () => (holder ? 1 : 0),
    lock: () => ({
      request(handlers) {
        const id = Symbol('tab')
        if (!holder) { holder = id; handlers.acquired() } else { queue.push({ id, handlers }); handlers.blocked() }
        return () => {
          const waiting = queue.findIndex((entry) => entry.id === id)
          if (waiting >= 0) queue.splice(waiting, 1)
          if (holder === id) { holder = undefined; grantNext() }
        }
      },
    }),
  }
}
