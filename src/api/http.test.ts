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
})

describe('tmdbGet', () => {
  it('calls the server proxy with the TMDB path, and never sends a key itself', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })

    const [url, init] = f.mock.calls[0]
    expect(url).toMatch(/^\/api\/tmdb\/search\/movie\?/)
    expect(url).toContain('query=dune')
    expect(url).not.toContain('api_key')
    expect(init.headers.Authorization).toBeUndefined()
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

  it('throws MissingKeyError when the server has no TMDB token', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'missing_key', which: 'TMDB' }, false, 503))

    await expect(tmdbGet('/search/movie', {})).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws HttpError on a non-ok response and does not cache it', async () => {
    const f = mockFetch({ status_message: 'nope' }, false, 401)
    vi.stubGlobal('fetch', f)

    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    await expect(tmdbGet('/search/movie', { query: 'x' })).rejects.toBeInstanceOf(HttpError)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('does not memoize requests that carry an AbortSignal', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)
    const controller = new AbortController()

    await tmdbGet('/search/movie', { query: 'dune' }, controller.signal)
    await tmdbGet('/search/movie', { query: 'dune' }, controller.signal)

    expect(f).toHaveBeenCalledTimes(2)
  })

  it('still memoizes identical requests without a signal', async () => {
    const f = mockFetch({ results: [] })
    vi.stubGlobal('fetch', f)

    await tmdbGet('/search/movie', { query: 'dune' })
    await tmdbGet('/search/movie', { query: 'dune' })

    expect(f).toHaveBeenCalledTimes(1)
  })

  it('an aborted signal-carrying request does not poison a later signal-free request for the same URL', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    const f = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ results: [1] }) })
    vi.stubGlobal('fetch', f)
    const controller = new AbortController()

    await expect(
      tmdbGet('/search/movie', { query: 'dune' }, controller.signal),
    ).rejects.toBe(abortError)

    await expect(tmdbGet('/search/movie', { query: 'dune' })).resolves.toEqual({ results: [1] })
    expect(f).toHaveBeenCalledTimes(2)
  })
})
