import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveScores, syncRatings, type ScoreCache } from './ratings'
import { dueFilter } from './scoreCache'
import { omdbFailure } from '../../src/api/omdbParse'

const KEYS = { tmdbToken: 'tmdb-secret', omdbKey: 'omdb-secret' }
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const hit = (rt: string, imdb = '7.7', year = '2000') =>
  ({ Response: 'True', Year: year, imdbRating: imdb, Ratings: [{ Source: 'Rotten Tomatoes', Value: rt }] })

function memoryCache(seed: Record<number, { critic: number | null; audience: number | null }> = {}) {
  const cache = {
    get: vi.fn(async (ids: number[]) => new Map(ids.filter((id) => seed[id]).map((id) => [id, seed[id]]))),
    put: vi.fn(async () => undefined),
    markPending: vi.fn(async () => undefined),
    due: vi.fn(async () => [] as { tmdbId: number }[]),
  }
  return cache satisfies ScoreCache
}

/** TMDB details give every film `tt<id>`; OMDb answers by IMDb id via `omdb`. */
let fetchMock: ReturnType<typeof vi.fn>
function stub(omdb: (params: URLSearchParams) => unknown, tmdb: (id: string) => unknown = (id) => ({ imdb_id: `tt${id}`, release_date: '2000-01-01' })) {
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes('omdbapi.com')) return ok(omdb(new URL(url).searchParams))
    const id = url.match(/\/movie\/(\d+)/)?.[1]
    if (id) return ok(tmdb(id))
    throw new Error(`unexpected ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}
const omdbCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('omdbapi.com'))

beforeEach(() => vi.unstubAllGlobals())

describe('omdbFailure', () => {
  it.each([
    ['Movie not found!', 'not_found'],
    ['Incorrect IMDb ID.', 'not_found'],
    ['Request limit reached!', 'quota'],
    ['Invalid API key!', 'quota'],
    ['No API key provided.', 'quota'],
    ['Something went wrong.', 'transient'],
  ])('classifies "%s" as %s', (Error, kind) => {
    expect(omdbFailure({ Response: 'False', Error })).toBe(kind)
  })

  it('is null for a real answer', () => expect(omdbFailure({ Response: 'True' })).toBeNull())
})

describe('resolveScores', () => {
  it('looks films up by IMDb id and stores the answer with its id and year', async () => {
    stub(() => hit('90%', '7.7', '1999'))
    const cache = memoryCache()

    const r = await resolveScores([{ tmdbId: 1585 }], KEYS, cache)

    expect(r.scores.get(1585)).toEqual({ critic: 90, audience: 77 })
    expect(omdbCalls()[0][0]).toContain('i=tt1585')
    expect(cache.put).toHaveBeenCalledWith(new Map([[1585, { critic: 90, audience: 77, imdbId: 'tt1585', year: 2000 }]]))
  })

  it('does not ask OMDb for films already in the cache', async () => {
    stub(() => hit('80%'))
    const cache = memoryCache({ 1: { critic: 50, audience: 60 } })

    const r = await resolveScores([{ tmdbId: 1 }, { tmdbId: 2 }], KEYS, cache)

    expect(r.scores.get(1)).toEqual({ critic: 50, audience: 60 })
    expect(omdbCalls()).toHaveLength(1)
  })

  it('stores a definitive "not found" as no rating', async () => {
    stub(() => ({ Response: 'False', Error: 'Incorrect IMDb ID.' }))
    const cache = memoryCache()

    const r = await resolveScores([{ tmdbId: 7 }], KEYS, cache)

    expect(r.scores.get(7)).toEqual({ critic: null, audience: null })
    expect(r.pending).toEqual([])
  })

  it('stops at "Request limit reached!", stores nothing as unrated, and queues the rest', async () => {
    // Regression: OMDb answers HTTP 200 when the quota is spent, and this used
    // to be cached as "no rating" for every film looked up after it.
    stub(() => ({ Response: 'False', Error: 'Request limit reached!' }))
    const cache = memoryCache()
    const films = Array.from({ length: 10 }, (_, i) => ({ tmdbId: i + 1 }))

    const r = await resolveScores(films, KEYS, cache, { concurrency: 1 })

    expect(r.quotaHit).toBe(true)
    expect(r.scores.size).toBe(0)
    expect(r.pending.sort((a, b) => a - b)).toEqual(films.map((f) => f.tmdbId))
    expect(omdbCalls()).toHaveLength(1)
    expect(cache.put).not.toHaveBeenCalled()
    expect(cache.markPending).toHaveBeenCalledTimes(1)
  })

  it('treats an OMDb 401 as quota too', async () => {
    fetchMock = vi.fn(async (url: string) =>
      url.includes('omdbapi.com') ? { ok: false, status: 401, json: async () => ({}) } : ok({ imdb_id: 'tt1' }))
    vi.stubGlobal('fetch', fetchMock)

    const r = await resolveScores([{ tmdbId: 1 }], KEYS)

    expect(r).toMatchObject({ quotaHit: true, pending: [1] })
  })

  it('leaves transient failures unanswered without stopping the batch', async () => {
    stub((p) => p.get('i') === 'tt1' ? { Response: 'False', Error: 'Something went wrong.' } : hit('70%'))
    const cache = memoryCache()

    const r = await resolveScores([{ tmdbId: 1 }, { tmdbId: 2 }], KEYS, cache)

    expect(r.pending).toEqual([1])
    expect(r.scores.get(2)).toEqual({ critic: 70, audience: 77 })
    expect(r.quotaHit).toBe(false)
  })

  describe('title fallback (TMDB has no IMDb id)', () => {
    const noImdb = () => ({ imdb_id: null })

    it('looks up by title and accepts a one-year drift', async () => {
      // Rushmore: TMDB says 1998, IMDb says 1999.
      stub(() => hit('90%', '7.7', '1999'), noImdb)
      const r = await resolveScores([{ tmdbId: 1585, title: 'Rushmore', year: 1998 }], KEYS)
      expect(omdbCalls()[0][0]).toContain('t=Rushmore')
      expect(r.scores.get(1585)?.critic).toBe(90)
    })

    it('rejects a title match more than a year off', async () => {
      stub(() => hit('85%', '8.2', '1982'), noImdb)
      const r = await resolveScores([{ tmdbId: 999, title: 'The Thing', year: 2011 }], KEYS)
      expect(r.scores.get(999)).toEqual({ critic: null, audience: null })
    })

    it('still works when TMDB is unreachable', async () => {
      fetchMock = vi.fn(async (url: string) =>
        url.includes('omdbapi.com') ? ok(hit('73%', '7.2', '1980')) : { ok: false, status: 500, json: async () => ({}) })
      vi.stubGlobal('fetch', fetchMock)
      const r = await resolveScores([{ tmdbId: 11123, title: 'Caddyshack', year: 1980 }], KEYS)
      expect(r.scores.get(11123)).toEqual({ critic: 73, audience: 72 })
    })
  })

  it('stops starting lookups after the deadline', async () => {
    stub(() => hit('80%'))
    const r = await resolveScores([{ tmdbId: 1 }, { tmdbId: 2 }], KEYS, undefined, { deadline: Date.now() - 1 })
    expect(r.pending).toEqual([1, 2])
    expect(omdbCalls()).toHaveLength(0)
  })
})

describe('syncRatings', () => {
  it('re-checks due films without the cache read, within the budget', async () => {
    stub(() => hit('88%'))
    const cache = memoryCache({ 5: { critic: null, audience: null } })
    cache.due.mockResolvedValue([{ tmdbId: 5 }, { tmdbId: 6 }])

    const summary = await syncRatings(KEYS, cache, { budget: 2 })

    expect(cache.due).toHaveBeenCalledWith(2, expect.any(Date))
    expect(cache.get).not.toHaveBeenCalled()
    expect(summary).toEqual({ checked: 2, rated: 2, pending: 0, quotaHit: false })
  })
})

describe('dueFilter', () => {
  it('selects pending rows, stale empty answers and stale recent films', () => {
    const f = dueFilter(new Date('2026-11-23T00:00:00Z'))
    expect(f).toContain('fetched_at.is.null')
    expect(f).toContain('and(critic.is.null,audience.is.null,fetched_at.lt.2026-10-24T00:00:00.000Z)')
    expect(f).toContain('and(year.gte.2025,fetched_at.lt.2026-11-16T00:00:00.000Z)')
  })
})
