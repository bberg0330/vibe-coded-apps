import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadStore, getStoreSnapshot, applyRemoteOp, resetStoreForTests, StoreUnavailableError,
} from './store'
import { emptyStore } from '../types'
import type { WatchEntry } from '../types'

const entry = (title: string): WatchEntry => ({
  watchedAt: '2026-08-08T20:00:00.000Z',
  movie: { tmdbId: 1, title, year: 1998, posterPath: null, tomatometer: 90, popcornmeter: null },
  discoveredVia: null,
})

function stubJson(body: unknown, ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body })
  vi.stubGlobal('fetch', f)
  return f
}

beforeEach(() => {
  resetStoreForTests()
})

describe('loadStore', () => {
  it('fetches the store and exposes it synchronously afterwards', async () => {
    const server = { ...emptyStore(), history: [entry('Rushmore')] }
    stubJson(server)

    await loadStore()

    expect(getStoreSnapshot().history[0].movie.title).toBe('Rushmore')
  })

  it('requests the store endpoint', async () => {
    const f = stubJson(emptyStore())
    await loadStore()
    expect(f.mock.calls[0][0]).toBe('/api/store')
  })

  it('throws StoreUnavailableError when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
  })

  it('throws StoreUnavailableError on a non-ok response', async () => {
    stubJson({ error: 'boom' }, false)
    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
  })

  it('throws StoreUnavailableError instead of assigning a malformed body', async () => {
    stubJson({ not: 'a store' })
    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
    // The bad body must not have been adopted as the snapshot.
    expect(getStoreSnapshot()).toEqual(emptyStore())
  })
})

describe('loadStore tolerates a pre-migration row missing nowWatching', () => {
  it('accepts a body with no nowWatching field, defaulting it to []', async () => {
    // Simulates a deploy landing before the Supabase `now_watching` column
    // migration is applied: the row is otherwise a valid Store shape, just
    // missing that field entirely.
    stubJson({ version: 2, history: [], enabledServices: [] })

    await loadStore()

    expect(getStoreSnapshot().nowWatching).toEqual([])
  })

  it('still rejects a body missing a genuinely required field (history)', async () => {
    stubJson({ version: 2, enabledServices: [], nowWatching: [] })

    await expect(loadStore()).rejects.toBeInstanceOf(StoreUnavailableError)
  })
})

describe('applyRemoteOp', () => {
  it('posts the operation and adopts the server response as truth', async () => {
    const updated = { ...emptyStore(), history: [entry('Rushmore')] }
    const f = stubJson(updated)

    await applyRemoteOp({ type: 'logWatch', entry: entry('Rushmore') })

    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/store')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).type).toBe('logWatch')
    expect(getStoreSnapshot().history).toHaveLength(1)
  })

  it('leaves the snapshot unchanged when the write fails', async () => {
    resetStoreForTests({ ...emptyStore(), history: [entry('Existing')] })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(
      applyRemoteOp({ type: 'logWatch', entry: entry('New') }),
    ).rejects.toThrow()

    expect(getStoreSnapshot().history.map((e) => e.movie.title)).toEqual(['Existing'])
  })

  it('surfaces the server error message on a rejected operation', async () => {
    stubJson({ error: 'Refusing to seed a store that already has history' }, false)

    await expect(
      applyRemoteOp({ type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow(/Refusing to seed/)
  })

  it('throws StoreUnavailableError instead of assigning a malformed body', async () => {
    resetStoreForTests({ ...emptyStore(), history: [entry('Existing')] })
    stubJson({ history: [] }) // missing enabledServices

    await expect(
      applyRemoteOp({ type: 'logWatch', entry: entry('New') }),
    ).rejects.toBeInstanceOf(StoreUnavailableError)
    // The bad body must not have been adopted as the snapshot.
    expect(getStoreSnapshot().history.map((e) => e.movie.title)).toEqual(['Existing'])
  })
})

describe('getStoreSnapshot', () => {
  it('returns an empty store before loading rather than throwing', () => {
    expect(getStoreSnapshot()).toEqual(emptyStore())
  })

  it('returns a copy, so a caller mutating it cannot corrupt the cache', async () => {
    stubJson({ ...emptyStore(), history: [entry('Rushmore')] })
    await loadStore()

    getStoreSnapshot().history.push(entry('Injected'))

    expect(getStoreSnapshot().history).toHaveLength(1)
  })
})
