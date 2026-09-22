import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadScores, getCachedScores, cacheScores, resetScoresForTests } from './scores'

beforeEach(() => {
  resetScoresForTests()
})

describe('loadScores', () => {
  it('fetches the shared cache and exposes it synchronously', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ '1585': { critic: 90 } }),
    }))

    await loadScores()
    expect(getCachedScores(1585)).toEqual({ critic: 90 })
  })

  it('distinguishes a cached null from an absent entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ '1': { critic: null } }),
    }))

    await loadScores()
    expect(getCachedScores(1)).toEqual({ critic: null })      // known: OMDb has no score
    expect(getCachedScores(999)).toBeUndefined() // unknown: never looked up
  })

  it('degrades to an empty cache when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadScores()).resolves.toBeUndefined()
    expect(getCachedScores(1)).toBeUndefined()
  })
})

describe('cacheScores', () => {
  it('is readable immediately, before the network write settles', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
    cacheScores(1585, { critic: 90 })
    expect(getCachedScores(1585)).toEqual({ critic: 90 })
  })

  it('posts the new scores to the shared cache', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', f)

    cacheScores(1585, { critic: 90 })
    await vi.waitFor(() => expect(f).toHaveBeenCalled())

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/scores')
    expect(JSON.parse(init.body)).toEqual({ '1585': { critic: 90 } })
  })

  it('keeps the scores in memory even if the write fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    cacheScores(1585, { critic: 90 })
    await new Promise((r) => setTimeout(r, 0))
    expect(getCachedScores(1585)).toEqual({ critic: 90 })
  })

  it('stores both critic and audience scores together', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
    cacheScores(1585, { critic: 90, audience: 77 })
    expect(getCachedScores(1585)).toEqual({ critic: 90, audience: 77 })
  })
})

describe('getCachedScores legacy normalisation', () => {
  it('normalises a bare-number entry to the critic field', () => {
    resetScoresForTests({ '1585': 90 } as never)
    expect(getCachedScores(1585)).toEqual({ critic: 90, audience: null })
  })

  it('normalises a bare-null entry to an empty-but-known result', () => {
    resetScoresForTests({ '1585': null } as never)
    expect(getCachedScores(1585)).toEqual({ critic: null, audience: null })
  })

  it('still reports a never-looked-up film as undefined', () => {
    resetScoresForTests({ '1585': null } as never)
    expect(getCachedScores(999)).toBeUndefined()
  })
})
