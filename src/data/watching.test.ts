import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  WATCHING_WINDOW_MS, effectiveStatus, startWatching, cancelWatching,
  getNowWatching, getRecentlyWatchedBy, getAllWatchingTonight,
} from './watching'
import { resetStoreForTests, getStoreSnapshot } from './store'
import { applyOp } from '../../vite-plugins/store-ops'
import type { Movie, StoreOp, WatchingEntry } from '../types'

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

const watchingEntry = (
  profileId: string, tmdbId: number, title: string, startedAt: string,
): WatchingEntry => ({
  startedAt,
  profileId,
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
  discoveredVia: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-08T20:00:00Z'))
  resetStoreForTests()
  stubStoreServer()
})
afterEach(() => vi.useRealTimers())

describe('effectiveStatus', () => {
  const NOW = Date.parse('2026-08-08T20:00:00.000Z')

  it('is "watching" just under the 12h window', () => {
    const entry = watchingEntry('laura', 1, 'A', new Date(NOW - WATCHING_WINDOW_MS + 1).toISOString())
    expect(effectiveStatus(entry, NOW)).toBe('watching')
  })

  it('is "watched" exactly at the 12h boundary', () => {
    const entry = watchingEntry('laura', 1, 'A', new Date(NOW - WATCHING_WINDOW_MS).toISOString())
    expect(effectiveStatus(entry, NOW)).toBe('watched')
  })

  it('is "watched" just over the 12h window', () => {
    const entry = watchingEntry('laura', 1, 'A', new Date(NOW - WATCHING_WINDOW_MS - 1).toISOString())
    expect(effectiveStatus(entry, NOW)).toBe('watched')
  })

  it('is "watching" the instant it starts', () => {
    const entry = watchingEntry('laura', 1, 'A', new Date(NOW).toISOString())
    expect(effectiveStatus(entry, NOW)).toBe('watching')
  })

  it('defaults `now` to the current time', () => {
    const entry = watchingEntry('laura', 1, 'A', '2026-08-08T20:00:00.000Z')
    expect(effectiveStatus(entry)).toBe('watching')
  })
})

describe('startWatching', () => {
  it('appends an entry with an ISO timestamp', async () => {
    await startWatching(movie(1585, 'Rushmore'), 'laura', null)
    const [entry] = getNowWatching()

    expect(entry.movie.title).toBe('Rushmore')
    expect(entry.profileId).toBe('laura')
    expect(entry.startedAt).toBe('2026-08-08T20:00:00.000Z')
  })

  it('does not store availability, which is not part of a watching entry', async () => {
    await startWatching(movie(1585, 'Rushmore'), 'laura', null)
    expect(getNowWatching()[0].movie).not.toHaveProperty('availability')
  })
})

describe('cancelWatching', () => {
  it('removes the most recent matching (profileId, tmdbId) entry', async () => {
    await startWatching(movie(1585, 'Rushmore'), 'laura', null)
    await cancelWatching('laura', 1585)
    expect(getNowWatching()).toHaveLength(0)
  })

  it('leaves other profiles watching the same film alone', async () => {
    await startWatching(movie(1585, 'Rushmore'), 'laura', null)
    await startWatching(movie(1585, 'Rushmore'), 'brian', null)
    await cancelWatching('laura', 1585)

    const remaining = getNowWatching()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].profileId).toBe('brian')
  })

  it('is a no-op for a non-matching (profileId, tmdbId) pair', async () => {
    await startWatching(movie(1585, 'Rushmore'), 'laura', null)
    await cancelWatching('brian', 1585)
    expect(getNowWatching()).toHaveLength(1)
  })
})

describe('getNowWatching', () => {
  it('returns entries across all profiles still within their window', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [
        watchingEntry('laura', 1, 'Fresh', '2026-08-08T15:00:00.000Z'), // 5h ago
        watchingEntry('brian', 2, 'Stale', '2026-08-08T00:00:00.000Z'), // 20h ago
      ],
    })

    const now = Date.parse('2026-08-08T20:00:00.000Z')
    expect(getNowWatching(now).map((e) => e.movie.title)).toEqual(['Fresh'])
  })

  it('returns an empty array when nothing is currently watching', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [watchingEntry('laura', 1, 'Old', '2026-08-01T00:00:00.000Z')],
    })

    expect(getNowWatching(Date.parse('2026-08-08T20:00:00.000Z'))).toEqual([])
  })
})

describe('getRecentlyWatchedBy', () => {
  it('returns the newest watched entry for that profile', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [
        watchingEntry('laura', 1, 'Older watched', '2026-08-07T00:00:00.000Z'),
        watchingEntry('laura', 2, 'Newer watched', '2026-08-07T12:00:00.000Z'),
      ],
    })

    const now = Date.parse('2026-08-08T20:00:00.000Z')
    expect(getRecentlyWatchedBy('laura', now)?.movie.title).toBe('Newer watched')
  })

  it('ignores entries still within the watching window', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [watchingEntry('laura', 1, 'Still watching', '2026-08-08T15:00:00.000Z')],
    })

    expect(getRecentlyWatchedBy('laura', Date.parse('2026-08-08T20:00:00.000Z'))).toBeNull()
  })

  it('ignores other profiles', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [watchingEntry('brian', 1, 'Not laura', '2026-08-01T00:00:00.000Z')],
    })

    expect(getRecentlyWatchedBy('laura', Date.parse('2026-08-08T20:00:00.000Z'))).toBeNull()
  })

  it('returns null when the profile has no entries at all', () => {
    expect(getRecentlyWatchedBy('laura', Date.parse('2026-08-08T20:00:00.000Z'))).toBeNull()
  })
})

describe('getAllWatchingTonight', () => {
  it('includes entries regardless of status, unlike getNowWatching', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [
        watchingEntry('laura', 1, 'Still watching', '2026-08-08T15:00:00.000Z'), // 5h ago
        watchingEntry('brian', 2, 'Long since watched', '2026-08-01T00:00:00.000Z'), // days ago
      ],
    })

    const titles = getAllWatchingTonight().map((e) => e.movie.title)
    expect(titles).toEqual(expect.arrayContaining(['Still watching', 'Long since watched']))
    expect(titles).toHaveLength(2)
  })

  it('orders entries newest startedAt first', () => {
    resetStoreForTests({
      version: 2,
      history: [],
      enabledServices: [],
      nowWatching: [
        watchingEntry('laura', 1, 'Older', '2026-08-07T00:00:00.000Z'),
        watchingEntry('brian', 2, 'Newer', '2026-08-08T12:00:00.000Z'),
      ],
    })

    expect(getAllWatchingTonight().map((e) => e.movie.title)).toEqual(['Newer', 'Older'])
  })

  it('returns an empty array when nothing has ever been started', () => {
    expect(getAllWatchingTonight()).toEqual([])
  })
})
