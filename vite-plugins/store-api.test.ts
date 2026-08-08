import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleOp } from './store-api'
import { readStore } from './store-file'
import { SeedRejectedError } from './store-ops'
import type { WatchEntry } from '../src/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mn-api-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const entry = (tmdbId: number, title: string): WatchEntry => ({
  watchedAt: new Date(2026, 0, tmdbId).toISOString(),
  movie: { tmdbId, title, year: 1998, posterPath: null, tomatometer: 90 },
  discoveredVia: null,
})

describe('handleOp', () => {
  it('persists an operation and returns the updated store', async () => {
    const store = await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') })

    expect(store.history).toHaveLength(1)
    expect((await readStore(dir)).history[0].movie.title).toBe('Rushmore')
  })

  it('CONCURRENT writes all survive', async () => {
    // The regression guard for this whole design. Ten simultaneous writes
    // must not read-modify-write over each other.
    const ops = Array.from({ length: 10 }, (_, i) =>
      handleOp(dir, { type: 'logWatch', entry: entry(i + 1, `Film ${i + 1}`) }),
    )
    await Promise.all(ops)

    const store = await readStore(dir)
    expect(store.history).toHaveLength(10)
    expect(new Set(store.history.map((e) => e.movie.tmdbId)).size).toBe(10)
  })

  it('a concurrent settings change and watch both survive', async () => {
    await Promise.all([
      handleOp(dir, { type: 'logWatch', entry: entry(1, 'Rushmore') }),
      handleOp(dir, { type: 'setService', key: 'netflix', enabled: false }),
    ])

    const store = await readStore(dir)
    expect(store.history).toHaveLength(1)
    expect(store.enabledServices).not.toContain('netflix')
  })

  it('rejects seed when history already exists', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Real') })

    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: ['netflix'] }),
    ).rejects.toBeInstanceOf(SeedRejectedError)
  })

  it('leaves the stored file untouched when an operation is rejected', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'Real') })
    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow()

    expect((await readStore(dir)).history).toHaveLength(1)
  })

  it('a rejected operation does not block later operations', async () => {
    await handleOp(dir, { type: 'logWatch', entry: entry(1, 'First') })
    await expect(
      handleOp(dir, { type: 'seed', history: [], enabledServices: [] }),
    ).rejects.toThrow()

    const store = await handleOp(dir, { type: 'logWatch', entry: entry(2, 'Second') })
    expect(store.history).toHaveLength(2)
  })
})
