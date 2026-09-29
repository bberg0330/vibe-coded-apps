// vite-plugins/store-ops.test.ts
import { describe, it, expect } from 'vitest'
import { applyOp, parseStore, SeedRejectedError } from './store-ops'
import { emptyStore } from '../src/types'
import type { ServiceKey, Store, WatchEntry, WatchingEntry } from '../src/types'

const entry = (tmdbId: number, title: string, watchedAt: string): WatchEntry => ({
  watchedAt,
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

const watchingEntry = (
  profileId: string, tmdbId: number, title: string, startedAt: string,
): WatchingEntry => ({
  startedAt,
  profileId,
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
  discoveredVia: null,
})

describe('applyOp: logWatch', () => {
  it('appends an entry', () => {
    const next = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2026-08-08T20:00:00.000Z'),
    })
    expect(next.history).toHaveLength(1)
    expect(next.history[0].movie.title).toBe('Rushmore')
  })

  it('appends a rewatch rather than overwriting', () => {
    let store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2026-08-08T20:00:00.000Z'),
    })
    store = applyOp(store, {
      type: 'logWatch', entry: entry(1, 'Rushmore', '2027-01-01T20:00:00.000Z'),
    })
    expect(store.history).toHaveLength(2)
    expect(store.history[0].watchedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('does not mutate the input store', () => {
    const before = emptyStore()
    applyOp(before, { type: 'logWatch', entry: entry(1, 'X', '2026-08-08T20:00:00.000Z') })
    expect(before.history).toHaveLength(0)
  })
})

describe('applyOp: undoLastWatch', () => {
  it('removes only the most recent entry for that film', () => {
    let store = emptyStore()
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'A', '2026-01-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'A', '2026-02-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 1 })

    expect(store.history).toHaveLength(1)
    expect(store.history[0].watchedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('leaves other films alone', () => {
    let store = emptyStore()
    store = applyOp(store, { type: 'logWatch', entry: entry(1, 'Keep', '2026-01-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'logWatch', entry: entry(2, 'Drop', '2026-02-01T00:00:00.000Z') })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 2 })

    expect(store.history.map((e) => e.movie.title)).toEqual(['Keep'])
  })

  it('is a no-op for an unlogged film', () => {
    let store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'A', '2026-01-01T00:00:00.000Z'),
    })
    store = applyOp(store, { type: 'undoLastWatch', tmdbId: 999 })
    expect(store.history).toHaveLength(1)
  })
})

describe('applyOp: setService', () => {
  it('disables a service', () => {
    const next = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    expect(next.enabledServices).not.toContain('netflix')
    expect(next.enabledServices).toContain('hbomax')
  })

  it('re-enables a service without duplicating it', () => {
    let store = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    store = applyOp(store, { type: 'setService', key: 'netflix', enabled: true })
    store = applyOp(store, { type: 'setService', key: 'netflix', enabled: true })

    expect(store.enabledServices.filter((k) => k === 'netflix')).toHaveLength(1)
  })

  it('allows disabling every service', () => {
    let store = emptyStore()
    for (const key of [...store.enabledServices]) {
      store = applyOp(store, { type: 'setService', key, enabled: false })
    }
    expect(store.enabledServices).toEqual([])
  })
})

describe('applyOp: replaceHistory', () => {
  it('replaces history and leaves settings alone', () => {
    let store = applyOp(emptyStore(), { type: 'setService', key: 'netflix', enabled: false })
    store = applyOp(store, {
      type: 'replaceHistory', entries: [entry(5, 'Imported', '2026-03-01T00:00:00.000Z')],
    })

    expect(store.history.map((e) => e.movie.title)).toEqual(['Imported'])
    expect(store.enabledServices).not.toContain('netflix')
  })
})

describe('applyOp: seed', () => {
  it('populates an empty store', () => {
    const next = applyOp(emptyStore(), {
      type: 'seed',
      history: [entry(1, 'Migrated', '2026-01-01T00:00:00.000Z')],
      enabledServices: ['netflix'],
    })
    expect(next.history).toHaveLength(1)
    expect(next.enabledServices).toEqual(['netflix'])
  })

  it('is REJECTED when history already exists, so a stale client cannot wipe the record', () => {
    const store = applyOp(emptyStore(), {
      type: 'logWatch', entry: entry(1, 'Real', '2026-01-01T00:00:00.000Z'),
    })

    expect(() =>
      applyOp(store, { type: 'seed', history: [], enabledServices: ['netflix'] }),
    ).toThrow(SeedRejectedError)
  })

  it('defaults to all six when enabledServices is entirely invalid', () => {
    const next = applyOp(emptyStore(), {
      type: 'seed',
      history: [entry(1, 'Migrated', '2026-01-01T00:00:00.000Z')],
      enabledServices: ['bogus' as ServiceKey],
    })
    expect(next.enabledServices).toHaveLength(6)
  })

  it('preserves a deliberate empty enabledServices rather than treating it as corrupt', () => {
    const next = applyOp(emptyStore(), {
      type: 'seed',
      history: [entry(1, 'Migrated', '2026-01-01T00:00:00.000Z')],
      enabledServices: [],
    })
    expect(next.enabledServices).toEqual([])
  })
})

describe('applyOp: cancelWatching', () => {
  it('removes the most recent matching (profileId, tmdbId) entry', () => {
    let store = { ...emptyStore(), nowWatching: [watchingEntry('laura', 1, 'A', '2026-01-01T00:00:00.000Z')] }
    store = applyOp(store, { type: 'cancelWatching', profileId: 'laura', tmdbId: 1 })
    expect(store.nowWatching).toHaveLength(0)
  })

  it('leaves a different profile watching the same film alone', () => {
    let store = { ...emptyStore(), nowWatching: [watchingEntry('laura', 1, 'A', '2026-01-01T00:00:00.000Z')] }
    store = { ...store, nowWatching: [...store.nowWatching, watchingEntry('brian', 1, 'A', '2026-01-01T00:00:00.000Z')] }
    store = applyOp(store, { type: 'cancelWatching', profileId: 'laura', tmdbId: 1 })

    expect(store.nowWatching).toHaveLength(1)
    expect(store.nowWatching[0].profileId).toBe('brian')
  })

  it('is a no-op for a non-matching pair', () => {
    let store = { ...emptyStore(), nowWatching: [watchingEntry('laura', 1, 'A', '2026-01-01T00:00:00.000Z')] }
    store = applyOp(store, { type: 'cancelWatching', profileId: 'laura', tmdbId: 999 })
    expect(store.nowWatching).toHaveLength(1)
  })
})

describe('applyOp: unknown operation', () => {
  it('throws rather than silently doing nothing', () => {
    expect(() => applyOp(emptyStore(), { type: 'bogus' } as never)).toThrow()
  })
})

describe('parseStore', () => {
  it('returns an empty store for null (file absent)', () => {
    expect(parseStore(null)).toEqual(emptyStore())
  })

  it('returns an empty store for unparseable JSON rather than crashing', () => {
    expect(parseStore('{{{')).toEqual(emptyStore())
  })

  it('returns an empty store when the shape is wrong', () => {
    expect(parseStore('[]')).toEqual(emptyStore())
    expect(parseStore('{"history":"nope"}')).toEqual(emptyStore())
  })

  it('preserves a valid store', () => {
    const store: Store = {
      version: 1,
      history: [entry(1, 'Kept', '2026-01-01T00:00:00.000Z')],
      enabledServices: ['netflix'],
      nowWatching: [watchingEntry('laura', 2, 'Watching', '2026-01-02T00:00:00.000Z')],
    }
    expect(parseStore(JSON.stringify(store))).toEqual(store)
  })

  it('defaults a missing nowWatching to an empty array', () => {
    const parsed = parseStore('{"version":1,"history":[]}')
    expect(parsed.nowWatching).toEqual([])
  })

  it('defaults an invalid (non-array) nowWatching to an empty array', () => {
    const parsed = parseStore('{"version":1,"history":[],"nowWatching":"nope"}')
    expect(parsed.nowWatching).toEqual([])
  })

  it('defaults a missing enabledServices to all six rather than none', () => {
    const parsed = parseStore('{"version":1,"history":[]}')
    expect(parsed.enabledServices).toHaveLength(6)
  })

  it('defaults to all six when enabledServices is present but entirely invalid', () => {
    const parsed = parseStore('{"version":1,"history":[],"enabledServices":["bogus"]}')
    expect(parsed.enabledServices).toHaveLength(6)
  })

  it('preserves a deliberate empty enabledServices rather than treating it as corrupt', () => {
    const parsed = parseStore('{"version":1,"history":[],"enabledServices":[]}')
    expect(parsed.enabledServices).toEqual([])
  })

  it('keeps only the valid entries when enabledServices is partially valid', () => {
    const parsed = parseStore('{"version":1,"history":[],"enabledServices":["netflix","bogus"]}')
    expect(parsed.enabledServices).toEqual(['netflix'])
  })
})
