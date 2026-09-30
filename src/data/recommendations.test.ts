import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRecommendationsFor } from './recommendations'
import { getRecentlyWatchedBy, getAllWatchingTonight } from './watching'
import { getHistory } from './history'
import { getMovieCredits, getActorFilmography } from '../api/tmdb'
import { getRottenTomatoesScores } from '../api/omdb'
import type { CastMember, Movie, WatchEntry, WatchingEntry } from '../types'

vi.mock('./watching', () => ({
  getRecentlyWatchedBy: vi.fn(),
  getAllWatchingTonight: vi.fn(),
}))
vi.mock('./history', () => ({
  getHistory: vi.fn(),
}))
vi.mock('../api/omdb', () => ({
  getRottenTomatoesScores: vi.fn(),
}))
vi.mock('../api/tmdb', () => ({
  getMovieCredits: vi.fn(),
  getActorFilmography: vi.fn(),
}))

const movie = (tmdbId: number, popularity = 10): Movie => ({
  tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, popularity,
  tomatometer: null, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
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
  // Comfortably above the floor, so tests about ranking and exclusion aren't affected by it.
  vi.mocked(getRottenTomatoesScores).mockResolvedValue({ critic: 80, audience: 80 })
})

describe('getRecommendationsFor', () => {
  it('returns null when neither the profile nor the household has watched anything', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(null)

    const result = await getRecommendationsFor('laura')

    expect(result).toBeNull()
    expect(getMovieCredits).not.toHaveBeenCalled()
  })

  it('excludes films already in shared history', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(200), movie(201)])
    vi.mocked(getHistory).mockReturnValue([watchEntry(200)])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('excludes films already in nowWatching (any profile, any status)', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(200), movie(201)])
    vi.mocked(getAllWatchingTonight).mockReturnValue([watchingEntry(200)])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('excludes the source film itself', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([movie(100), movie(201)])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('dedupes films that appear in overlapping actor filmographies', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    vi.mocked(getActorFilmography).mockImplementation(async (personId: number) => {
      if (personId === 1) return [movie(300, 50), movie(301, 40)]
      return [movie(300, 50), movie(302, 30)]
    })

    const result = (await getRecommendationsFor('laura'))!.items

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

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result).toHaveLength(12)
  })

  it('ranks results by popularity descending', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([
      movie(500, 10), movie(501, 90), movie(502, 50),
    ])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([501, 502, 500])
  })

  it('returns the source film alongside the items', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))

    const result = await getRecommendationsFor('laura')

    expect(result?.source.tmdbId).toBe(100)
  })

  it('falls back to the most recent household history entry', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(null)
    vi.mocked(getHistory).mockReturnValue([watchEntry(150)])

    const result = await getRecommendationsFor('laura')

    expect(result?.source.tmdbId).toBe(150)
  })

  it('ranks films sharing more of the cast above more popular ones', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    vi.mocked(getActorFilmography).mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(600, 5), movie(601, 900)] : [movie(600, 5)])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([600, 601])
    expect(result[0].viaActors.map((a) => a.tmdbId)).toEqual([1, 2])
  })

  it('prefers films from the higher-billed actor when overlap is equal', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    vi.mocked(getActorFilmography).mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(700, 10)] : [movie(701, 20)])

    const result = (await getRecommendationsFor('laura'))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([700, 701])
  })

  it('drops films with no release year or a future one', async () => {
    vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
    vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    vi.mocked(getActorFilmography).mockResolvedValue([
      { ...movie(800), year: null }, { ...movie(801), year: 2027 }, { ...movie(802), year: 2026 },
    ])

    const result = (await getRecommendationsFor('laura', new Date('2026-09-29')))!.items

    expect(result.map((m) => m.tmdbId)).toEqual([802])
  })

  describe('score floor', () => {
    const scoresById = (byId: Record<number, { critic: number | null; audience: number | null }>) =>
      vi.mocked(getRottenTomatoesScores).mockImplementation(async (tmdbId: number) =>
        byId[tmdbId] ?? { critic: null, audience: null })

    beforeEach(() => {
      vi.mocked(getRecentlyWatchedBy).mockReturnValue(recentWatch(100))
      vi.mocked(getMovieCredits).mockResolvedValue([castMember(1, 0)])
    })

    it('drops films whose critic and audience scores average below 70', async () => {
      vi.mocked(getActorFilmography).mockResolvedValue([movie(900, 90), movie(901, 10)])
      scoresById({ 900: { critic: 38, audience: 52 }, 901: { critic: 72, audience: 70 } })

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result.map((m) => m.tmdbId)).toEqual([901])
    })

    it('returns items with both scores filled in', async () => {
      vi.mocked(getActorFilmography).mockResolvedValue([movie(900)])
      scoresById({ 900: { critic: 93, audience: 79 } })

      const [item] = (await getRecommendationsFor('laura'))!.items

      expect(item).toMatchObject({ tomatometer: 93, popcornmeter: 79 })
    })

    it('judges a film on its one score when the other is missing', async () => {
      vi.mocked(getActorFilmography).mockResolvedValue([movie(900), movie(901)])
      scoresById({ 900: { critic: 95, audience: null }, 901: { critic: 60, audience: null } })

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result.map((m) => m.tmdbId)).toEqual([900])
    })

    it('falls back to the TMDB vote average when IMDb has no rating', async () => {
      vi.mocked(getActorFilmography).mockResolvedValue([
        { ...movie(900), voteAverage: 7.8, voteCount: 500 },
        { ...movie(901), voteAverage: 9.5, voteCount: 3 },
      ])
      scoresById({})

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result.map((m) => m.tmdbId)).toEqual([900])
      expect(result[0].popcornmeter).toBe(78)
    })

    it('drops films with no score at all, even if a lookup fails', async () => {
      vi.mocked(getActorFilmography).mockResolvedValue([movie(900), movie(901)])
      vi.mocked(getRottenTomatoesScores).mockImplementation(async (tmdbId: number) => {
        if (tmdbId === 900) throw new Error('OMDb down')
        return { critic: 80, audience: 80 }
      })

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result.map((m) => m.tmdbId)).toEqual([901])
    })

    it('backfills from lower-ranked candidates when top ones fail the floor', async () => {
      const films = Array.from({ length: 20 }, (_, i) => movie(1000 + i, 100 - i))
      vi.mocked(getActorFilmography).mockResolvedValue(films)
      const scores: Record<number, { critic: number; audience: number }> = {}
      films.forEach((f, i) => { scores[f.tmdbId] = i < 5 ? { critic: 30, audience: 40 } : { critic: 80, audience: 80 } })
      scoresById(scores)

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result).toHaveLength(12)
      expect(result[0].tmdbId).toBe(1005)
    })

    it('stops fetching scores once enough films clear the floor', async () => {
      const films = Array.from({ length: 36 }, (_, i) => movie(2000 + i, 100 - i))
      vi.mocked(getActorFilmography).mockResolvedValue(films)

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result).toHaveLength(12)
      expect(getRottenTomatoesScores).toHaveBeenCalledTimes(12)
    })

    it('fetches the next batch only when the first leaves the row short', async () => {
      const films = Array.from({ length: 36 }, (_, i) => movie(3000 + i, 100 - i))
      vi.mocked(getActorFilmography).mockResolvedValue(films)
      scoresById(Object.fromEntries(films.map((f, i) => [f.tmdbId, i % 2 === 0
        ? { critic: 80, audience: 80 } : { critic: 30, audience: 30 }])))

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result).toHaveLength(12)
      expect(result.map((m) => m.tmdbId)).toEqual(films.filter((_, i) => i % 2 === 0).slice(0, 12).map((f) => f.tmdbId))
      expect(getRottenTomatoesScores).toHaveBeenCalledTimes(24)
    })

    it('never looks up more than the 36 best-ranked candidates', async () => {
      const films = Array.from({ length: 50 }, (_, i) => movie(4000 + i, 100 - i))
      vi.mocked(getActorFilmography).mockResolvedValue(films)
      scoresById({})

      const result = (await getRecommendationsFor('laura'))!.items

      expect(result).toEqual([])
      expect(getRottenTomatoesScores).toHaveBeenCalledTimes(36)
    })
  })
})
