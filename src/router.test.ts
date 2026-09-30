import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  slugify, hashFor, parseHash, castRouteKey, filmographyRouteKey,
  SEARCH_ROUTE_KEY, HISTORY_ROUTE_KEY, rehydrate, RehydrationError,
} from './router'
import { clearHttpCache } from './api/http'
import type { Movie, Person } from './types'

const movie: Movie = {
  tmdbId: 153, title: 'Lost in Translation', year: 2003, posterPath: null,
  popularity: 20, tomatometer: 95, popcornmeter: null, availability: { streaming: [], rent: [] },
  overview: null,
}
const actor: Person = { tmdbId: 1532, name: 'Bill Murray', profilePath: null }

describe('slugify', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugify('Lost in Translation')).toBe('lost-in-translation')
  })

  it('strips punctuation rather than encoding it', () => {
    expect(slugify("Ocean's Eleven")).toBe('oceans-eleven')
  })

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Mission: Impossible!! ')).toBe('mission-impossible')
  })

  it('handles an all-punctuation or empty name without throwing', () => {
    expect(slugify('')).toBe('')
    expect(slugify('...')).toBe('')
  })
})

describe('hashFor', () => {
  it('maps the search screen to the root', () => {
    expect(hashFor({ kind: 'search' })).toBe('#/')
  })

  it('maps the history screen to #/history', () => {
    expect(hashFor({ kind: 'history' })).toBe('#/history')
  })

  it('builds a slug-plus-id path for a cast screen', () => {
    expect(hashFor({ kind: 'cast', movie })).toBe('#/movie/lost-in-translation-153')
  })

  it('nests the actor under the movie for a filmography screen', () => {
    expect(hashFor({ kind: 'filmography', actor, fromMovie: movie }))
      .toBe('#/movie/lost-in-translation-153/actor/bill-murray-1532')
  })

  it('still builds a valid path when the title slugifies to empty', () => {
    const blank: Movie = { ...movie, title: '...' }
    expect(hashFor({ kind: 'cast', movie: blank })).toBe('#/movie/-153')
  })
})

describe('route keys', () => {
  it('are stable regardless of title, since only the id should matter for storage', () => {
    expect(castRouteKey(153)).toBe(castRouteKey(153))
    expect(filmographyRouteKey(153, 1532)).toBe(filmographyRouteKey(153, 1532))
  })

  it('differ for different ids', () => {
    expect(castRouteKey(153)).not.toBe(castRouteKey(999))
  })

  it('are constants for search and history', () => {
    expect(SEARCH_ROUTE_KEY).toBe('search')
    expect(HISTORY_ROUTE_KEY).toBe('history')
  })
})

describe('parseHash', () => {
  it('parses the bare root and an empty string as search', () => {
    expect(parseHash('#/')).toEqual({ kind: 'search' })
    expect(parseHash('')).toEqual({ kind: 'search' })
    expect(parseHash('#')).toEqual({ kind: 'search' })
  })

  it('parses #/history', () => {
    expect(parseHash('#/history')).toEqual({ kind: 'history' })
  })

  it('parses a cast route, trusting only the trailing id', () => {
    expect(parseHash('#/movie/lost-in-translation-153')).toEqual({ kind: 'cast', movieId: 153 })
  })

  it('parses a cast route even with a completely wrong slug', () => {
    expect(parseHash('#/movie/anything-at-all-153')).toEqual({ kind: 'cast', movieId: 153 })
  })

  it('parses a filmography route', () => {
    expect(parseHash('#/movie/lost-in-translation-153/actor/bill-murray-1532'))
      .toEqual({ kind: 'filmography', movieId: 153, actorId: 1532 })
  })

  it('returns null for a movie segment with no numeric id', () => {
    expect(parseHash('#/movie/lost-in-translation')).toBeNull()
  })

  it('returns null for an actor segment with no numeric id', () => {
    expect(parseHash('#/movie/lost-in-translation-153/actor/bill-murray')).toBeNull()
  })

  it('returns null for a route it does not recognize', () => {
    expect(parseHash('#/something/else')).toBeNull()
    expect(parseHash('#/movie')).toBeNull()
  })
})

beforeEach(() => {
  clearHttpCache()
})

function stubTmdb(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }))
}

describe('rehydrate', () => {
  it('rehydrates search to a single-entry stack', async () => {
    const stack = await rehydrate({ kind: 'search' })
    expect(stack).toEqual([{ kind: 'search' }])
  })

  it('rehydrates history behind a search entry', async () => {
    const stack = await rehydrate({ kind: 'history' })
    expect(stack).toEqual([{ kind: 'search' }, { kind: 'history' }])
  })

  it('rehydrates a cast route by fetching the movie', async () => {
    stubTmdb({
      id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
      poster_path: null, popularity: 20,
    })

    const stack = await rehydrate({ kind: 'cast', movieId: 153 })

    expect(stack).toHaveLength(2)
    expect(stack[0]).toEqual({ kind: 'search' })
    expect(stack[1]).toMatchObject({ kind: 'cast', movie: { tmdbId: 153, title: 'Lost in Translation' } })
  })

  it('rehydrates a filmography route by fetching both the movie and the person', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/movie/')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
            poster_path: null, popularity: 20,
          }),
        }
      }
      return {
        ok: true, status: 200,
        json: async () => ({ id: 1532, name: 'Bill Murray', profile_path: null }),
      }
    })
    vi.stubGlobal('fetch', f)

    const stack = await rehydrate({ kind: 'filmography', movieId: 153, actorId: 1532 })

    expect(stack).toHaveLength(3)
    expect(stack[1]).toMatchObject({ kind: 'cast', movie: { tmdbId: 153 } })
    expect(stack[2]).toMatchObject({
      kind: 'filmography',
      actor: { tmdbId: 1532, name: 'Bill Murray' },
      fromMovie: { tmdbId: 153 },
    })
  })

  it('throws RehydrationError when the movie fetch fails, without a generic error leaking through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(rehydrate({ kind: 'cast', movieId: 153 })).rejects.toBeInstanceOf(RehydrationError)
  })

  it('throws RehydrationError when only the person fetch fails', async () => {
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/movie/')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            id: 153, title: 'Lost in Translation', release_date: '2003-09-12',
            poster_path: null, popularity: 20,
          }),
        }
      }
      throw new Error('person not found')
    })
    vi.stubGlobal('fetch', f)

    await expect(rehydrate({ kind: 'filmography', movieId: 153, actorId: 1532 }))
      .rejects.toBeInstanceOf(RehydrationError)
  })
})
