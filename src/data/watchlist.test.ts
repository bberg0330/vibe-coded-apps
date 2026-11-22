import { describe, it, expect } from 'vitest'
import { resetStoreForTests } from './store'
import { getWatchlist, isOnWatchlist, relativeAdded } from './watchlist'
import { emptyStore } from '../types'
import type { WatchlistEntry } from '../types'

const entry = (tmdbId: number, addedAt: string): WatchlistEntry => ({
  addedAt,
  profileId: 'laura',
  movie: { tmdbId, title: `Film ${tmdbId}`, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null },
})

describe('getWatchlist', () => {
  it('lists the most recently added first', () => {
    resetStoreForTests({
      ...emptyStore(),
      watchlist: [entry(1, '2026-01-01T00:00:00.000Z'), entry(2, '2026-03-01T00:00:00.000Z'), entry(3, '2026-02-01T00:00:00.000Z')],
    })
    expect(getWatchlist().map((e) => e.movie.tmdbId)).toEqual([2, 3, 1])
  })

  it('tolerates a store from before the watchlist existed', () => {
    const legacy = { ...emptyStore() } as Partial<ReturnType<typeof emptyStore>>
    delete legacy.watchlist
    resetStoreForTests(legacy as ReturnType<typeof emptyStore>)
    expect(getWatchlist()).toEqual([])
    expect(isOnWatchlist(1)).toBe(false)
  })
})

describe('relativeAdded', () => {
  const now = Date.parse('2026-11-22T12:00:00.000Z')
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [3, '3 days ago'],
    [8, 'last week'],
    [15, '2 weeks ago'],
    [35, 'last month'],
    [120, '4 months ago'],
    [400, 'last year'],
  ])('%i days → %s', (days, label) => {
    expect(relativeAdded(daysAgo(days), now)).toBe(label)
  })
})
