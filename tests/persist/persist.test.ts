import { describe, expect, it } from 'vitest'
import { BACKUP_KEY, browserWriterLock, decodeCampaign, encodeCampaign, fakeLockManager, memoryStorage, PersistSession, SAVE_KEY, type StorageLike, type WriterLock } from '../../src/persist'
import { getTicket } from '../../src/tickets/cases'
import { case01 } from '../../src/tickets/cases/case01'
import { applyAction, closeTicket, introduceTicket } from '../../src/tickets/engine'
import { evaluatePredicates } from '../../src/tickets/predicates'
import { createDefaultRegistry, createRuntime, run } from '../../src/ps/runtime'
import type { CampaignState } from '../../src/tickets/types'

const TYPED_PASSWORD = 'Typed-Secret-9x!Qz'
const session = (storage: StorageLike | undefined, tab = 'tab-a') => new PersistSession({ storage, lookup: getTicket, tab, queue: ['case01'] })

/** Plays part of case 01 through the console the way the terminal would, including a secure prompt. */
function midAttempt(seed = 1): CampaignState {
  const fresh = session(memoryStorage()).newCampaign()
  let campaign = introduceTicket(fresh, case01, seed)
  const fixture = case01.build(seed)
  const rt = createRuntime({
    registry: createDefaultRegistry(), actor: fixture.ids.operator,
    readSecure: () => ({ policy: 'pass', value: TYPED_PASSWORD }) as { policy: 'pass' },
    tickets: { getCampaign: () => campaign, setCampaign: (next) => { campaign = next }, getFixture: () => fixture },
  })
  const sam = fixture.request.who.account
  let state = campaign.active!.state
  for (const line of ['Step-SimClock -Minutes 3', `$pw = Read-Host -Prompt 'New password (simulated)' -AsSecureString; Set-ADAccountPassword -Identity ${sam} -Reset -NewPassword $pw`, `Set-ADUser -Identity ${sam} -Description 'callback verified'`]) {
    const result = run(line, rt, state)
    expect(result.errors).toEqual([])
    state = result.state
  }
  expect(campaign.active!.history.length).toBe(3)
  return campaign
}

describe('persistence', () => {
  it('save mid-attempt and load into a fresh engine: state, clock, predicates, and history match', () => {
    for (const seed of case01.seeds) {
      const store = memoryStorage()
      const campaign = midAttempt(seed)
      expect(session(store).save(campaign)).toBe('saved')
      const loaded = session(store, 'tab-b').load()
      expect(loaded.resumed).toBe(true)
      expect(loaded.notices).toEqual([])
      const a = campaign.active!, b = loaded.campaign.active!
      expect(b.state).toEqual(a.state)
      expect(b.state.now).toBe(a.state.now)
      expect(b.checkpoint).toEqual(a.checkpoint)
      expect(b.history).toEqual(a.history)
      expect(b.predicates).toEqual(a.predicates)
      expect(evaluatePredicates(b.state, b, case01.build(seed).predicates)).toEqual(a.predicates)
    }
  })

  it('replay is deterministic: the same seed and log give the same GUIDs and state', () => {
    const payload = encodeCampaign(midAttempt(2), 1, { revision: 1, tab: 't' })
    const first = decodeCampaign(payload, getTicket), second = decodeCampaign(JSON.parse(JSON.stringify(payload)), getTicket)
    expect(Object.keys(second.active!.state.objects)).toEqual(Object.keys(first.active!.state.objects))
    expect(second.active!.state).toEqual(first.active!.state)
  })

  it('keeps completions and history across a reload', () => {
    const store = memoryStorage()
    const fresh = session(store).newCampaign()
    const fixture = case01.build(1)
    let campaign = introduceTicket(fresh, case01, 1)
    campaign = applyAction(campaign, fixture, { type: 'user.unlock', target: fixture.ids.target }, fixture.ids.operator).campaign
    const closed = closeTicket(campaign, fixture)
    expect(closed.closed).toBe(true)
    session(store).save(closed.campaign)
    const loaded = session(store, 'tab-b').load().campaign
    expect(loaded.completed).toEqual(['case01'])
    expect(loaded.active).toBeUndefined()
    expect(loaded.history[0].state).toEqual(closed.campaign.history[0].state)
    expect(loaded.history[0].completed).toBe(true)
  })

  it('the saved payload contains no password text and no domain state', () => {
    const store = memoryStorage()
    session(store).save(midAttempt())
    const json = store.data.get(SAVE_KEY)!
    expect(json).not.toContain(TYPED_PASSWORD)
    expect(json).not.toContain('"objects"')
    expect(JSON.parse(json)).toMatchObject({ schema: 1, writer: { revision: 1, tab: 'tab-a' }, baseSeed: 1 })
  })

  it('malformed JSON gives a notice, keeps a backup, and starts a new campaign', () => {
    const store = memoryStorage({ [SAVE_KEY]: '{not json' })
    const s = session(store)
    const loaded = s.load()
    expect(loaded.resumed).toBe(false)
    expect(loaded.notices.map((n) => n.kind)).toEqual(['malformed'])
    expect(store.data.get(BACKUP_KEY)).toBe('{not json')
    expect(loaded.campaign.queue).toEqual(['case01'])
    expect(s.save(loaded.campaign)).toBe('saved')
  })

  it('a wrong-shaped save is backed up and replaced, not crashed on', () => {
    const store = memoryStorage({ [SAVE_KEY]: JSON.stringify({ schema: 1, writer: { revision: 4, tab: 'x' }, baseSeed: 1, campaign: { queue: 'oops' }, active: null }) })
    const loaded = session(store).load()
    expect(loaded.notices[0].kind).toBe('malformed')
    expect(store.data.has(BACKUP_KEY)).toBe(true)
  })

  it('a JSON value with no schema is treated as malformed', () => {
    const store = memoryStorage({ [SAVE_KEY]: '[1,2]' })
    expect(session(store).load().notices[0].kind).toBe('malformed')
    expect(store.data.get(BACKUP_KEY)).toBe('[1,2]')
  })

  it('a save whose replay diverges gives a notice instead of a broken campaign', () => {
    const store = memoryStorage()
    session(store).save(midAttempt())
    const payload = JSON.parse(store.data.get(SAVE_KEY)!)
    payload.active.clock += 1
    store.data.set(SAVE_KEY, JSON.stringify(payload))
    const loaded = session(store).load()
    expect(loaded.notices[0].kind).toBe('replayFailed')
    expect(loaded.campaign.active).toBeUndefined()
  })

  it('an unknown schema gives a notice and the tab does not overwrite the save', () => {
    const raw = JSON.stringify({ schema: 99, writer: { revision: 7, tab: 'future' } })
    const store = memoryStorage({ [SAVE_KEY]: raw })
    const s = session(store)
    const loaded = s.load()
    expect(loaded.notices.map((n) => n.kind)).toEqual(['unknownSchema'])
    expect(s.save(loaded.campaign)).toBe('readOnly')
    expect(store.data.get(SAVE_KEY)).toBe(raw)
  })

  it('the migration hook upgrades an older schema', () => {
    const store = memoryStorage()
    session(store).save(midAttempt())
    const current = JSON.parse(store.data.get(SAVE_KEY)!)
    const legacy = { ...current, schema: 0, active: undefined, activeAttempt: current.active }
    store.data.set(SAVE_KEY, JSON.stringify(legacy))
    const s = new PersistSession({ storage: store, lookup: getTicket, tab: 'tab-a', queue: ['case01'], migrations: {
      0: ({ activeAttempt, ...rest }) => ({ ...rest, schema: 1, active: activeAttempt }),
    } })
    const loaded = s.load()
    expect(loaded.resumed).toBe(true)
    expect(loaded.campaign.active!.history.length).toBe(3)
  })

  it('a throwing setItem gives a notice and no crash', () => {
    const quota = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
    const store: StorageLike = { getItem: () => null, setItem: () => { throw quota } }
    const s = session(store)
    const statuses: string[] = []
    s.subscribe((status) => statuses.push(status))
    expect(() => s.save(midAttempt())).not.toThrow()
    expect(s.status).toBe('notSaved')
    expect(statuses).toEqual(['saving', 'notSaved'])
    expect(s.notices.map((n) => n.kind)).toEqual(['storageFull'])
  })

  it('a throwing getItem or missing storage gives a notice and no crash', () => {
    const blocked: StorageLike = { getItem: () => { throw new Error('SecurityError') }, setItem: () => undefined }
    expect(session(blocked).load().notices[0].kind).toBe('storageUnavailable')
    const none = session(undefined)
    expect(none.load().notices[0].kind).toBe('storageUnavailable')
    expect(none.save(midAttempt())).toBe('notSaved')
  })

  it('two writers: the older revision goes read-only and the newer campaign survives', () => {
    const store = memoryStorage()
    const a = session(store, 'tab-a'), b = session(store, 'tab-b')
    a.load(); b.load()
    const campaign = midAttempt()
    expect(a.save(campaign)).toBe('saved')
    const newer = store.data.get(SAVE_KEY)
    expect(b.save(session(store).newCampaign())).toBe('readOnly')
    expect(b.notices.map((n) => n.kind)).toEqual(['newerTab'])
    expect(store.data.get(SAVE_KEY)).toBe(newer)
    expect(a.save(campaign)).toBe('saved')
  })

  it('the storage event from a newer tab turns this tab read-only before it writes', () => {
    const store = memoryStorage()
    const a = session(store, 'tab-a'), b = session(store, 'tab-b')
    a.load(); b.load()
    a.save(midAttempt())
    b.handleStorageEvent(SAVE_KEY, store.data.get(SAVE_KEY)!)
    expect(b.readOnly).toBe(true)
    b.handleStorageEvent('other-key', null)
    expect(b.notices).toHaveLength(1)
  })

  describe('single writer (Web Lock adshield-writer)', () => {
    const tab = (store: StorageLike, lock: WriterLock | undefined, name: string) =>
      new PersistSession({ storage: store, lookup: getTicket, tab: name, queue: ['case01'], lock })
    const spy = (store: ReturnType<typeof memoryStorage>) => {
      const writes: string[] = []
      const wrapped: StorageLike & { writes: string[] } = { writes, getItem: (k) => store.getItem(k), setItem: (k, v) => { writes.push(k); store.setItem(k, v) } }
      return wrapped
    }

    it('with two tabs only the lock holder writes', () => {
      const store = memoryStorage(), locks = fakeLockManager()
      const aStore = spy(store), bStore = spy(store)
      const a = tab(aStore, locks.lock(), 'tab-a'), b = tab(bStore, locks.lock(), 'tab-b')
      a.load(); b.load()
      a.claimWriter(() => undefined); b.claimWriter(() => undefined)
      expect(a.isWriter).toBe(true)
      expect(b.isWriter).toBe(false)
      expect(b.status).toBe('readOnly')
      expect(b.notices.map((n) => n.kind)).toEqual(['otherTabWriting'])
      const campaign = midAttempt()
      expect(a.save(campaign)).toBe('saved')
      expect(a.save(campaign)).toBe('saved')
      expect(aStore.writes).toEqual([SAVE_KEY, SAVE_KEY])
      expect(locks.holders()).toBe(1)
    })

    it('tells listeners when the read-only notice arrives after the status change (T10 K2)', () => {
      const store = memoryStorage(), locks = fakeLockManager()
      const a = tab(store, locks.lock(), 'tab-a'), b = tab(store, locks.lock(), 'tab-b')
      a.load(); b.load()
      a.claimWriter(() => undefined)
      const seen: string[][] = []
      b.subscribe(() => seen.push(b.notices.map((n) => n.kind)))
      b.claimWriter(() => undefined)
      expect(b.status).toBe('readOnly')
      expect(seen.at(-1)).toEqual(['otherTabWriting'])
    })

    it('the read-only tab never writes, even when it holds the newest known revision', () => {
      const store = memoryStorage(), locks = fakeLockManager()
      const bStore = spy(store)
      const a = tab(store, locks.lock(), 'tab-a'), b = tab(bStore, locks.lock(), 'tab-b')
      a.load(); b.load()
      a.claimWriter(() => undefined); b.claimWriter(() => undefined)
      // Both tabs know revision 0 and nothing is stored yet: only the lock stops tab B here.
      expect(b.save(midAttempt())).toBe('readOnly')
      expect(b.save(b.newCampaign())).toBe('readOnly')
      expect(bStore.writes).toEqual([])
      expect(store.data.has(SAVE_KEY)).toBe(false)
    })

    it('when the writer closes, the other tab takes over without losing the newer save', () => {
      const store = memoryStorage(), locks = fakeLockManager()
      const a = tab(store, locks.lock(), 'tab-a'), b = tab(store, locks.lock(), 'tab-b')
      a.load()
      const stale = b.load().campaign
      a.claimWriter(() => undefined)
      let takeover: ReturnType<PersistSession['load']> | undefined
      b.claimWriter((result) => { takeover = result })
      const newer = midAttempt()
      a.save(newer)
      const saved = store.data.get(SAVE_KEY)
      expect(stale.active).toBeUndefined()

      a.releaseWriter()
      expect(takeover).toBeDefined()
      expect(b.isWriter).toBe(true)
      expect(b.status).toBe('saved')
      expect(takeover!.resumed).toBe(true)
      expect(takeover!.campaign.active!.state).toEqual(newer.active!.state)
      expect(takeover!.notices.map((n) => n.kind)).toEqual(['otherTabWriting', 'tookOver'])
      expect(store.data.get(SAVE_KEY)).toBe(saved)
      expect(b.save(takeover!.campaign)).toBe('saved')
      expect(JSON.parse(store.data.get(SAVE_KEY)!).writer).toEqual({ revision: 2, tab: 'tab-b' })
    })

    it('a lock holder still refuses to write over a newer revision (second guard)', () => {
      const store = memoryStorage(), locks = fakeLockManager()
      const a = tab(store, locks.lock(), 'tab-a')
      a.load(); a.claimWriter(() => undefined)
      store.data.set(SAVE_KEY, JSON.stringify({ schema: 1, writer: { revision: 9, tab: 'elsewhere' } }))
      expect(a.save(midAttempt())).toBe('readOnly')
      expect(JSON.parse(store.data.get(SAVE_KEY)!).writer.revision).toBe(9)
    })

    it('without navigator.locks: a notice, and the revision check still guards', () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
      Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
      try { expect(browserWriterLock()).toBeUndefined() } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original)
        else delete (globalThis as { navigator?: unknown }).navigator
      }
      const store = memoryStorage()
      const a = tab(store, undefined, 'tab-a'), b = tab(store, undefined, 'tab-b')
      a.load(); b.load()
      a.claimWriter(() => undefined); b.claimWriter(() => undefined)
      expect(a.notices.map((n) => n.kind)).toEqual(['noWriterLock'])
      expect(a.save(midAttempt())).toBe('saved')
      expect(b.save(b.newCampaign())).toBe('readOnly')
    })

    it('browserWriterLock holds navigator.locks until release, then grants the queued tab', async () => {
      type Callback = (lock: unknown) => Promise<void> | void
      let held = false
      const waiting: Callback[] = []
      const options: { ifAvailable?: boolean }[] = []
      const run = (callback: Callback): Promise<void> => {
        held = true
        return Promise.resolve(callback({})).then(() => { held = false; const next = waiting.shift(); if (next) void run(next) })
      }
      const locks = { request: (_name: string, opts: { ifAvailable?: boolean }, callback: Callback) => {
        options.push(opts)
        if (!held) return run(callback)
        if (opts.ifAvailable) return Promise.resolve(callback(null))
        waiting.push(callback)
        return Promise.resolve()
      } }
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
      Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true })
      try {
        const lock = browserWriterLock()!
        const events: string[] = []
        const release = lock.request({ acquired: () => events.push('a1'), blocked: () => events.push('b1') })
        lock.request({ acquired: () => events.push('a2'), blocked: () => events.push('b2') })
        expect(events).toEqual(['a1', 'b2'])
        expect(options[0].ifAvailable).toBe(true)
        release()
        for (let i = 0; i < 5; i++) await Promise.resolve()
        expect(events).toEqual(['a1', 'b2', 'a2'])
        expect(held).toBe(true)
      } finally {
        if (original) Object.defineProperty(globalThis, 'navigator', original)
        else delete (globalThis as { navigator?: unknown }).navigator
      }
    })
  })
})
