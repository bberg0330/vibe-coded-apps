import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActorMovies } from './tmdb'
import { clearHttpCache } from './http'

const film = (id: number, title: string, pop = 10) => ({
  id, title, release_date: '2001-01-01', poster_path: null, popularity: pop,
})

/** Routes each mocked request by the provider id in its query string. */
function stubByProvider(byProvider: Record<string, unknown[]>) {
  const f = vi.fn().mockImplementation((url: string) => {
    const providers = new URL(url, 'http://localhost').searchParams.get('with_watch_providers') ?? ''
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ results: byProvider[providers] ?? [] }),
    })
  })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  clearHttpCache()
})

describe('getActorMovies', () => {
  it('tags each film with the service whose call returned it', async () => {
    stubByProvider({
      '8': [film(1, 'On Netflix')],
      '1899': [film(2, 'On Max')],
    })

    const { streaming } = await getActorMovies(1532, ['netflix', 'hbomax'])
    const byTitle = Object.fromEntries(streaming.map((m) => [m.title, m.availability.streaming]))

    expect(byTitle['On Netflix']).toEqual(['netflix'])
    expect(byTitle['On Max']).toEqual(['hbomax'])
  })

  it('merges a film on two services into one entry with both badges', async () => {
    stubByProvider({
      '8': [film(1, 'Everywhere')],
      '1899': [film(1, 'Everywhere')],
    })

    const { streaming } = await getActorMovies(1532, ['netflix', 'hbomax'])

    expect(streaming).toHaveLength(1)
    expect(streaming[0].availability.streaming.sort()).toEqual(['hbomax', 'netflix'])
  })

  it('sends both Peacock tiers in a single call', async () => {
    const f = stubByProvider({ '386|387': [film(1, 'Peacock Film')] })

    const { streaming } = await getActorMovies(1532, ['peacock'])

    expect(streaming[0].availability.streaming).toEqual(['peacock'])
    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('386%7C387'))).toBe(true)
  })

  it('issues one request per enabled service plus two rent requests', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix', 'hbomax', 'disney'])
    expect(f).toHaveBeenCalledTimes(5)
  })

  it('queries only enabled services', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])

    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('with_watch_providers=8'))).toBe(true)
    expect(urls.some((u) => u.includes('with_watch_providers=1899'))).toBe(false)
  })

  it('separates rent results from streaming results', async () => {
    stubByProvider({
      '8': [film(1, 'Streamer')],
      '2': [film(9, 'Rental')],
    })

    const { streaming, rent } = await getActorMovies(1532, ['netflix'])

    expect(streaming.map((m) => m.title)).toEqual(['Streamer'])
    expect(rent.map((m) => m.title)).toEqual(['Rental'])
    expect(rent[0].availability.rent).toEqual(['appletv_store'])
  })

  it('excludes a film from rent when it already streams', async () => {
    stubByProvider({
      '8': [film(1, 'Both')],
      '2': [film(1, 'Both')],
    })

    const { streaming, rent } = await getActorMovies(1532, ['netflix'])

    expect(streaming).toHaveLength(1)
    expect(rent).toHaveLength(0)
  })

  it('uses the correct monetization type for each tier', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])

    const urls = f.mock.calls.map((c) => c[0] as string)
    expect(urls.some((u) => u.includes('with_watch_providers=8') && u.includes('flatrate'))).toBe(true)
    expect(urls.some((u) => u.includes('with_watch_providers=2') && u.includes('monetization_types=rent'))).toBe(true)
  })

  it('filters by the actor', async () => {
    const f = stubByProvider({})
    await getActorMovies(1532, ['netflix'])
    expect((f.mock.calls[0][0] as string)).toContain('with_cast=1532')
  })
})
