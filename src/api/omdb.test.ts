import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTomatometer, getRottenTomatoesScores } from './omdb'
import { getCachedScores, resetScoresForTests, type ScoreData } from '../data/scores'

/**
 * Stubs the batched `/api/omdb?ids=` endpoint with what the server would
 * answer for each film. A film left out of `known` is absent from the
 * answer — the server couldn't look it up right now.
 */
function stub(known: Record<number, ScoreData>) {
  const f = vi.fn().mockImplementation(async (url: string) => {
    const ids = new URL(url, 'http://localhost').searchParams.get('ids')!.split(',')
    const body: Record<string, ScoreData> = {}
    for (const id of ids) if (known[Number(id)]) body[id] = known[Number(id)]
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', f)
  return f
}

const idsOf = (f: ReturnType<typeof vi.fn>, call = 0) =>
  new URL(f.mock.calls[call][0] as string, 'http://localhost').searchParams.get('ids')

beforeEach(() => {
  resetScoresForTests()
})

describe('getRottenTomatoesScores', () => {
  it('asks the server by TMDB id, never with a key', async () => {
    const f = stub({ 1585: { critic: 90, audience: 77 } })

    expect(await getRottenTomatoesScores(1585)).toEqual({ critic: 90, audience: 77 })
    const url = new URL(f.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/omdb')
    expect(url.searchParams.get('ids')).toBe('1585')
    expect(url.searchParams.has('apikey')).toBe(false)
  })

  it('batches lookups made together into one request', async () => {
    const f = stub({ 1: { critic: 10, audience: 10 }, 2: { critic: 20, audience: 20 }, 3: { critic: 30, audience: 30 } })

    const results = await Promise.all([1, 2, 3, 2].map((id) => getTomatometer(id)))

    expect(results).toEqual([10, 20, 30, 20])
    expect(f).toHaveBeenCalledTimes(1)
    expect(idsOf(f)).toBe('1,2,3')
  })

  it('splits big batches to the server limit of 25', async () => {
    const f = stub({})
    await Promise.all(Array.from({ length: 30 }, (_, i) => getTomatometer(i + 1)))
    expect(f).toHaveBeenCalledTimes(2)
    expect(idsOf(f, 0)!.split(',')).toHaveLength(25)
    expect(idsOf(f, 1)!.split(',')).toHaveLength(5)
  })

  it('remembers answers, including "no rating", and does not ask again', async () => {
    const f = stub({ 1: { critic: 73, audience: 72 }, 2: { critic: null, audience: null } })

    await Promise.all([getTomatometer(1), getTomatometer(2)])
    expect(await getRottenTomatoesScores(2)).toEqual({ critic: null, audience: null })
    await getTomatometer(1)

    expect(f).toHaveBeenCalledTimes(1)
    expect(getCachedScores(1)).toEqual({ critic: 73, audience: 72 })
  })

  it('treats a film missing from the answer as unknown and asks again later', async () => {
    // The server leaves a film out when OMDb's quota is spent: that must not
    // be remembered as "no rating", or it stays unrated for good.
    const f = stub({})

    expect(await getRottenTomatoesScores(333)).toEqual({})
    expect(getCachedScores(333)).toBeUndefined()
    await getRottenTomatoesScores(333)

    expect(f).toHaveBeenCalledTimes(2)
  })

  it('never writes to the shared cache from the browser', async () => {
    const f = stub({ 1: { critic: 50, audience: 50 } })
    await getTomatometer(1)
    expect(f.mock.calls.every(([, init]) => !init || !init.method || init.method === 'GET')).toBe(true)
  })

  it('returns an empty result rather than throwing when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await getRottenTomatoesScores(444)).toEqual({})
    expect(await getTomatometer(444)).toBeNull()
  })

  it('returns an empty result on a server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }))
    expect(await getRottenTomatoesScores(222)).toEqual({})
  })
})

describe('legacy cache entries', () => {
  // Entries from before the { critic, audience } shape are a bare tomatometer
  // number or a bare null. The audience half was never looked up, so they
  // are re-fetched once.
  it('re-fetches a legacy bare-number entry to fill in the audience half', async () => {
    resetScoresForTests({ '949': 87 } as never)
    const f = stub({ 949: { critic: 84, audience: 83 } })
    expect(await getRottenTomatoesScores(949)).toEqual({ critic: 84, audience: 83 })
    await getRottenTomatoesScores(949)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps the legacy critic score when the re-fetch has no answer', async () => {
    resetScoresForTests({ '949': 87 } as never)
    stub({})
    expect(await getRottenTomatoesScores(949)).toEqual({ critic: 87 })
  })

  it('treats a legacy bare-null entry as "no score" rather than throwing', async () => {
    resetScoresForTests({ '247': null } as never)
    stub({})
    await expect(getTomatometer(247)).resolves.toBeNull()
  })
})
