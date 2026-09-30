import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecommendationsFor } from './recommendations'
import { getRecentlyWatchedBy, getAllWatchingTonight } from './watching'
import { getHistory } from './history'
import type { Movie, WatchEntry, WatchingEntry } from '../types'

vi.mock('./watching', () => ({
  getRecentlyWatchedBy: vi.fn(),
  getAllWatchingTonight: vi.fn(),
}))
vi.mock('./history', () => ({
  getHistory: vi.fn(),
}))

const entryMovie = (tmdbId: number) =>
  ({ tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null })

const watchEntry = (tmdbId: number): WatchEntry =>
  ({ watchedAt: '2026-01-01T00:00:00.000Z', movie: entryMovie(tmdbId), discoveredVia: null })

const watchingEntry = (tmdbId: number): WatchingEntry =>
  ({ startedAt: '2026-01-01T00:00:00.000Z', profileId: 'someone-else', movie: entryMovie(tmdbId), discoveredVia: null })

const item = (tmdbId: number): Movie & { viaActors: [] } => ({
  tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, popularity: 1,
  tomatometer: 80, popcornmeter: 80, availability: { streaming: [], rent: [] }, overview: null, viaActors: [],
})

function serve(ids: number[], ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 502, json: async () => ({ items: ids.map(item) }) })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRecentlyWatchedBy).mockReturnValue(null)
  vi.mocked(getHistory).mockReturnValue([])
  vi.mocked(getAllWatchingTonight).mockReturnValue([])
})

describe('getRecommendationsFor', () => {
  it('returns null without calling the server when there is no source film', async () => {
    const f = serve([])

    expect(await getRecommendationsFor('laura')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it("asks the server for the source film's shared list", async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(watchingEntry(100))
    const f = serve([200])

    const result = await getRecommendationsFor('laura')

    expect(f.mock.calls[0][0]).toBe('/api/recommendations?source=100')
    expect(result?.source.tmdbId).toBe(100)
    expect(result?.items.map((m) => m.tmdbId)).toEqual([200])
  })

  it('falls back to the most recent household history entry as the source', async () => {
    vi.mocked(getHistory).mockReturnValue([watchEntry(150)])
    serve([])

    expect((await getRecommendationsFor('laura'))?.source.tmdbId).toBe(150)
  })

  it('drops films the household has already watched, in history or tonight', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(watchingEntry(100))
    vi.mocked(getHistory).mockReturnValue([watchEntry(200)])
    vi.mocked(getAllWatchingTonight).mockReturnValue([watchingEntry(201)])
    serve([200, 201, 202])

    expect((await getRecommendationsFor('laura'))?.items.map((m) => m.tmdbId)).toEqual([202])
  })

  it('keeps the top 12 of the shared list, in order', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(watchingEntry(100))
    const ids = Array.from({ length: 24 }, (_, i) => 300 + i)
    serve(ids)

    expect((await getRecommendationsFor('laura'))?.items.map((m) => m.tmdbId)).toEqual(ids.slice(0, 12))
  })

  it('rejects when the server fails, so the carousel stays hidden', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(watchingEntry(100))
    serve([], false)

    await expect(getRecommendationsFor('laura')).rejects.toThrow()
  })
})
