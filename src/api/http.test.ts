import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmdbGet, clearHttpCache, MissingKeyError, HttpError } from './http'

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status,
    json: async () => body,
  })
}

beforeEach(() => {
  clearHttpCache()
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
})

describe('tmdbGet', () => {
  it('sends the v4 bearer token, not an api_key param', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })

    const [url, init] = f.mock.calls[0]
    expect(url).toContain('https://api.themoviedb.org/3/search/movie')
    expect(url).toContain('query=dune')
    expect(url).not.toContain('api_key')
    expect(init.headers.Authorization).toBe('Bearer test-token')
  })

  it('memoizes identical requests', async () => {
    const f = mockFetch({ results: [1] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })
    await tmdbGet('/search/movie', { query: 'dune' })

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not memoize different params', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })
    await tmdbGet('/search/movie', { query: 'jaws' })

    expect(f).toHaveBeenCalledTimes(2)
  })

  it('throws MissingKeyError when the token is absent', async () => {
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    vi.stubGlobal('fetch', mockFetch({}))

    await expect(tmdbGet('/search/movie', {})).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws HttpError on a non-ok response and does not cache it', async () => {
    const f = mockFetch({ status_message: 'nope' }, false, 401)
    vi.stubGlobal('fetch', f)

    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    expect(f).toHaveBeenCalledTimes(2)
  })
})
