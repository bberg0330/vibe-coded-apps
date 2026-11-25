import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleRewind, rankFilms, refreshRewind, rewindScore, yearsToCheck,
  REWIND_RANKING_VERSION, REWIND_SIZE, YEARS_PER_RUN, type RewindFilm, type RewindStore, type SavedYear,
} from './rewind'
import type { ScoreData } from '../../src/data/scores'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const NOW = new Date('2026-11-24T09:17:00Z')

/** What TMDB says about a film. Ids not listed get 8.0 from 900 votes. */
type Votes = { vote_average: number; vote_count: number }
/** Discover by year: `films[year]` is the year's rankable TMDB ids, served 20 a page. */
let fetchMock: ReturnType<typeof vi.fn>
function stubDiscover(films: Record<number, number[]>, votes: Record<number, Votes> = {}) {
  fetchMock = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams
    const list = films[Number(q.get('primary_release_year'))] ?? []
    const page = Number(q.get('page'))
    return ok({
      page, total_pages: Math.max(Math.ceil(list.length / 20), 1),
      results: list.slice((page - 1) * 20, page * 20).map((id) => {
        const { vote_average, vote_count }: Votes = votes[id] ?? { vote_average: 8, vote_count: 900 }
        return { id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, release_date: '2019-05-01', vote_average, vote_count, popularity: 50 }
      }),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const years = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)).searchParams)

const current = (refreshAfter: Date | null = null): SavedYear => ({ refreshAfter, version: REWIND_RANKING_VERSION })

/** `scoreOf(id)` is OMDb's answer for a film, or undefined while it is still unrated. */
function memoryStore(
  saved: Map<number, SavedYear> = new Map(),
  scoreOf: (id: number) => ScoreData | undefined = () => ({ critic: null, audience: null }),
) {
  return {
    saved: vi.fn(async () => saved),
    save: vi.fn(async (_year: number, _films: RewindFilm[], _at: Date, _refresh: Date | null) => undefined),
    scores: vi.fn(async (ids: number[]) => new Map(ids.flatMap((id) => { const s = scoreOf(id); return s ? [[id, s] as const] : [] }))),
  } satisfies RewindStore
}
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)
const film = (tmdbId: number, voteAverage: number, voteCount: number): RewindFilm =>
  ({ tmdbId, title: `Film ${tmdbId}`, posterPath: null, releaseDate: null, voteAverage, voteCount, popularity: 1 })

beforeEach(() => vi.unstubAllGlobals())

describe('yearsToCheck', () => {
  it('starts with the current year, then past years the backfill has passed, newest first', () => {
    expect(yearsToCheck(new Map(), { year: 2022, page: 3 }, NOW)).toEqual([2026, 2025, 2024, 2023])
  })

  it('skips saved years, and the current year until its refresh date', () => {
    const saved = new Map([[2026, current(new Date('2026-11-30'))], [2025, current()]])
    expect(yearsToCheck(saved, { year: 2022, page: 1 }, NOW)).toEqual([2024, 2023])
    saved.set(2026, current(new Date('2026-11-20')))
    expect(yearsToCheck(saved, { year: 2022, page: 1 }, NOW)).toEqual([2026, 2024, 2023])
  })

  it('rebuilds years saved by an older ranking, newest first, current year included', () => {
    const old: SavedYear = { refreshAfter: null, version: REWIND_RANKING_VERSION - 1 }
    const saved = new Map([[2026, { ...old, refreshAfter: new Date('2026-11-30') }], [2025, old], [2024, current()], [2023, old]])
    expect(yearsToCheck(saved, { year: 2022, page: 1 }, NOW)).toEqual([2026, 2025, 2023])
  })

  it(`checks at most ${YEARS_PER_RUN} past years a night, and every year once the backfill is done`, () => {
    expect(yearsToCheck(new Map(), null, NOW)).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
  })
})

describe('rewindScore', () => {
  it('prefers a film many people rated well over one a few hundred rated slightly higher', () => {
    expect(rewindScore(film(1, 7.6, 4000))).toBeGreaterThan(rewindScore(film(2, 8.4, 300)))
  })

  it('lets critics lift a film, and treats a missing critic score as neutral', () => {
    const f = film(1, 7.4, 1500)
    const loved = rewindScore(f, { critic: 95, audience: null })
    const panned = rewindScore(f, { critic: 40, audience: null })
    const unknown = rewindScore(f, { critic: null, audience: null })
    expect(loved).toBeGreaterThan(unknown)
    expect(unknown).toBeGreaterThan(panned)
    expect(rewindScore(f)).toBe(unknown)
  })

  it('averages IMDb\'s audience score with TMDB\'s when OMDb has one', () => {
    const f = film(1, 7, 2000)
    expect(rewindScore(f, { critic: null, audience: 90 })).toBeGreaterThan(rewindScore(f))
    expect(rewindScore(f, { critic: null, audience: 50 })).toBeLessThan(rewindScore(f))
  })

  it('treats a film with no votes as the unproven film it is, not a NaN', () => {
    expect(Number.isFinite(rewindScore(film(1, 0, 0)))).toBe(true)
  })
})

describe('rankFilms', () => {
  it('orders best first by the blended score, using OMDb scores for the films that have them', () => {
    const films = [film(1, 7.5, 2000), film(2, 7.5, 2000), film(3, 7.5, 2000)]
    const scores = new Map<number, ScoreData>([[3, { critic: 96, audience: 80 }], [2, { critic: 30, audience: 55 }]])
    expect(rankFilms(films, scores).map((f) => f.tmdbId)).toEqual([3, 1, 2])
  })

  it('breaks ties by votes, then id, so the order never shuffles between runs', () => {
    const films = [film(5, 7, 1000), film(4, 7, 1000), film(6, 7, 1000)]
    expect(rankFilms(films, new Map()).map((f) => f.tmdbId)).toEqual([4, 5, 6])
  })

  it('does not change the films it is given', () => {
    const films = [film(2, 6, 500), film(1, 9, 5000)]
    rankFilms(films, new Map())
    expect(films.map((f) => f.tmdbId)).toEqual([2, 1])
  })
})

describe('refreshRewind', () => {
  it('saves the top 50 once every rankable film in the year has been checked', async () => {
    stubDiscover({ 2025: range(1, 70) })
    const store = memoryStore(new Map([[2026, current()]]))

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    const q = years()[0]
    expect(q.get('primary_release_year')).toBe('2025')
    expect(q.get('vote_count.gte')).toBe('300')
    // Feature films only: shorts and making-ofs are left out.
    expect(q.get('with_runtime.gte')).toBe('60')
    expect(years().map((p) => p.get('page'))).toEqual(['1', '2', '3', '4'])
    expect(store.scores).toHaveBeenCalledWith(range(1, 70))
    const [year, films, , refreshAfter] = store.save.mock.calls[0]
    expect(year).toBe(2025)
    expect(films).toHaveLength(REWIND_SIZE)
    expect(films[0]).toEqual({ tmdbId: 1, title: 'Film 1', posterPath: '/p1.jpg', releaseDate: '2019-05-01', voteAverage: 8, voteCount: 900, popularity: 50 })
    expect(refreshAfter).toBeNull()
    expect(summary).toEqual({ saved: [2025], notReady: [] })
  })

  it('ranks by the blend of TMDB and OMDb scores, not TMDB rating alone', async () => {
    // Film 1 has the top TMDB rating but a few hundred votes and a poor critic score.
    stubDiscover({ 2025: [1, 2, 3] }, {
      1: { vote_average: 8.6, vote_count: 320 },
      2: { vote_average: 7.4, vote_count: 3000 },
      3: { vote_average: 7.4, vote_count: 3000 },
    })
    const scores: Record<number, ScoreData> = { 1: { critic: 35, audience: 70 }, 2: { critic: 90, audience: 74 }, 3: { critic: null, audience: null } }
    const store = memoryStore(new Map([[2026, current()]]), (id) => scores[id])

    await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save.mock.calls[0][1].map((f) => f.tmdbId)).toEqual([2, 3, 1])
  })

  it('leaves a year for tomorrow while any of its rankable films is still unrated', async () => {
    stubDiscover({ 2025: range(1, 30) })
    const store = memoryStore(new Map([[2026, current()]]), (id) => (id === 17 ? undefined : { critic: null, audience: null }))

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).not.toHaveBeenCalled()
    expect(summary.notReady).toEqual([{ year: 2025, unchecked: 1 }])
  })

  it('rebuilds a year saved by an older ranking', async () => {
    stubDiscover({ 2025: range(1, 5) })
    const store = memoryStore(new Map([[2026, current()], [2025, { refreshAfter: null, version: REWIND_RANKING_VERSION - 1 }]]))

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(summary.saved).toEqual([2025])
  })

  it('keeps an out-of-date list when its replacement is not ready, so the year never goes back to locked', async () => {
    stubDiscover({ 2025: range(1, 5) })
    const store = memoryStore(
      new Map([[2026, current()], [2025, { refreshAfter: null, version: REWIND_RANKING_VERSION - 1 }]]),
      (id) => (id === 3 ? undefined : { critic: null, audience: null }),
    )

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    // Nothing is saved or cleared: the old row stays, and tomorrow tries again.
    expect(store.save).not.toHaveBeenCalled()
    expect(summary.notReady).toEqual([{ year: 2025, unchecked: 1 }])
  })

  it('does not replace a list we already have with an empty one', async () => {
    stubDiscover({})
    const store = memoryStore(new Map([[2026, current()], [2025, { refreshAfter: null, version: REWIND_RANKING_VERSION - 1 }]]))

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).not.toHaveBeenCalledWith(2025, expect.anything(), expect.anything(), expect.anything())
    expect(summary.notReady).toEqual([{ year: 2025, unchecked: 0 }])
  })

  it('gives the current year a refresh date a week out', async () => {
    stubDiscover({ 2026: range(1, 5) })
    const store = memoryStore(new Map([[2025, current()]]))

    await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).toHaveBeenCalledWith(2026, expect.any(Array), NOW, new Date('2026-12-01T09:17:00Z'))
  })

  it('saves a year with no rankable films as empty, so it stops taking a slot', async () => {
    stubDiscover({})
    const store = memoryStore(new Map([[2026, current()]]))

    await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).toHaveBeenCalledWith(2025, [], NOW, null)
  })

  it('stops starting years after the deadline', async () => {
    stubDiscover({ 2026: [1] })
    const store = memoryStore()

    await refreshRewind('tmdb', store, { cursor: null, now: NOW, deadline: Date.now() - 1 })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('handleRewind', () => {
  const films = range(1, 3).map((id) => film(id, 8, 900))
  const reader = {
    years: vi.fn(async () => [{ year: 2025, ids: [1, 2, 3], formerIds: [9] }]),
    year: vi.fn(async (y: number) => (y === 2025 ? { films, formerIds: [9] } : y === 1951 ? { films: [], formerIds: [] } : null)),
  }

  it('lists saved years and serves a saved year', async () => {
    expect(await handleRewind({}, 'tmdb', reader, NOW)).toMatchObject({ status: 200, body: { years: [{ year: 2025, ids: [1, 2, 3], formerIds: [9] }] } })
    expect(await handleRewind({ year: '2025' }, 'tmdb', reader, NOW)).toMatchObject({ status: 200, body: { year: 2025, films, formerIds: [9] } })
    // A saved year with nothing rankable is an empty list, not locked.
    expect(await handleRewind({ year: '1951' }, 'tmdb', reader, NOW)).toMatchObject({ status: 200, body: { films: [] } })
  })

  it('answers 404 locked for a year that is not ready, and 400 for nonsense', async () => {
    expect(await handleRewind({ year: '1987' }, 'tmdb', reader, NOW)).toEqual({ status: 404, body: { locked: true } })
    expect((await handleRewind({ year: '2099' }, 'tmdb', reader, NOW)).status).toBe(400)
    expect((await handleRewind({ year: 'abc' }, 'tmdb', reader, NOW)).status).toBe(400)
  })

  it('ranks live from TMDB when there are no saved lists (local dev)', async () => {
    stubDiscover({ 2026: range(1, 60) })
    const res = await handleRewind({ year: '2026' }, 'tmdb', undefined, NOW)
    expect((res.body as { films: unknown[] }).films).toHaveLength(REWIND_SIZE)
  })
})
