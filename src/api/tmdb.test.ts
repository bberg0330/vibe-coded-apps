import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchMovies, getMovieCredits, posterUrl, getMovieDetails, getPerson, getActorFilmography,
} from './tmdb'
import { clearHttpCache } from './http'

const SEARCH_FIXTURE = {
  results: [
    {
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    },
    {
      id: 9425, title: 'Untitled', release_date: '',
      poster_path: null, popularity: 2.1,
    },
  ],
}

const CREDITS_FIXTURE = {
  cast: [
    { id: 1532, name: 'Bill Murray', character: 'Herman Blume', profile_path: '/bm.jpg', order: 1 },
    { id: 5563, name: 'Jason Schwartzman', character: 'Max Fischer', profile_path: null, order: 0 },
  ],
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

function stub(body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}

describe('searchMovies', () => {
  it('maps TMDB results into Movie objects', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')

    expect(movies[0]).toMatchObject({
      tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/abc.jpg',
    })
  })

  it('represents a missing release date as a null year, not NaN', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')
    expect(movies[1].year).toBeNull()
  })

  it('starts films with no score and no known availability', async () => {
    stub(SEARCH_FIXTURE)
    const movies = await searchMovies('rushmore')
    expect(movies[0].tomatometer).toBeNull()
    expect(movies[0].availability).toEqual({ streaming: [], rent: [] })
  })

  it('returns an empty array for a blank query without calling the network', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await searchMovies('   ')).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})

describe('getMovieCredits', () => {
  it('sorts cast by billing order', async () => {
    stub(CREDITS_FIXTURE)
    const cast = await getMovieCredits(1585)
    expect(cast.map((c) => c.name)).toEqual(['Jason Schwartzman', 'Bill Murray'])
  })

  it('maps character and profile path', async () => {
    stub(CREDITS_FIXTURE)
    const cast = await getMovieCredits(1585)
    expect(cast[1]).toMatchObject({
      tmdbId: 1532, character: 'Herman Blume', profilePath: '/bm.jpg',
    })
  })
})

describe('getActorFilmography', () => {
  const CREDITS = {
    cast: [
      { id: 1585, title: 'Rushmore', release_date: '1998-10-09', poster_path: '/abc.jpg', popularity: 18.4 },
      { id: 9425, title: 'Untitled', release_date: '', poster_path: null, popularity: 2.1 },
    ],
  }

  it('maps the cast array through toMovie, same shape as search results', async () => {
    stub(CREDITS)
    const movies = await getActorFilmography(1532)
    expect(movies).toEqual([
      expect.objectContaining({ tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/abc.jpg', popularity: 18.4 }),
      expect.objectContaining({ tmdbId: 9425, title: 'Untitled', year: null, posterPath: null, popularity: 2.1 }),
    ])
  })

  it('requests the person movie_credits endpoint', async () => {
    const f = stub(CREDITS)
    await getActorFilmography(1532)
    expect((f.mock.calls[0][0] as string)).toContain('/person/1532/movie_credits')
  })
})

describe('posterUrl', () => {
  it('builds a full image url', () => {
    expect(posterUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg')
  })

  it('returns null when there is no poster', () => {
    expect(posterUrl(null)).toBeNull()
  })
})

describe('getMovieDetails', () => {
  it('maps a single TMDB movie response into a Movie', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    })
    const movie = await getMovieDetails(1585)
    expect(movie).toMatchObject({
      tmdbId: 1585, title: 'Rushmore', year: 1998, posterPath: '/abc.jpg',
    })
  })

  it('trims the overview', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4, overview: '  A precocious teenager.  ',
    })
    expect((await getMovieDetails(1585)).overview).toBe('A precocious teenager.')
  })

  it('falls back to null when TMDB has no overview', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4, overview: '',
    })
    expect((await getMovieDetails(1585)).overview).toBeNull()
  })

  it('starts with no score and no known availability, same as search results', async () => {
    stub({
      id: 1585, title: 'Rushmore', release_date: '1998-10-09',
      poster_path: '/abc.jpg', popularity: 18.4,
    })
    const movie = await getMovieDetails(1585)
    expect(movie.tomatometer).toBeNull()
    expect(movie.availability).toEqual({ streaming: [], rent: [] })
  })
})

describe('getPerson', () => {
  it('maps a TMDB person response into a Person', async () => {
    stub({ id: 1532, name: 'Bill Murray', profile_path: '/bm.jpg' })
    const person = await getPerson(1532)
    expect(person).toEqual({ tmdbId: 1532, name: 'Bill Murray', profilePath: '/bm.jpg' })
  })

  it('handles a missing profile photo', async () => {
    stub({ id: 1532, name: 'Bill Murray', profile_path: null })
    const person = await getPerson(1532)
    expect(person.profilePath).toBeNull()
  })
})
