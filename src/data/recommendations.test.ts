import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecommendationsFor } from './recommendations'
import { getRecentlyWatchedBy, getAllWatchingTonight } from './watching'
import { getHistory } from './history'
import { getMovieCredits, getActorFilmography } from '../api/tmdb'
import type { CastMember, Movie, WatchEntry, WatchingEntry } from '../types'

vi.mock('./watching', () => ({
  getRecentlyWatchedBy: vi.fn(),
  getAllWatchingTonight: vi.fn(),
}))
vi.mock('./history', () => ({
  getHistory: vi.fn(),
}))
vi.mock('../api/tmdb', () => ({
  getMovieCredits: vi.fn(),
  getActorFilmography: vi.fn(),
}))

const movie = (tmdbId: number, popularity = 10): Movie => ({
  tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, popularity,
  tomatometer: null, popcornmeter: null, availability: { streaming: [], rent: [] },
})

const castMember = (tmdbId: number, order: number): CastMember => ({
  tmdbId, name: `Actor ${tmdbId}`, character: 'Someone', profilePath: null, order,
})

const watchEntry = (tmdbId: number): WatchEntry => ({
  watchedAt: '2026-01-01T00:00:00.000Z',
  movie: { tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null },
  discoveredVia: null,
})

const watchingEntry = (tmdbId: number): WatchingEntry => ({
  startedAt: '2026-01-01T00:00:00.000Z',
  profileId: 'someone-else',
  movie: { tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, tomatometer: null, popcornmeter: null },
  discoveredVia: null,
})

const recentWatch = (tmdbId: number): WatchingEntry => watchingEntry(tmdbId)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getHistory).mockReturnValue([])
  vi.mocked(getAllWatchingTonight).mockReturnValue([])
  vi.mocked(getMovieCredits).mockResolvedValue([])
  vi.mocked(getActorFilmography).mockResolvedValue([])
})

describe('getRecommendationsFor', () => {
  it('returns [] when the profile has no recent watch', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(null)

    const result = await getRecommendationsFor('laura')

    expect(result).toEqual([])
    expect(getMovieCredits).not.toHaveBeenCalled()
  })

  it('excludes films already in shared history', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(200), movie(201)])
    vi.mocked(getHistory).mockReturnValue([watchEntry(200)])

    const result = await getRecommendationsFor('laura')

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('excludes films already in nowWatching (any profile, any status)', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(200), movie(201)])
    vi.mocked(getAllWatchingTonight).mockReturnValue([watchingEntry(200)])

    const result = await getRecommendationsFor('laura')

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('excludes the source film itself', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(100), movie(201)])

    const result = await getRecommendationsFor('laura')

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('dedupes films that appear in overlapping actor filmographies', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    vi.mocked(getActorFilmography).mockImplementation(async (personId: number) => {
      if (personId === 1) return [movie(300, 50), movie(301, 40)]
      return [movie(300, 50), movie(302, 30)]
    })

    const result = await getRecommendationsFor('laura')

    expect(result.map((m) => m.tmdbId).sort()).toEqual([300, 301, 302])
  })

  it('takes only the top 5 billed cast members', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    const cast = Array.from({ length: 8 }, (_, i) => castMember(i + 1, i))
    vi.mocked(getMovieCredits).mockResolvedValue(cast)
    vi.mocked(getActorFilmography).mockResolvedValue([])

    await getRecommendationsFor('laura')

    expect(getActorFilmography).toHaveBeenCalledTimes(5)
    expect(vi.mocked(getActorFilmography).mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5])
  })

  it('caps results at 12, keeping the most popular', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    const films = Array.from({ length: 20 }, (_, i) => movie(400 + i, i))
    vi.mocked(getActorFilmography).mockResolvedValue(films)

    const result = await getRecommendationsFor('laura')

    expect(result).toHaveLength(12)
  })

  it('ranks results by popularity descending', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([
      movie(500, 10), movie(501, 90), movie(502, 50),
    ])

    const result = await getRecommendationsFor('laura')

    expect(result.map((m) => m.tmdbId)).toEqual([501, 502, 500])
  })
})
