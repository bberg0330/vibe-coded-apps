import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadScores, getCachedScore, cacheScore, resetScoresForTests } from './scores'

beforeEach(() => {
  resetScoresForTests()
})

describe('loadScores', () => {
  it('fetches the shared cache and exposes it synchronously', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ '1585': 90 }),
    }))

    await loadScores()
    expect(getCachedScore(1585)).toBe(90)
  })

  it('distinguishes a cached null from an absent entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ '1': null }),
    }))

    await loadScores()
    expect(getCachedScore(1)).toBeNull()      // known: OMDb has no score
    expect(getCachedScore(999)).toBeUndefined() // unknown: never looked up
  })

  it('degrades to an empty cache when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadScores()).resolves.toBeUndefined()
    expect(getCachedScore(1)).toBeUndefined()
  })
})

describe('cacheScore', () => {
  it('is readable immediately, before the network write settles', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))
    cacheScore(1585, 90)
    expect(getCachedScore(1585)).toBe(90)
  })

  it('posts the new score to the shared cache', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', f)

    cacheScore(1585, 90)
    await vi.waitFor(() => expect(f).toHaveBeenCalled())

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/scores')
    expect(JSON.parse(init.body)).toEqual({ '1585': 90 })
  })

  it('keeps the score in memory even if the write fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    cacheScore(1585, 90)
    await new Promise((r) => setTimeout(r, 0))
    expect(getCachedScore(1585)).toBe(90)
  })
})
