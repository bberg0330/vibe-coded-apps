import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  logWatch, getHistory, undoLastWatch, watchCount, exportJson, importJson,
  markSeenBefore, unmarkSeenBefore, setSeenBeforeDate, getSeenBefore,
} from './history'
import { resetStoreForTests, getStoreSnapshot } from './store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { Movie, StoreOp } from '../types'

/** A fake server: applies the op to the current snapshot and echoes it back. */
function stubStoreServer() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    const op = JSON.parse(String(init?.body)) as StoreOp
    const next = applyOp(getStoreSnapshot(), op)
    return { ok: true, status: 200, json: async () => next }
  }))
}

const movie = (tmdbId: number, title: string): Movie => ({
  tmdbId, title, year: 1998, posterPath: '/p.jpg', popularity: 10,
  tomatometer: 90, popcornmeter: null, availability: { streaming: ['netflix'], rent: [] },
  overview: null,
})

const via = {
  fromMovie: { tmdbId: 153, title: 'Lost in Translation' },
  viaActor: { tmdbId: 1532, name: 'Bill Murray' },
}

const applyOpViaServer = (op: StoreOp) => fetch('/api/store', { method: 'POST', body: JSON.stringify(op) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
  resetStoreForTests()
  stubStoreServer()
})
afterEach(() => vi.useRealTimers())

describe('logWatch', () => {
  it('records the film with an ISO timestamp', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    const [entry] = getHistory()

    expect(entry.movie.title).toBe('Rushmore')
    expect(entry.watchedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('records the discovery path', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('records a null path for a directly searched film', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].discoveredVia).toBeNull()
  })

  it('snapshots the tomatometer as known at log time', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie.tomatometer).toBe(90)
  })

  it('does not store availability, which is not history', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()[0].movie).not.toHaveProperty('availability')
  })

  it('appends a rewatch instead of overwriting', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(1585, 'Rushmore'), null)

    expect(getHistory()).toHaveLength(2)
    expect(watchCount(1585)).toBe(2)
  })

  it('returns history newest first', async () => {
    await logWatch(movie(1, 'First'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(2, 'Second'), null)

    expect(getHistory().map((e) => e.movie.title)).toEqual(['Second', 'First'])
  })

  it('persists across reads of the in-memory store', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('undoLastWatch', () => {
  it('removes only the most recent entry for that film', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(1585, 'Rushmore'), null)

    await undoLastWatch(1585)
    expect(watchCount(1585)).toBe(1)
  })

  it('leaves other films alone', async () => {
    await logWatch(movie(1, 'Keep'), null)
    await logWatch(movie(2, 'Remove'), null)

    await undoLastWatch(2)
    expect(getHistory().map((e) => e.movie.title)).toEqual(['Keep'])
  })

  it('is a no-op for an unlogged film', async () => {
    await logWatch(movie(1, 'Keep'), null)
    await undoLastWatch(999)
    expect(getHistory()).toHaveLength(1)
  })
})

describe('seen before', () => {
  it('records a film with no date, kept out of movie nights but counted as watched', async () => {
    await logWatch(movie(1, 'Heat'), null)
    const entry = await markSeenBefore(movie(2, 'Parasite'))

    expect(entry?.watchedAt).toBeNull()
    expect(entry?.discoveredVia).toBeNull()
    expect(getHistory().map((e) => e.movie.tmdbId)).toEqual([1])
    expect(getSeenBefore().map((e) => e.movie.tmdbId)).toEqual([2])
    expect(watchCount(2)).toBe(1)
  })

  it('does nothing for a film already in history in any form', async () => {
    await logWatch(movie(1, 'Heat'), null)
    await markSeenBefore(movie(2, 'Parasite'))

    expect(await markSeenBefore(movie(1, 'Heat'))).toBeNull()
    expect(await markSeenBefore(movie(2, 'Parasite'))).toBeNull()
    expect(getStoreSnapshot().history).toHaveLength(2)
  })

  it('takes the film off the watchlist, like any watch', async () => {
    await applyOpViaServer({ type: 'addToWatchlist', entry: { addedAt: '2026-08-01T00:00:00Z', profileId: 'laura', movie: { tmdbId: 2, title: 'Parasite', year: 2019, posterPath: null, tomatometer: null, popcornmeter: null } } } as StoreOp)
    await markSeenBefore(movie(2, 'Parasite'))
    expect(getStoreSnapshot().watchlist).toEqual([])
  })

  it('unmarks only the undated entry', async () => {
    await logWatch(movie(1, 'Heat'), null)
    await markSeenBefore(movie(2, 'Parasite'))

    await unmarkSeenBefore(2)
    await unmarkSeenBefore(1)

    expect(getSeenBefore()).toEqual([])
    expect(getHistory().map((e) => e.movie.tmdbId)).toEqual([1])
  })

  it('becomes a movie night, in date order, once given a date', async () => {
    await logWatch(movie(1, 'Heat'), null) // 2026-08-08
    await markSeenBefore(movie(2, 'Parasite'))

    await setSeenBeforeDate(2, '2020-02-14T20:00:00.000Z')

    expect(getSeenBefore()).toEqual([])
    expect(getHistory().map((e) => [e.movie.tmdbId, e.watchedAt])).toEqual([
      [1, '2026-08-08T20:00:00.000Z'],
      [2, '2020-02-14T20:00:00.000Z'],
    ])
  })

  it('rejects a date that does not parse', async () => {
    await markSeenBefore(movie(2, 'Parasite'))
    await expect(setSeenBeforeDate(2, 'last spring')).rejects.toThrow('Invalid date')
  })
})

describe('export and import', () => {
  it('round-trips without loss', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    const json = exportJson()

    resetStoreForTests()
    expect(getHistory()).toHaveLength(0)

    const count = await importJson(json)
    expect(count).toBe(1)
    expect(getHistory()[0].discoveredVia).toEqual(via)
  })

  it('round-trips "seen before" entries, which have no date', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    await markSeenBefore(movie(2, 'Parasite'))
    const json = exportJson()

    resetStoreForTests()
    expect(await importJson(json)).toBe(2)
    expect(getSeenBefore().map((e) => e.movie.tmdbId)).toEqual([2])
    expect(getHistory().map((e) => e.movie.tmdbId)).toEqual([1585])
  })

  it('exports human-readable JSON', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    expect(exportJson()).toContain('\n')
  })

  it('rejects malformed JSON without destroying existing history', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    await expect(importJson('{{{')).rejects.toThrow()
    expect(getHistory()).toHaveLength(1)
  })

  it('rejects an array of shapeless objects without destroying existing history', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    await expect(importJson('[{}]')).rejects.toThrow()
    expect(getHistory()).toHaveLength(1)
    expect(getHistory()[0].movie.title).toBe('Rushmore')
  })

  it('rejects a batch with one malformed entry, writing nothing at all', async () => {
    await logWatch(movie(1585, 'Rushmore'), null)
    const before = getHistory()

    const goodEntry = {
      watchedAt: '2026-08-08T20:00:00.000Z',
      movie: { tmdbId: 2, title: 'Second', year: 1998, posterPath: null, tomatometer: null },
      discoveredVia: null,
    }
    const badEntry = { watchedAt: 'not-a-date', movie: {}, discoveredVia: null }

    await expect(importJson(JSON.stringify([goodEntry, badEntry]))).rejects.toThrow()
    expect(getHistory()).toEqual(before)
  })

  it('names the index of the first bad entry in the error message', async () => {
    const goodEntry = {
      watchedAt: '2026-08-08T20:00:00.000Z',
      movie: { tmdbId: 2, title: 'Second', year: 1998, posterPath: null, tomatometer: null },
      discoveredVia: null,
    }
    const badEntry = { watchedAt: 'not-a-date', movie: {}, discoveredVia: null }

    await expect(importJson(JSON.stringify([goodEntry, badEntry]))).rejects.toThrow(/index 1/)
  })

  it('round-trips two entries, with and without a discovery path, through export/import', async () => {
    await logWatch(movie(1585, 'Rushmore'), via)
    vi.setSystemTime(new Date('2026-09-01T20:00:00Z'))
    await logWatch(movie(2001, 'Direct Search'), null)

    const before = getHistory()
    const json = exportJson()

    resetStoreForTests()
    expect(getHistory()).toHaveLength(0)

    const count = await importJson(json)
    expect(count).toBe(2)
    expect(getHistory()).toEqual(before)
  })
})

describe('seen before, on two devices at once', () => {
  it('the store ignores a second undated mark for the same film, and dates only one entry', async () => {
    const entry = { watchedAt: null, movie: { tmdbId: 2, title: 'Parasite', year: 2019, posterPath: null, tomatometer: null, popcornmeter: null }, discoveredVia: null }
    let s = applyOp(getStoreSnapshot(), { type: 'logWatch', entry })
    s = applyOp(s, { type: 'logWatch', entry })
    expect(s.history).toHaveLength(1)
    s = applyOp({ ...s, history: [...s.history, entry] }, { type: 'setWatchDate', tmdbId: 2, watchedAt: '2020-01-01T12:00:00.000Z' })
    expect(s.history.map((e) => e.watchedAt)).toEqual(['2020-01-01T12:00:00.000Z', null])
  })
})
