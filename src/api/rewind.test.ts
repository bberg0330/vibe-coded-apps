import { describe, it, expect, vi, afterEach } from 'vitest'
import { getRewindYears, getRewindYear } from './rewind'

function answer(status: number, body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}
afterEach(() => vi.unstubAllGlobals())

const film = (tmdbId: number) => ({ tmdbId, title: `Film ${tmdbId}`, posterPath: null, releaseDate: null, voteAverage: 7, voteCount: 100, popularity: 1 })

describe('getRewindYears', () => {
  it('maps saved years, dropping malformed entries and non-integer ids', async () => {
    answer(200, { years: [
      { year: 2020, ids: [1, 2, 'x', 3.5], formerIds: [9] },
      { year: 2019 },                // no ids at all
      { year: 'nope', ids: [1] },    // not a year
      null,
    ] })
    expect(await getRewindYears()).toEqual([
      { year: 2020, ids: [1, 2], formerIds: [9] },
      { year: 2019, ids: [], formerIds: [] },
    ])
  })

  it.each([{}, { years: 'soon' }, null])('reads %j as "no years" rather than crashing', async (body) => {
    answer(200, body)
    expect(await getRewindYears()).toEqual([])
  })

  it('throws on a server error, so the screen can offer a retry instead of showing an empty grid', async () => {
    answer(500, {})
    await expect(getRewindYears()).rejects.toThrow('500')
  })
})

describe('getRewindYear', () => {
  it('asks for the year and returns its films with former ids', async () => {
    const f = answer(200, { films: [film(1), film(2)], formerIds: [7] })
    expect(await getRewindYear(2020)).toEqual({ films: [film(1), film(2)], formerIds: [7] })
    expect(f.mock.calls[0][0]).toBe('/api/rewind?year=2020')
  })

  it('returns null for a year that has not unlocked (404)', async () => {
    answer(404, {})
    expect(await getRewindYear(2030)).toBeNull()
  })

  it('keeps only well-formed films, and reads a malformed body as an empty list', async () => {
    answer(200, { films: [film(1), { title: 'no id' }, { tmdbId: 'x', title: 'bad id' }, null], formerIds: 'none' })
    expect(await getRewindYear(2020)).toEqual({ films: [film(1)], formerIds: [] })
    answer(200, null)
    expect(await getRewindYear(2020)).toEqual({ films: [], formerIds: [] })
  })

  it('throws on any other error, unlike 404', async () => {
    answer(502, {})
    await expect(getRewindYear(2020)).rejects.toThrow('502')
  })
})
