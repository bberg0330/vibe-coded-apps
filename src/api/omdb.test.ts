import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTomatometer } from './omdb'

const omdbResponse = (title: string, year: string, rt?: string) => ({
  Response: 'True', Title: title, Year: year,
  Ratings: rt ? [
    { Source: 'Internet Movie Database', Value: '7.7/10' },
    { Source: 'Rotten Tomatoes', Value: rt },
  ] : [{ Source: 'Internet Movie Database', Value: '7.7/10' }],
})

function stub(body: unknown) {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  vi.stubEnv('VITE_OMDB_KEY', 'test-key')
})

describe('getTomatometer', () => {
  it('parses a percentage into a number', async () => {
    stub(omdbResponse('Lost in Translation', '2003', '95%'))
    expect(await getTomatometer(153, 'Lost in Translation', 2003)).toBe(95)
  })

  it('never sends the y parameter', async () => {
    const f = stub(omdbResponse('Rushmore', '1999', '90%'))
    await getTomatometer(1585, 'Rushmore', 1998)

    const url = f.mock.calls[0][0] as string
    expect(url).toContain('t=Rushmore')
    expect(new URL(url).searchParams.has('y')).toBe(false)
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
})
