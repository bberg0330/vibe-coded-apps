import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleRewind, refreshRewind, yearsToCheck, REWIND_SIZE, YEARS_PER_RUN, type RewindFilm, type RewindStore } from './rewind'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const NOW = new Date('2026-11-24T09:17:00Z')

/** Discover by year: `films[year]` is the year's rankable TMDB ids, best first, served 20 a page. */
let fetchMock: ReturnType<typeof vi.fn>
function stubDiscover(films: Record<number, number[]>) {
  fetchMock = vi.fn(async (url: string) => {
    const q = new URL(url).searchParams
    const list = films[Number(q.get('primary_release_year'))] ?? []
    const page = Number(q.get('page'))
    return ok({
      page, total_pages: Math.max(Math.ceil(list.length / 20), 1),
      results: list.slice((page - 1) * 20, page * 20).map((id) => ({
        id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, release_date: '2019-05-01',
        vote_average: 8, vote_count: 900, popularity: 50,
      })),
    })
  })
  vi.stubGlobal('fetch', fetchMock)
}
const years = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)).searchParams)

function memoryStore(saved: Map<number, Date | null> = new Map(), checked: (id: number) => boolean = () => true) {
  return {
    saved: vi.fn(async () => saved),
    save: vi.fn(async (_year: number, _films: RewindFilm[], _at: Date, _refresh: Date | null) => undefined),
    checked: vi.fn(async (ids: number[]) => new Set(ids.filter(checked))),
  } satisfies RewindStore
}
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i)

beforeEach(() => vi.unstubAllGlobals())

describe('yearsToCheck', () => {
  it('starts with the current year, then past years the backfill has passed, newest first', () => {
    expect(yearsToCheck(new Map(), { year: 2022, page: 3 }, NOW)).toEqual([2026, 2025, 2024, 2023])
  })

  it('skips saved years, and the current year until its refresh date', () => {
    const saved = new Map([[2026, new Date('2026-11-30')], [2025, null]])
    expect(yearsToCheck(saved, { year: 2022, page: 1 }, NOW)).toEqual([2024, 2023])
    saved.set(2026, new Date('2026-11-20'))
    expect(yearsToCheck(saved, { year: 2022, page: 1 }, NOW)).toEqual([2026, 2024, 2023])
  })

  it(`checks at most ${YEARS_PER_RUN} past years a night, and every year once the backfill is done`, () => {
    expect(yearsToCheck(new Map(), null, NOW)).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
  })
})

describe('refreshRewind', () => {
  it('saves the top 50 by rating once every rankable film in the year has been checked', async () => {
    stubDiscover({ 2025: range(1, 70) })
    const store = memoryStore(new Map([[2026, null]]))

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    const q = years()[0]
    expect(q.get('sort_by')).toBe('vote_average.desc')
    expect(q.get('vote_count.gte')).toBe('300')
    expect(years().map((p) => p.get('page'))).toEqual(['1', '2', '3', '4'])
    expect(store.checked).toHaveBeenCalledWith(range(1, 70))
    const [year, films, , refreshAfter] = store.save.mock.calls[0]
    expect(year).toBe(2025)
    expect(films).toHaveLength(REWIND_SIZE)
    expect(films[0]).toEqual({ tmdbId: 1, title: 'Film 1', posterPath: '/p1.jpg', releaseDate: '2019-05-01', voteAverage: 8, voteCount: 900, popularity: 50 })
    expect(refreshAfter).toBeNull()
    expect(summary).toEqual({ saved: [2025], notReady: [] })
  })

  it('leaves a year for tomorrow while any of its rankable films is still unrated', async () => {
    stubDiscover({ 2025: range(1, 30) })
    const store = memoryStore(new Map([[2026, null]]), (id) => id !== 17)

    const summary = await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).not.toHaveBeenCalled()
    expect(summary.notReady).toEqual([{ year: 2025, unchecked: 1 }])
  })

  it('gives the current year a refresh date a week out', async () => {
    stubDiscover({ 2026: range(1, 5) })
    const store = memoryStore(new Map([[2025, null]]))

    await refreshRewind('tmdb', store, { cursor: { year: 2024, page: 1 }, now: NOW })

    expect(store.save).toHaveBeenCalledWith(2026, expect.any(Array), NOW, new Date('2026-12-01T09:17:00Z'))
  })

  it('saves a year with no rankable films as empty, so it stops taking a slot', async () => {
    stubDiscover({})
    const store = memoryStore(new Map([[2026, null]]))

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
  const films = range(1, 3).map((id) => ({ tmdbId: id, title: `Film ${id}`, posterPath: null, releaseDate: null, voteAverage: 8, voteCount: 900, popularity: 1 }))
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
