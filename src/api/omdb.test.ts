import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTomatometer, getRottenTomatoesScores } from './omdb'
import { getCachedScores, resetScoresForTests } from '../data/scores'
import { scoresFromOmdb, type OmdbResponse } from './omdbParse'

const omdbResponse = (title: string, year: string, rt?: string, imdbRating = '7.7') => ({
  Response: 'True', Title: title, Year: year,
  Ratings: rt ? [
    { Source: 'Internet Movie Database', Value: '7.7/10' },
    { Source: 'Rotten Tomatoes', Value: rt },
  ] : [{ Source: 'Internet Movie Database', Value: '7.7/10' }],
  imdbRating,
})

/**
 * What `/api/omdb` answers for a raw OMDb response: the server parses it with
 * the same `scoresFromOmdb`, using the `year` the client sent.
 */
function proxied(body: unknown, url: string) {
  const year = new URL(url, 'http://localhost').searchParams.get('year')
  return scoresFromOmdb(body as OmdbResponse, year ? Number(year) : null)
}

/**
 * Stubs `fetch` for the `/api/omdb` call (answering as the proxy would for
 * the given raw OMDb response) and returns a spy scoped to ONLY that call.
 * Writes through to the shared `/api/scores` cache (triggered by
 * `cacheScores`) are answered separately so they don't inflate the
 * lookup assertions below.
 */
function stub(body: unknown) {
  const f = vi.fn().mockImplementation(async (url: string) =>
    ({ ok: true, status: 200, json: async () => proxied(body, url) }))
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (typeof url === 'string' && url.startsWith('/api/scores')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }
    return f(url, init)
  })
  return f
}

beforeEach(() => {
  resetScoresForTests()
})

describe('getTomatometer', () => {
  it('parses a percentage into a number', async () => {
    stub(omdbResponse('Lost in Translation', '2003', '95%'))
    expect(await getTomatometer(153, 'Lost in Translation', 2003)).toBe(95)
  })

  it('asks the server proxy by title and TMDB year, never with a key', async () => {
    const f = stub(omdbResponse('Rushmore', '1999', '90%'))
    await getTomatometer(1585, 'Rushmore', 1998)

    const url = new URL(f.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/omdb')
    expect(url.searchParams.get('t')).toBe('Rushmore')
    expect(url.searchParams.get('year')).toBe('1998')
    expect(url.searchParams.has('apikey')).toBe(false)
  })

  it('accepts a result whose year is off by one', async () => {
    // Rushmore: TMDB says 1998, IMDb says 1999. Verified 2026-08-08.
    stub(omdbResponse('Rushmore', '1999', '90%'))
    expect(await getTomatometer(1585, 'Rushmore', 1998)).toBe(90)
  })

  it('rejects a result whose year is off by more than one', async () => {
    stub(omdbResponse('The Thing', '1982', '85%'))
    expect(await getTomatometer(999, 'The Thing', 2011)).toBeNull()
  })

  it('returns null when OMDb has no Rotten Tomatoes rating', async () => {
    stub(omdbResponse('Obscure Film', '1974'))
    expect(await getTomatometer(888, 'Obscure Film', 1974)).toBeNull()
  })

  it('returns null when the film is not found', async () => {
    stub({ Response: 'False', Error: 'Movie not found!' })
    expect(await getTomatometer(777, 'Nonexistent', 2020)).toBeNull()
  })

  it('accepts any year when TMDB has no year', async () => {
    stub(omdbResponse('Untitled', '1994', '70%'))
    expect(await getTomatometer(666, 'Untitled', null)).toBe(70)
  })

  it('caches by tmdb id and does not refetch', async () => {
    const f = stub(omdbResponse('Caddyshack', '1980', '73%'))

    await getTomatometer(11123, 'Caddyshack', 1980)
    await getTomatometer(11123, 'Caddyshack', 1980)

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('caches a null result so misses are not retried forever', async () => {
    const f = stub({ Response: 'False', Error: 'Movie not found!' })

    await getTomatometer(555, 'Ghost', 1990)
    await getTomatometer(555, 'Ghost', 1990)

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('returns null rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getTomatometer(444, 'Whatever', 2000)).toBeNull()
  })

  it('returns null without caching when OMDb rate-limits (401)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    vi.stubGlobal('fetch', f)

    expect(await getTomatometer(333, 'Rate Limited', 2000)).toBeNull()
    expect(await getTomatometer(333, 'Rate Limited', 2000)).toBeNull()

    expect(f).toHaveBeenCalledTimes(2)
  })

  it('returns null without caching when OMDb has an outage (500)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', f)

    expect(await getTomatometer(222, 'Outage', 2000)).toBeNull()

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('still caches a definitive "not found" response (regression)', async () => {
    const f = stub({ Response: 'False', Error: 'Movie not found!' })

    await getTomatometer(111, 'Definitely Not Found', 2000)
    await getTomatometer(111, 'Definitely Not Found', 2000)

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not lose results when many lookups run concurrently', async () => {
    // Regression for a real bug found in live browser testing: a filmography
    // screen fires ~40 getTomatometer calls via Promise.all. Each call reads
    // the cache at entry, so under the old code every write serialized that
    // same stale snapshot plus its own single addition, and the last writer
    // clobbered every other result — 36 fetched, only 1 persisted.
    const films = Array.from({ length: 10 }, (_, i) => ({
      id: 1000 + i,
      title: `Concurrent Film ${i}`,
      year: 2000 + i,
      score: 10 * (i + 1),
    }))

    const f = vi.fn().mockImplementation(async (url: string) => {
      const t = new URL(url, 'http://localhost').searchParams.get('t')!
      const film = films.find((film) => film.title === t)!
      const body = omdbResponse(film.title, String(film.year), `${film.score}%`)
      return { ok: true, status: 200, json: async () => proxied(body, url) }
    })
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('/api/scores')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
      }
      return f(url, init)
    })

    const results = await Promise.all(
      films.map((film) => getTomatometer(film.id, film.title, film.year)),
    )
    expect(results).toEqual(films.map((film) => film.score))

    for (const film of films) {
      expect(getCachedScores(film.id)?.critic).toBe(film.score)
    }

    // Regression guard: a second concurrent pass hits the cache, not the network.
    await Promise.all(films.map((film) => getTomatometer(film.id, film.title, film.year)))
    expect(f).toHaveBeenCalledTimes(films.length)
  })
})

describe('getRottenTomatoesScores audience score (IMDb rating)', () => {
  it('scales IMDb\'s 0-10 rating to a 0-100 percentage', async () => {
    stub(omdbResponse('Lost in Translation', '2003', '95%', '7.7'))
    const scores = await getRottenTomatoesScores(153, 'Lost in Translation', 2003)
    expect(scores.audience).toBe(77)
  })

  it('returns null when OMDb has no IMDb rating', async () => {
    stub(omdbResponse('Obscure Film', '1974', '85%', 'N/A'))
    const scores = await getRottenTomatoesScores(888, 'Obscure Film', 1974)
    expect(scores.audience).toBeNull()
  })

  it('records an explicit null for both halves when the film is not found', async () => {
    // Null, not undefined: "we asked, OMDb has nothing" has to be
    // distinguishable from "we never asked", or the cached answer reads as
    // incomplete on the next call and re-fetches forever.
    stub({ Response: 'False', Error: 'Movie not found!' })
    const scores = await getRottenTomatoesScores(777, 'Nonexistent', 2020)
    expect(scores).toEqual({ critic: null, audience: null })
  })

  it('does not re-fetch a film OMDb has already said it does not have', async () => {
    const f = stub({ Response: 'False', Error: 'Movie not found!' })
    await getRottenTomatoesScores(777, 'Nonexistent', 2020)
    await getRottenTomatoesScores(777, 'Nonexistent', 2020)
    expect(f).toHaveBeenCalledTimes(1)
  })
})

describe('legacy cache entries', () => {
  // data/scores.json predates the { critic, audience } shape: most of its
  // entries are still a bare tomatometer number, or a bare null meaning
  // "OMDb has no RT score for this film". Either way the audience half was
  // never looked up, so these entries are incomplete and must be re-fetched
  // once — widening them to `audience: null` would mark them complete and
  // leave the audience score permanently unfillable.
  it('re-fetches a legacy bare-number entry to fill in the missing audience half', async () => {
    resetScoresForTests({ '949': 87 } as never)
    const f = stub(omdbResponse('Heat', '1995', '84%', '8.3'))
    expect(await getRottenTomatoesScores(949, 'Heat', 1995)).toEqual({ critic: 84, audience: 83 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('re-fetches a legacy bare-null entry too', async () => {
    resetScoresForTests({ '247': null } as never)
    const f = stub(omdbResponse('The Crossing Guard', '1995', '43%', '6.4'))
    expect(await getRottenTomatoesScores(247, 'The Crossing Guard', 1995))
      .toEqual({ critic: 43, audience: 64 })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('re-fetches a legacy entry only once, then trusts the completed record', async () => {
    resetScoresForTests({ '949': 87 } as never)
    const f = stub(omdbResponse('Heat', '1995', '84%', '8.3'))
    await getRottenTomatoesScores(949, 'Heat', 1995)
    await getRottenTomatoesScores(949, 'Heat', 1995)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps the legacy critic score when the re-fetch fails', async () => {
    // The whole point of re-fetching is to gain the audience half. Losing the
    // critic score we already had to a transient network failure would make
    // the fix a net regression.
    resetScoresForTests({ '949': 87 } as never)
    vi.stubGlobal('fetch', (url: string) => {
      if (typeof url === 'string' && url.startsWith('/api/scores')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
      }
      return Promise.reject(new Error('network down'))
    })
    expect(await getRottenTomatoesScores(949, 'Heat', 1995)).toEqual({ critic: 87 })
  })

  it('still reads a legacy bare-number entry as the critic score via getTomatometer', async () => {
    resetScoresForTests({ '949': 87 } as never)
    stub(omdbResponse('Heat', '1995', '84%', '8.3'))
    expect(await getTomatometer(949, 'Heat', 1995)).toBe(84)
  })

  it('treats a legacy bare-null entry as "no score" rather than throwing', async () => {
    resetScoresForTests({ '247': null } as never)
    stub({ Response: 'False', Error: 'Movie not found!' })
    await expect(getTomatometer(247, 'The Crossing Guard', 1995)).resolves.toBeNull()
  })
})
