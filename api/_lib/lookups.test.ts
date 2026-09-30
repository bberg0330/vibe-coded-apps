import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleTmdb, handleOmdb, handleRecommendations, isAllowedTmdbPath,
  SHARED_CACHE, SHARED_LIST_SIZE, type ScoreCache,
} from './lookups'

const KEYS = { tmdbToken: 'tmdb-secret', omdbKey: 'omdb-secret' }

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('isAllowedTmdbPath', () => {
  it.each([
    '/search/movie', '/discover/movie', '/movie/1585', '/movie/1585/credits',
    '/movie/1585/watch/providers', '/person/1532', '/person/1532/movie_credits',
  ])('allows %s', (path) => expect(isAllowedTmdbPath(path)).toBe(true))

  it.each([
    '/account', '/movie/1585/reviews', '/movie/abc', '/person/1/../../account', '//evil.example/x', '',
  ])('refuses %s', (path) => expect(isAllowedTmdbPath(path)).toBe(false))
})

describe('handleTmdb', () => {
  it('forwards an allowed path with the server token and a shared cache header', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }))

    const result = await handleTmdb('/search/movie', { query: 'dune' }, KEYS)

    expect(result).toEqual({ status: 200, body: { results: [] }, cacheControl: SHARED_CACHE })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/^https:\/\/api\.themoviedb\.org\/3\/search\/movie\?/)
    expect(url).toContain('query=dune')
    expect(init.headers.Authorization).toBe('Bearer tmdb-secret')
  })

  it('refuses paths the app does not use, without calling TMDB', async () => {
    const result = await handleTmdb('/account', {}, KEYS)

    expect(result.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 503 missing_key when the token is unset', async () => {
    const result = await handleTmdb('/search/movie', {}, {})

    expect(result).toEqual({ status: 503, body: { error: 'missing_key', which: 'TMDB' } })
  })

  it('passes TMDB errors through without a cache header', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })

    const result = await handleTmdb('/movie/1', {}, KEYS)

    expect(result.status).toBe(404)
    expect(result.cacheControl).toBeUndefined()
  })
})

describe('handleOmdb', () => {
  it('looks up by title with the server key and returns parsed scores', async () => {
    fetchMock.mockResolvedValue(ok({
      Response: 'True', Year: '1999', imdbRating: '7.7',
      Ratings: [{ Source: 'Rotten Tomatoes', Value: '90%' }],
    }))

    const result = await handleOmdb({ t: 'Rushmore', year: '1998' }, KEYS)

    expect(result).toEqual({ status: 200, body: { critic: 90, audience: 77 }, cacheControl: SHARED_CACHE })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('apikey')).toBe('omdb-secret')
    expect(url.searchParams.get('t')).toBe('Rushmore')
    expect(url.searchParams.has('y')).toBe(false)
  })

  it('needs a title, and a key', async () => {
    expect((await handleOmdb({}, KEYS)).status).toBe(400)
    expect(await handleOmdb({ t: 'Heat' }, {})).toEqual({ status: 503, body: { error: 'missing_key', which: 'OMDb' } })
  })
})

describe('handleRecommendations', () => {
  const film = (id: number, popularity = 10) => ({
    id, title: `Film ${id}`, release_date: '2000-01-01', poster_path: null, popularity,
  })

  /** TMDB: source 100 has one actor (1) whose filmography is `films`; OMDb: 80/80 for everything. */
  function stubUpstream(films: ReturnType<typeof film>[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('omdbapi.com')) {
        return ok({ Response: 'True', Year: '2000', imdbRating: '8.0', Ratings: [{ Source: 'Rotten Tomatoes', Value: '80%' }] })
      }
      if (url.includes('/movie/100/credits')) return ok({ cast: [{ id: 1, name: 'Bill Murray', character: '', profile_path: null, order: 0 }] })
      if (url.includes('/person/1/movie_credits')) return ok({ cast: films })
      throw new Error(`unexpected ${url}`)
    })
  }

  it('returns the shared, floor-passing list for the source film, cached at the CDN', async () => {
    stubUpstream([film(100), film(200, 50), film(201, 10)])

    const result = await handleRecommendations({ source: '100' }, KEYS)

    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe(SHARED_CACHE)
    const { items } = result.body as { items: { tmdbId: number; tomatometer: number; viaActors: unknown[] }[] }
    expect(items.map((m) => m.tmdbId)).toEqual([200, 201])
    expect(items[0]).toMatchObject({ tomatometer: 80, popcornmeter: 80 })
  })

  it(`returns up to ${SHARED_LIST_SIZE} films so household exclusions still leave a full row`, async () => {
    stubUpstream(Array.from({ length: 40 }, (_, i) => film(300 + i, 100 - i)))

    const { items } = (await handleRecommendations({ source: '100' }, KEYS)).body as { items: unknown[] }

    expect(items).toHaveLength(SHARED_LIST_SIZE)
  })

  it('uses the score cache first and stores only fresh lookups', async () => {
    stubUpstream([film(200), film(201)])
    const cache: ScoreCache = {
      get: vi.fn().mockResolvedValue(new Map([[200, { critic: 95, audience: 90 }]])),
      put: vi.fn().mockResolvedValue(undefined),
    }

    const { items } = (await handleRecommendations({ source: '100' }, KEYS, cache)).body as {
      items: { tmdbId: number; tomatometer: number }[]
    }

    expect(items.find((m) => m.tmdbId === 200)?.tomatometer).toBe(95)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('omdbapi.com'))).toHaveLength(1)
    expect(cache.put).toHaveBeenCalledWith(new Map([[201, { critic: 80, audience: 80 }]]))
  })

  it('still answers when the score cache is down', async () => {
    stubUpstream([film(200)])
    const cache: ScoreCache = {
      get: vi.fn().mockRejectedValue(new Error('db down')),
      put: vi.fn().mockRejectedValue(new Error('db down')),
    }

    const result = await handleRecommendations({ source: '100' }, KEYS, cache)

    expect(result.status).toBe(200)
  })

  it('rejects a bad source id and a missing token', async () => {
    expect((await handleRecommendations({ source: 'abc' }, KEYS)).status).toBe(400)
    expect((await handleRecommendations({ source: '100' }, {})).status).toBe(503)
  })

  it('does not cache a TMDB failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const result = await handleRecommendations({ source: '100' }, KEYS)

    expect(result.status).toBe(500)
    expect(result.cacheControl).toBeUndefined()
  })
})
