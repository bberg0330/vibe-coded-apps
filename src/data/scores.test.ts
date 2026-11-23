import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadScores, getCachedScores, rememberScores, resetScoresForTests } from './scores'

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

describe('rememberScores', () => {
  it('is readable immediately and makes no network call', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    rememberScores(1585, { critic: 90, audience: 77 })
    expect(getCachedScores(1585)).toEqual({ critic: 90, audience: 77 })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('getCachedScores legacy normalisation', () => {
  // `audience` is deliberately ABSENT rather than null on both of these.
  // A legacy entry never had the audience half looked up, and null would
  // claim otherwise — which callers read as a complete record, short-circuit
  // on, and therefore never fill in.
  it('normalises a bare-number entry to the critic field, leaving audience unknown', () => {
    resetScoresForTests({ '1585': 90 } as never)
    expect(getCachedScores(1585)).toEqual({ critic: 90 })
    expect('audience' in getCachedScores(1585)!).toBe(false)
  })

  it('normalises a bare-null entry to a known-absent critic, leaving audience unknown', () => {
    resetScoresForTests({ '1585': null } as never)
    expect(getCachedScores(1585)).toEqual({ critic: null })
    expect('audience' in getCachedScores(1585)!).toBe(false)
  })

  it('still reports a never-looked-up film as undefined', () => {
    resetScoresForTests({ '1585': null } as never)
    expect(getCachedScores(999)).toBeUndefined()
  })
})
