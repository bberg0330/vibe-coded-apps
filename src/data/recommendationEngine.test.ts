import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildRecommendations, type EngineDeps } from './recommendationEngine'
import type { ScoreData } from './scores'
import type { CastMember, Movie } from '../types'

const movie = (tmdbId: number, popularity = 10): Movie => ({
  tmdbId, title: `Movie ${tmdbId}`, year: 2000, posterPath: null, popularity,
  tomatometer: null, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
})

const castMember = (tmdbId: number, order: number): CastMember => ({
  tmdbId, name: `Actor ${tmdbId}`, character: 'Someone', profilePath: null, order,
})

const SOURCE = 100

let deps: EngineDeps & {
  getCredits: ReturnType<typeof vi.fn>
  getFilmography: ReturnType<typeof vi.fn>
  getScores: ReturnType<typeof vi.fn>
}

/** Scores by tmdbId; films not listed have none. */
const scoresById = (byId: Record<number, ScoreData>) =>
  deps.getScores.mockImplementation(async (movies: Movie[]) =>
    new Map(movies.filter((m) => byId[m.tmdbId]).map((m) => [m.tmdbId, byId[m.tmdbId]])))

const build = (limit = 12, exclude?: Set<number>) =>
  buildRecommendations(SOURCE, deps, { limit, exclude, now: new Date('2026-09-29') })

beforeEach(() => {
  deps = {
    getCredits: vi.fn().mockResolvedValue([castMember(1, 0)]),
    getFilmography: vi.fn().mockResolvedValue([]),
    // Comfortably above the floor, so tests about ranking and exclusion aren't affected by it.
    getScores: vi.fn(async (movies: Movie[]) =>
      new Map(movies.map((m) => [m.tmdbId, { critic: 80, audience: 80 }]))),
  }
})

describe('buildRecommendations — candidates and ranking', () => {
  it('excludes the source film and any passed-in exclusions', async () => {
    deps.getFilmography.mockResolvedValue([movie(SOURCE), movie(200), movie(201)])

    const result = await build(12, new Set([200]))

    expect(result.map((m) => m.tmdbId)).toEqual([201])
  })

  it('dedupes films that appear in overlapping actor filmographies', async () => {
    deps.getCredits.mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    deps.getFilmography.mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(300, 50), movie(301, 40)] : [movie(300, 50), movie(302, 30)])

    const result = await build()

    expect(result.map((m) => m.tmdbId).sort()).toEqual([300, 301, 302])
  })

  it('takes only the top 5 billed cast members', async () => {
    deps.getCredits.mockResolvedValue(Array.from({ length: 8 }, (_, i) => castMember(i + 1, i)))

    await build()

    expect(deps.getFilmography.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5])
  })

  it('caps results at the limit', async () => {
    deps.getFilmography.mockResolvedValue(Array.from({ length: 30 }, (_, i) => movie(400 + i, i)))

    expect(await build(12)).toHaveLength(12)
    expect(await build(24)).toHaveLength(24)
  })

  it('ranks a single actor\'s films by popularity descending', async () => {
    deps.getFilmography.mockResolvedValue([movie(500, 10), movie(501, 90), movie(502, 50)])

    expect((await build()).map((m) => m.tmdbId)).toEqual([501, 502, 500])
  })

  it('ranks films sharing more of the cast above more popular ones', async () => {
    deps.getCredits.mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    deps.getFilmography.mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(600, 5), movie(601, 900)] : [movie(600, 5)])

    const result = await build()

    expect(result.map((m) => m.tmdbId)).toEqual([600, 601])
    expect(result[0].viaActors.map((a) => a.tmdbId)).toEqual([1, 2])
  })

  it('prefers films from the higher-billed actor when overlap is equal', async () => {
    deps.getCredits.mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    deps.getFilmography.mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(700, 10)] : [movie(701, 20)])

    expect((await build()).map((m) => m.tmdbId)).toEqual([700, 701])
  })

  it('takes turns between actors instead of letting the lead fill the row', async () => {
    deps.getCredits.mockResolvedValue([castMember(1, 0), castMember(2, 1), castMember(3, 2)])
    deps.getFilmography.mockImplementation(async (personId: number) => {
      if (personId === 1) return Array.from({ length: 10 }, (_, i) => movie(1100 + i, 500 - i))
      if (personId === 2) return [movie(1200, 20), movie(1201, 10)]
      return [movie(1300, 5)]
    })

    const result = await build(6)

    expect(result.map((m) => m.tmdbId)).toEqual([1100, 1200, 1300, 1101, 1201, 1102])
  })

  it('still puts films with several of the cast ahead of the turn-taking', async () => {
    deps.getCredits.mockResolvedValue([castMember(1, 0), castMember(2, 1)])
    deps.getFilmography.mockImplementation(async (personId: number) =>
      personId === 1 ? [movie(1400, 900), movie(1401, 1)] : [movie(1401, 1), movie(1402, 50)])

    expect((await build()).map((m) => m.tmdbId)).toEqual([1401, 1400, 1402])
  })

  it('drops films with no release year or a future one', async () => {
    deps.getFilmography.mockResolvedValue([
      { ...movie(800), year: null }, { ...movie(801), year: 2027 }, { ...movie(802), year: 2026 },
    ])

    expect((await build()).map((m) => m.tmdbId)).toEqual([802])
  })
})

describe('buildRecommendations — score floor', () => {
  it('drops films whose critic and audience scores average below 70', async () => {
    deps.getFilmography.mockResolvedValue([movie(900, 90), movie(901, 10)])
    scoresById({ 900: { critic: 38, audience: 52 }, 901: { critic: 72, audience: 70 } })

    expect((await build()).map((m) => m.tmdbId)).toEqual([901])
  })

  it('returns items with both scores filled in', async () => {
    deps.getFilmography.mockResolvedValue([movie(900)])
    scoresById({ 900: { critic: 93, audience: 79 } })

    expect((await build())[0]).toMatchObject({ tomatometer: 93, popcornmeter: 79 })
  })

  it('judges a film on its one score when the other is missing', async () => {
    deps.getFilmography.mockResolvedValue([movie(900), movie(901)])
    scoresById({ 900: { critic: 95, audience: null }, 901: { critic: 60, audience: null } })

    expect((await build()).map((m) => m.tmdbId)).toEqual([900])
  })

  it('falls back to the TMDB vote average when IMDb has no rating', async () => {
    deps.getFilmography.mockResolvedValue([
      { ...movie(900), voteAverage: 7.8, voteCount: 500 },
      { ...movie(901), voteAverage: 9.5, voteCount: 3 },
    ])
    scoresById({})

    const result = await build()

    expect(result.map((m) => m.tmdbId)).toEqual([900])
    expect(result[0].popcornmeter).toBe(78)
  })

  it('treats a failed score lookup as no scores rather than failing the list', async () => {
    deps.getFilmography.mockResolvedValue([{ ...movie(900), voteAverage: 8, voteCount: 500 }, movie(901)])
    deps.getScores.mockRejectedValue(new Error('OMDb down'))

    expect((await build()).map((m) => m.tmdbId)).toEqual([900])
  })

  it('backfills from lower-ranked candidates when top ones fail the floor', async () => {
    const films = Array.from({ length: 20 }, (_, i) => movie(1000 + i, 100 - i))
    deps.getFilmography.mockResolvedValue(films)
    scoresById(Object.fromEntries(films.map((f, i) =>
      [f.tmdbId, i < 5 ? { critic: 30, audience: 40 } : { critic: 80, audience: 80 }])))

    const result = await build()

    expect(result).toHaveLength(12)
    expect(result[0].tmdbId).toBe(1005)
  })
})

describe('buildRecommendations — batched score lookups', () => {
  const scoredCount = () => deps.getScores.mock.calls.reduce((n, [movies]) => n + movies.length, 0)

  it('stops fetching scores once enough films clear the floor', async () => {
    deps.getFilmography.mockResolvedValue(Array.from({ length: 36 }, (_, i) => movie(2000 + i, 100 - i)))

    expect(await build(12)).toHaveLength(12)
    expect(scoredCount()).toBe(12)
  })

  it('fetches the next batch only when the first leaves the list short', async () => {
    const films = Array.from({ length: 36 }, (_, i) => movie(3000 + i, 100 - i))
    deps.getFilmography.mockResolvedValue(films)
    scoresById(Object.fromEntries(films.map((f, i) =>
      [f.tmdbId, i % 2 === 0 ? { critic: 80, audience: 80 } : { critic: 30, audience: 30 }])))

    const result = await build(12)

    expect(result.map((m) => m.tmdbId)).toEqual(films.filter((_, i) => i % 2 === 0).slice(0, 12).map((f) => f.tmdbId))
    expect(scoredCount()).toBe(24)
  })

  it('never looks up more than the 36 best-ranked candidates', async () => {
    deps.getFilmography.mockResolvedValue(Array.from({ length: 50 }, (_, i) => movie(4000 + i, 100 - i)))
    scoresById({})

    expect(await build(12)).toEqual([])
    expect(scoredCount()).toBe(36)
  })
})
